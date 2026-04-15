import {
  nowIso,
  type ExecutionTarget,
  type Task,
  type TaskStage,
  type TaskStatus,
  type TimelineEvent,
  type TraceEvent,
} from "@/app/lib/domain";
import { getExecutor } from "@/app/lib/executors";
import { APPOINTMENT_HUNTER_LIVE_URL } from "@/app/lib/executors/appointment-hunter/shared";
import { ensureTaskTrace, hasLangfuseConfig, syncTaskTelemetry, withTaskObservation } from "@/app/lib/langfuse";
import { mergeTaskInput, planTaskUpdate, type PlannerDecision } from "@/app/lib/planner";
import { requireTask, saveTask } from "@/app/lib/task-store";

function createId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function addMessage(task: Task, role: Task["messages"][number]["role"], content: string) {
  task.messages.push({
    id: createId("message"),
    role,
    content,
    createdAt: nowIso(),
  });
}

function addTimeline(
  task: Task,
  stage: TaskStage,
  label: string,
  detail: string,
  tone: TimelineEvent["tone"] = "info",
) {
  task.timeline.unshift({
    id: createId("timeline"),
    label,
    detail,
    stage,
    tone,
    createdAt: nowIso(),
  });
}

function addTrace(
  task: Task,
  stage: TaskStage,
  name: string,
  detail: string,
  kind: TraceEvent["kind"],
) {
  task.traces.unshift({
    id: createId("trace"),
    name,
    detail,
    stage,
    kind,
    createdAt: nowIso(),
  });
}

function addEvaluation(task: Task, name: string, score: number, summary: string) {
  task.evaluations = task.evaluations
    .filter((evaluation) => evaluation.name !== name)
    .concat({
      id: createId("eval"),
      name,
      label: score >= 0.8 ? "pass" : score >= 0.5 ? "warn" : "fail",
      score,
      summary,
      createdAt: nowIso(),
    });
}

function applyPlannerDecision(task: Task, decision: PlannerDecision) {
  task.type = decision.taskType;
  task.riskLevel = decision.riskLevel;
  task.targetService = decision.targetService;
  task.input = mergeTaskInput(task.input, decision.inputPatch);
  task.executionTarget = task.input.executionTarget;
  task.runtime.plannerProvider = decision.provider;
  task.runtime.plannerModel = decision.model;
  task.runtime.plannerMode = decision.mode;
  task.runtime.plannerSummary = decision.summary;
  task.runtime.plannerLastError = decision.error;
}

async function updateTaskWithPlanner(task: Task, latestMessage: string, stage: Task["stage"]) {
  const decision = await withTaskObservation(
    task,
    stage === "intake" ? "dream-agent.plan-intake" : "dream-agent.plan-follow-up",
    stage,
    {
      latestMessage,
      plannerModel: process.env.OPENAI_PLANNER_MODEL ?? "gpt-5.4-mini",
      priorMessageCount: task.messages.length,
    },
    async () =>
      planTaskUpdate({
        latestMessage,
        task,
        messages: task.messages,
      }),
  );

  applyPlannerDecision(task, decision);
  addTrace(
    task,
    stage,
    "Planner updated structured input",
    `${decision.provider}:${decision.model} -> ${decision.summary}`,
    "decision",
  );
  addEvaluation(
    task,
    "Planner extraction",
    decision.confidence,
    decision.mode === "model"
      ? `Structured extraction came from ${decision.model}.`
      : decision.error
        ? `Model planner failed and the workflow fell back to heuristics: ${decision.error}`
        : "Structured extraction came from the local heuristic fallback.",
  );
}

