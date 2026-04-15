import {
  createId,
  nowIso,
  type ApprovalRequest,
  type ExecutionTarget,
  type ExecutorResult,
  type Task,
  type TaskArtifact,
  type TaskEvaluation,
  type TaskInput,
  type TaskStage,
  type TaskStatus,
  type TaskType,
  type TimelineEvent,
  type TraceEvent,
} from "@/app/lib/domain";
import { requireTask, saveTask } from "@/app/lib/task-store";

const BURGERAMT_LIVE_URL = "https://service.berlin.de/terminvereinbarung/";

const serviceKeywords: Record<string, string> = {
  anmeldung: "Anmeldung einer Wohnung",
  wohnung: "Anmeldung einer Wohnung",
  personalausweis: "Personalausweis beantragen",
  reisepass: "Reisepass beantragen",
  passport: "Reisepass beantragen",
};

const requiredInputPrompts: Record<string, string> = {
  applicantName: "full legal name",
  applicantEmail: "confirmation email",
  serviceType: "service type",
};

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

function buildSvgArtifact(title: string, lines: string[], accent: string) {
  const rows = lines
    .map(
      (line, index) =>
        `<text x="40" y="${110 + index * 34}" fill="#fdf7f0" font-family="Helvetica, Arial, sans-serif" font-size="22">${line}</text>`,
    )
    .join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="700" viewBox="0 0 1200 700"><rect width="1200" height="700" fill="#1d2d44" /><rect x="26" y="26" width="1148" height="648" rx="32" fill="${accent}" opacity="0.24" /><text x="40" y="72" fill="#fdf7f0" font-family="Helvetica, Arial, sans-serif" font-size="36">${title}</text>${rows}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function createArtifact(kind: TaskArtifact["kind"], title: string, summary: string, content?: string, href?: string) {
  return {
    id: createId("artifact"),
    kind,
    title,
    summary,
    content,
    href,
    createdAt: nowIso(),
  } satisfies TaskArtifact;
}

function extractInput(message: string, previous: TaskInput): TaskInput {
  const normalized = message.toLowerCase();
  const next = { ...previous };
  const emailMatch = message.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (emailMatch) {
    next.applicantEmail = emailMatch[0];
  }

  const nameMatch = message.match(/(?:my name is|i am|i'm)\s+([a-z][a-z\s'-]+)/i);
  if (nameMatch) {
    next.applicantName = nameMatch[1].trim().replace(/\.$/, "");
  }

  if (normalized.includes("berlin")) {
    next.city = "Berlin";
  }

  for (const [keyword, serviceType] of Object.entries(serviceKeywords)) {
    if (normalized.includes(keyword)) {
      next.serviceType = serviceType;
    }
  }

  if (normalized.includes("earliest")) {
    next.preferredDates = ["Earliest available"];
  }

  if (normalized.includes("simulate:")) {
    next.notes = [next.notes, message.match(/simulate:[a-z-]+/gi)?.join(", ")].filter(Boolean).join(", ");
  }

  if (normalized.includes(" live ")) {
    next.executionTarget = "live";
  }

  return next;
}

function classifyTask(message: string): TaskType {
  const normalized = message.toLowerCase();
  if (
    normalized.includes("appointment") ||
    normalized.includes("burgeramt") ||
    normalized.includes("anmeldung")
  ) {
    return "appointment_booking";
  }

  return "appointment_booking";
}

function detectMissingFields(input: TaskInput) {
  const missing = [];
  if (!input.applicantName) {
    missing.push("applicantName");
  }
  if (!input.applicantEmail) {
    missing.push("applicantEmail");
  }
  if (!input.serviceType) {
    missing.push("serviceType");
  }
  return missing;
}

function clarificationPrompt(task: Task, missing: string[]) {
  const fields = missing.map((field) => requiredInputPrompts[field] ?? field).join(", ");
  return `I can continue the ${task.targetService} booking flow, but I still need your ${fields}. I will search and draft the submission once those are filled, then pause before the irreversible booking step.`;
}

function buildBaseTask(message: string, executionTarget: ExecutionTarget) {
  const createdAt = nowIso();
  const type = classifyTask(message);
  const input = extractInput(message, {
    city: "Berlin",
    executionTarget,
    language: "en",
  });
  const task: Task = {
    id: createId("task"),
    type,
    status: "ready",
    stage: "intake",
    riskLevel: "high",
    targetService: "Berlin Burgeramt",
    goal: message,
    createdAt,
    updatedAt: createdAt,
    executionTarget,
    input,
    runtime: {
      traceId: createId("trace-run"),
      liveUrl: BURGERAMT_LIVE_URL,
    },
    messages: [],
    artifacts: [],
    approvals: [],
    timeline: [],
    traces: [],
    evaluations: [],
  };

  addMessage(task, "user", message);
  addTimeline(task, "intake", "Task created", "Captured the user goal and initialized the workflow.");
  addTrace(task, "intake", "Intent parsed", `Classified request as ${type}.`, "decision");
  addEvaluation(task, "Task classification", 1, "The initial classifier mapped the request to appointment booking.");
  return task;
}

function updateTaskState(task: Task, status: TaskStatus, stage: TaskStage) {
  task.status = status;
  task.stage = stage;
  task.updatedAt = nowIso();
}

async function maybeProbeLangfuse(task: Task, stage: TaskStage, detail: string) {
  if (!process.env.LANGFUSE_PUBLIC_KEY || !process.env.LANGFUSE_SECRET_KEY) {
    return;
  }

  addTrace(
    task,
    stage,
    "Langfuse export ready",
    `${detail} Trace ${task.runtime.traceId} can be mirrored to Langfuse once keys are configured in the runtime.`,
    "step",
  );
}

async function tryDemoPlaywright(task: Task) {
  try {
    const { chromium } = await import("playwright");
    const baseUrl = process.env.APP_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:3000";
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    await page.goto(`${baseUrl}/demo/burgeramt`, { waitUntil: "networkidle", timeout: 4_000 });
    if (task.input.serviceType) {
      await page.selectOption('[data-testid="service-select"]', { label: task.input.serviceType });
    }
    if (task.input.applicantName) {
      await page.fill('[data-testid="applicant-name"]', task.input.applicantName);
    }
    if (task.input.applicantEmail) {
      await page.fill('[data-testid="applicant-email"]', task.input.applicantEmail);
    }
    await page.click('[data-testid="search-slots"]');
    await page.waitForSelector('[data-testid="slot-option-0"]', { timeout: 4_000 });

    const selectedSlot = await page.locator('[data-testid="slot-option-0"]').textContent();
    await page.click('[data-testid="slot-option-0"]');
    const screenshot = await page.screenshot({ type: "png" });
    await browser.close();

    if (!selectedSlot) {
      return null;
    }

    return {
      selectedSlot,
      screenshot: `data:image/png;base64,${screenshot.toString("base64")}`,
    };
  } catch {
    return null;
  }
}