async function buildBaseTask(message: string, executionTarget: ExecutionTarget) {
  const createdAt = nowIso();
  const task: Task = {
    id: createId("task"),
    type: "appointment_booking",
    status: "ready",
    stage: "intake",
    riskLevel: "high",
    targetService: "Medical appointment search",
    goal: message,
    createdAt,
    updatedAt: createdAt,
    executionTarget,
    input: {
      city: "Berlin",
      executionTarget,
      language: "en",
    },
    runtime: {
      traceId: "",
      liveUrl: APPOINTMENT_HUNTER_LIVE_URL,
      plannerProvider: process.env.OPENAI_API_KEY ? "openai" : "heuristic",
      plannerModel: process.env.OPENAI_API_KEY
        ? process.env.OPENAI_PLANNER_MODEL ?? "gpt-5.4-mini"
        : "heuristic-parser",
      plannerMode: process.env.OPENAI_API_KEY ? "model" : "fallback",
      traceExportState: hasLangfuseConfig() ? "pending" : "disabled",
      syncedEvaluationVersions: {},
    },
    messages: [],
    artifacts: [],
    approvals: [],
    timeline: [],
    traces: [],
    evaluations: [],
  };

  await ensureTaskTrace(task);
  addMessage(task, "user", message);
  await updateTaskWithPlanner(task, message, "intake");
  addTimeline(task, "intake", "Task created", "Captured the user goal and initialized the workflow.");
  addTrace(task, "intake", "Intent parsed", `Classified request as ${task.type}.`, "decision");
  addEvaluation(task, "Task classification", 1, "The planner mapped the request to appointment booking.");
  return task;
}

function updateTaskState(task: Task, status: TaskStatus, stage: TaskStage) {
  task.status = status;
  task.stage = stage;
  task.updatedAt = nowIso();
}

async function persistTask(task: Task) {
  await syncTaskTelemetry(task);
  return saveTask(task);
}

async function progressTask(task: Task) {
  return withTaskObservation(
    task,
    "dream-agent.progress-task",
    task.stage,
    {
      goal: task.goal,
      status: task.status,
    },
    async () => {
      task.executionTarget = task.input.executionTarget;
      const executor = getExecutor(task);
      task.targetService = executor.targetService;
      task.runtime.executorKey = executor.key;

      const requirements = executor.collectInputs(task);
      addEvaluation(
        task,
        "Required-field detection",
        requirements.missing.length === 0 ? 1 : 0.84,
        requirements.missing.length === 0
          ? "All required fields are present."
          : `Still waiting on ${requirements.missing.map((field) => field.label).join(", ")}.`,
      );

      if (requirements.missing.length > 0) {
        updateTaskState(task, "needs_input", "clarify");
        task.lastErrorCode = "missing_info";
        task.nextPrompt = requirements.prompt;
        addMessage(task, "agent", task.nextPrompt);
        addTimeline(task, "clarify", "Waiting for structured details", task.nextPrompt, "warning");
        addTrace(
          task,
          "clarify",
          "Missing fields detected",
          `Missing: ${requirements.missing.map((field) => field.field).join(", ")}`,
          "risk",
        );
        return persistTask(task);
      }

      updateTaskState(task, "running", "prepare");
      task.nextPrompt = undefined;
      task.lastErrorCode = undefined;
      addTimeline(
        task,
        "prepare",
        "Requirements complete",
        "All required fields were collected, so the agent is preparing browser execution.",
        "success",
      );

      const prepared = await withTaskObservation(
        task,
        "dream-agent.prepare-submission",
        "prepare",
        {
          executionTarget: task.executionTarget,
          appointmentKind: task.input.appointmentKind,
          specialty: task.input.specialty,
        },
        async () => executor.prepareSubmission(task),
      );

      task.artifacts = [...prepared.artifacts, ...(await executor.captureEvidence(task, "prepare")), ...task.artifacts];
      task.runtime = {
        ...task.runtime,
        ...prepared.runtime,
      };
      prepared.traceEvents?.forEach((event) => task.traces.unshift(event));
      prepared.evaluations?.forEach((evaluation) =>
        addEvaluation(task, evaluation.name, evaluation.score, evaluation.summary),
      );
      addTrace(task, "prepare", "Execution prepared", prepared.summary, "step");

      updateTaskState(task, "running", "execute");
      addTimeline(task, "execute", "Browser execution started", `Running the ${executor.key} executor.`);

      const result = await withTaskObservation(
        task,
        "dream-agent.search-availability",
        "execute",
        {
          executor: executor.key,
          executionTarget: task.executionTarget,
        },
        async () => executor.searchAvailability(task),
      );

      task.artifacts = [...result.artifacts, ...task.artifacts];
      task.runtime = {
        ...task.runtime,
        ...result.runtime,
      };
      result.traceEvents?.forEach((event) => task.traces.unshift(event));
      result.evaluations?.forEach((evaluation) =>
        addEvaluation(task, evaluation.name, evaluation.score, evaluation.summary),
      );

      if (result.status === "blocked") {
        updateTaskState(task, "blocked", "execute");
        task.lastErrorCode = result.errorCode;
        task.nextPrompt = result.nextAction;
        addMessage(task, "agent", result.nextAction);
        addTimeline(task, "execute", "Execution blocked safely", result.nextAction, "danger");
        addTrace(task, "execute", "Execution blocked", result.errorCode ?? result.nextAction, "risk");
        return persistTask(task);
      }

      if (result.approvalRequest) {
        task.approvals = task.approvals
          .filter((approval) => approval.status === "approved" || approval.status === "rejected")
          .concat(result.approvalRequest);
      }

      updateTaskState(task, "awaiting_approval", "approve");
      task.nextPrompt = result.nextAction;
      addMessage(task, "agent", result.approvalRequest?.summary ?? result.nextAction);
      addTimeline(task, "approve", "Approval requested", result.nextAction, "warning");
      addTrace(task, "approve", "Awaiting approval", result.nextAction, "risk");
      return persistTask(task);
    },
  );
}