async function searchDemoAvailability(task: Task): Promise<ExecutorResult> {
  const notes = task.input.notes?.toLowerCase() ?? "";
  if (notes.includes("simulate:no-slots")) {
    return {
      status: "blocked",
      nextAction: "No appointments were available in the controlled flow.",
      errorCode: "no_appointments_available",
      artifacts: [
        createArtifact(
          "note",
          "No appointments found",
          "The demo executor simulated a zero-availability response so the no-slots recovery path can be demonstrated.",
          "Try a retry/watch pattern or switch to a different district.",
        ),
      ],
    };
  }

  if (notes.includes("simulate:site-change")) {
    return {
      status: "blocked",
      nextAction: "The controlled demo was forced into a selector-change failure.",
      errorCode: "site_changed",
      artifacts: [
        createArtifact(
          "note",
          "Selector drift detected",
          "The flow stopped safely instead of guessing after a simulated markup change.",
        ),
      ],
    };
  }

  const browserRun = await tryDemoPlaywright(task);
  const selectedSlot =
    browserRun?.selectedSlot ??
    `${task.input.preferredDates?.[0] ?? "Earliest available"} · Tue, 21 Apr 2026 at 08:10 · Burgeramt Mitte`;
  const screenshot =
    browserRun?.screenshot ??
    buildSvgArtifact(
      "Controlled Burgeramt Search",
      [
        `Service: ${task.input.serviceType ?? "Anmeldung einer Wohnung"}`,
        `Applicant: ${task.input.applicantName ?? "Pending"}`,
        `Slot: ${selectedSlot}`,
      ],
      "#0b8f8c",
    );

  const approvalRequest: ApprovalRequest = {
    id: createId("approval"),
    taskId: task.id,
    action: "submit_burgeramt_booking",
    summary: `I found a bookable slot for ${selectedSlot}. Approve the final submission?`,
    userImpact:
      "Approving this will confirm a real appointment booking in the controlled flow and reserve the selected slot.",
    expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    status: "pending",
    payload: {
      selectedSlot,
      mode: "demo",
    },
  };

  return {
    status: "awaiting_approval",
    nextAction: "Await user approval before confirming the booking.",
    approvalRequest,
    runtime: {
      selectedSlot,
    },
    artifacts: [
      createArtifact("screenshot", "Browser evidence", "Captured the booking interface after slot search.", undefined, screenshot),
      createArtifact("extracted_slot", "Best available slot", "The agent extracted the earliest matching slot.", selectedSlot),
      createArtifact(
        "form_preview",
        "Draft submission",
        "Prepared the review payload that will be submitted after approval.",
        `${task.input.serviceType} for ${task.input.applicantName} (${task.input.applicantEmail})`,
      ),
    ],
    traceEvents: [
      {
        id: createId("trace"),
        name: "Slot extracted",
        detail: `Selected slot ${selectedSlot} from the controlled Burgeramt search results.`,
        stage: "execute",
        kind: "output",
        createdAt: nowIso(),
      },
    ],
    evaluations: [
      {
        id: createId("eval"),
        name: "Slot extraction",
        label: "pass",
        score: 1,
        summary: "The executor surfaced a valid slot and converted it into an approval candidate.",
        createdAt: nowIso(),
      },
      {
        id: createId("eval"),
        name: "Approval safety",
        label: "pass",
        score: 1,
        summary: "The workflow paused before the irreversible booking step.",
        createdAt: nowIso(),
      },
    ],
  };
}

async function searchLiveAvailability(task: Task): Promise<ExecutorResult> {
  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(BURGERAMT_LIVE_URL, { waitUntil: "domcontentloaded", timeout: 8_000 });
    const screenshot = await page.screenshot({ type: "png", fullPage: true });
    const title = await page.title();
    await browser.close();

    return {
      status: "blocked",
      nextAction:
        "The live portal was reached and captured, but the flow intentionally stops before unsafe selector assumptions are made.",
      errorCode: "manual_follow_up_required",
      runtime: {
        liveUrl: BURGERAMT_LIVE_URL,
      },
      artifacts: [
        createArtifact(
          "screenshot",
          "Live portal probe",
          `Reached the live Burgeramt portal titled "${title}" and captured the current state for selector tuning.`,
          undefined,
          `data:image/png;base64,${screenshot.toString("base64")}`,
        ),
        createArtifact(
          "note",
          "Live flow handoff",
          "This proves browser reachability against a real public service, while keeping the hackathon path safe and resilient.",
          BURGERAMT_LIVE_URL,
        ),
      ],
    };
  } catch {
    return {
      status: "blocked",
      nextAction: "Unable to reach the live portal or launch Playwright in the current environment.",
      errorCode: "playwright_unavailable",
      artifacts: [
        createArtifact(
          "note",
          "Live execution unavailable",
          "Switch to the controlled demo mode for the stable end-to-end happy path, or configure Playwright plus network access for live probing.",
        ),
      ],
    };
  }
}

async function searchAvailability(task: Task) {
  return task.executionTarget === "live" ? searchLiveAvailability(task) : searchDemoAvailability(task);
}

async function submitDemoBooking(task: Task, approval: ApprovalRequest): Promise<ExecutorResult> {
  const selectedSlot = String(approval.payload?.selectedSlot ?? task.runtime.selectedSlot ?? "Pending slot");
  const confirmationCode = `BG-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  return {
    status: "completed",
    nextAction: "Booking confirmed and evidence captured.",
    runtime: {
      selectedSlot,
      confirmationCode,
    },
    artifacts: [
      createArtifact(
        "confirmation",
        "Booking confirmation",
        "The controlled demo has moved through the final confirmation step.",
        `${confirmationCode} · ${selectedSlot}`,
      ),
      createArtifact(
        "screenshot",
        "Confirmation proof",
        "Generated confirmation evidence suitable for the user timeline and Langfuse trace story.",
        undefined,
        buildSvgArtifact(
          "Burgeramt Confirmation",
          [`Reference: ${confirmationCode}`, `Slot: ${selectedSlot}`, `Applicant: ${task.input.applicantName ?? "Unknown"}`],
          "#2a6f4f",
        ),
      ),
    ],
  };
}

async function submitWithApproval(task: Task, approval: ApprovalRequest) {
  if (task.executionTarget === "live") {
    return {
      status: "blocked",
      nextAction: "The live flow still requires a human-supervised selector pass before final submission is enabled.",
      errorCode: "manual_follow_up_required",
      artifacts: [
        createArtifact(
          "note",
          "Live submission intentionally disabled",
          "The prototype stops here to avoid brittle or unsafe automated submission against a real public service.",
        ),
      ],
    } satisfies ExecutorResult;
  }

  return submitDemoBooking(task, approval);
}

async function progressTask(task: Task) {
  const missingFields = detectMissingFields(task.input);
  addEvaluation(
    task,
    "Required-field detection",
    missingFields.length === 0 ? 1 : 0.84,
    missingFields.length === 0
      ? "All required fields are present."
      : `Still waiting on ${missingFields.map((field) => requiredInputPrompts[field]).join(", ")}.`,
  );

  if (missingFields.length > 0) {
    updateTaskState(task, "needs_input", "clarify");
    task.lastErrorCode = "missing_info";
    task.nextPrompt = clarificationPrompt(task, missingFields);
    addMessage(task, "agent", task.nextPrompt);
    addTimeline(task, "clarify", "Waiting for structured details", task.nextPrompt, "warning");
    addTrace(task, "clarify", "Missing fields detected", `Missing: ${missingFields.join(", ")}`, "risk");
    await maybeProbeLangfuse(task, "clarify", "Clarification stage captured.");
    return saveTask(task);
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
  addTrace(task, "prepare", "Execution prepared", "Ready to launch the browser executor.", "step");

  updateTaskState(task, "running", "execute");
  addTimeline(task, "execute", "Browser execution started", `Running the ${task.executionTarget} Burgeramt executor.`);

  const result = await searchAvailability(task);
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
    await maybeProbeLangfuse(task, "execute", "Blocked execution captured.");
    return saveTask(task);
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
  await maybeProbeLangfuse(task, "approve", "Approval checkpoint captured.");
  return saveTask(task);
}

export async function createTaskFromMessage(message: string, executionTarget: ExecutionTarget = "demo") {
  const task = buildBaseTask(message, executionTarget);
  return progressTask(task);
}

export function getTaskOrThrow(taskId: string) {
  return requireTask(taskId);
}

export async function appendTaskMessage(taskId: string, message: string) {
  const task = requireTask(taskId);
  addMessage(task, "user", message);
  task.input = extractInput(message, task.input);
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

  approval.status = "approved";
  updateTaskState(task, "running", "approve");
  addTimeline(task, "approve", "Approval granted", "The user approved the final submission step.", "success");
  addTrace(task, "approve", "Approval received", `Executing ${approval.action}.`, "decision");

  const result = await submitWithApproval(task, approval);
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
    return saveTask(task);
  }

  updateTaskState(task, "completed", "complete");
  task.nextPrompt = "The task is complete. Evidence and confirmation are available below.";
  addMessage(task, "agent", task.nextPrompt);
  addTimeline(task, "complete", "Task completed", result.nextAction, "success");
  addTrace(task, "complete", "Completion recorded", result.nextAction, "output");
  addEvaluation(task, "Approval safety", 1, "No irreversible action happened before the user approval.");
  await maybeProbeLangfuse(task, "complete", "Completion exported.");
  return saveTask(task);
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
  return saveTask(task);
}