export async function createTaskFromMessage(message: string, executionTarget: ExecutionTarget = "demo") {
  const task = await buildBaseTask(message, executionTarget);
  return progressTask(task);
}

export function getTaskOrThrow(taskId: string) {
  return requireTask(taskId);
}

export async function appendTaskMessage(taskId: string, message: string) {
  const task = requireTask(taskId);
  addMessage(task, "user", message);
  await updateTaskWithPlanner(task, message, "clarify");
  addTrace(task, "clarify", "User input merged", "The latest user message updated the structured task input.", "input");
  addTimeline(task, "clarify", "User replied", "Merged the new information into the task input model.");
  return progressTask(task);
}

export async function approveTask(taskId: string) {
  const task = requireTask(taskId);
  const approval = task.approvals.find((entry) => entry.status === "pending");
  if (!approval) {
    throw new Error("No pending approval found for this task.");
  }

  const executor = getExecutor(task);
  approval.status = "approved";
  task.runtime.executorKey = executor.key;
  updateTaskState(task, "running", "approve");
  addTimeline(task, "approve", "Approval granted", "The user approved the final submission step.", "success");
  addTrace(task, "approve", "Approval received", `Executing ${approval.action}.`, "decision");

  return withTaskObservation(
    task,
    "dream-agent.submit-with-approval",
    "approve",
    {
      action: approval.action,
      executor: executor.key,
    },
    async () => {
      const result = await executor.submitWithApproval(task, approval);
      task.artifacts = [...result.artifacts, ...task.artifacts];
      task.runtime = {
        ...task.runtime,
        ...result.runtime,
      };

      if (result.status === "blocked") {
        updateTaskState(task, "blocked", "approve");
        task.lastErrorCode = result.errorCode;
        task.nextPrompt = result.nextAction;
        addMessage(task, "agent", result.nextAction);
        addTimeline(task, "approve", "Submission stopped", result.nextAction, "danger");
        return persistTask(task);
      }

      task.artifacts = [...(await executor.captureEvidence(task, "complete")), ...task.artifacts];
      updateTaskState(task, "completed", "complete");
      task.nextPrompt = "The task is complete. Evidence and confirmation are available below.";
      addMessage(task, "agent", task.nextPrompt);
      addTimeline(task, "complete", "Task completed", result.nextAction, "success");
      addTrace(task, "complete", "Completion recorded", result.nextAction, "output");
      addEvaluation(task, "Approval safety", 1, "No irreversible action happened before the user approval.");
      return persistTask(task);
    },
  );
}

export async function rejectTask(taskId: string) {
  const task = requireTask(taskId);
  const approval = task.approvals.find((entry) => entry.status === "pending");
  if (!approval) {
    throw new Error("No pending approval found for this task.");
  }

  approval.status = "rejected";
  updateTaskState(task, "blocked", "approve");
  task.nextPrompt = "The final submission was not executed. You can adjust the input and run another attempt.";
  addMessage(task, "agent", task.nextPrompt);
  addTimeline(task, "approve", "Approval rejected", task.nextPrompt, "warning");
  addTrace(task, "approve", "Approval rejected", "The workflow stayed paused after the user declined submission.", "risk");
  addEvaluation(task, "Approval safety", 1, "The workflow remained non-destructive after rejection.");
  return persistTask(task);
}
