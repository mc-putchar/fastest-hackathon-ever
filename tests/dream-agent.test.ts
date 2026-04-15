import test from "node:test";
import assert from "node:assert/strict";
import {
  appendTaskMessage,
  approveTask,
  createTaskFromMessage,
  rejectTask,
} from "@/app/lib/dream-agent";
import { syncTaskTelemetry } from "@/app/lib/langfuse";

test("uses the OpenAI planner when configured and keeps browser execution separate", async () => {
  const originalApiKey = process.env.OPENAI_API_KEY;
  const originalPlannerModel = process.env.OPENAI_PLANNER_MODEL;
  const originalPlanner = (globalThis as { __dreamAgentOpenAIPlanner?: unknown }).__dreamAgentOpenAIPlanner;

  process.env.OPENAI_API_KEY = "sk-test";
  process.env.OPENAI_PLANNER_MODEL = "gpt-5.4-mini";
  (globalThis as {
    __dreamAgentOpenAIPlanner?: (typeof globalThis)["__dreamAgentOpenAIPlanner"];
  }).__dreamAgentOpenAIPlanner = async () => ({
    taskType: "appointment_booking",
    targetService: "Berlin Burgeramt",
    riskLevel: "high",
    summary: "Model planner extracted the Burgeramt intake fields.",
    confidence: 0.96,
    input: {
      serviceType: "Anmeldung einer Wohnung",
      city: "Berlin",
      applicantName: null,
      applicantEmail: null,
      preferredDates: ["Earliest available"],
      notes: null,
      language: "en",
      executionTarget: "live",
    },
  });

  try {
    const task = await createTaskFromMessage("Book me the earliest live Burgeramt appointment for Anmeldung in Berlin.");

    assert.equal(task.runtime.plannerProvider, "openai");
    assert.equal(task.runtime.plannerModel, "gpt-5.4-mini");
    assert.equal(task.input.serviceType, "Anmeldung einer Wohnung");
    assert.equal(task.executionTarget, "live");
    assert.equal(task.runtime.executorKey, "burgeramt-live");
    assert.notEqual(task.runtime.executorKey, task.runtime.plannerModel);
  } finally {
    if (originalApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalApiKey;
    }

    if (originalPlannerModel === undefined) {
      delete process.env.OPENAI_PLANNER_MODEL;
    } else {
      process.env.OPENAI_PLANNER_MODEL = originalPlannerModel;
    }

    (globalThis as { __dreamAgentOpenAIPlanner?: unknown }).__dreamAgentOpenAIPlanner = originalPlanner;
  }
});

test("asks for missing fields before automation", async () => {
  const task = await createTaskFromMessage("I need a Burgeramt appointment in Berlin.");

  assert.equal(task.status, "needs_input");
  assert.equal(task.stage, "clarify");
  assert.match(task.nextPrompt ?? "", /full legal name/i);
  assert.equal(typeof task.runtime.traceId, "string");
  assert.notEqual(task.runtime.traceId.length, 0);
});

test("collects details and pauses at approval before submission", async () => {
  const initial = await createTaskFromMessage("Book me the earliest Burgeramt appointment for Anmeldung in Berlin.");
  const updated = await appendTaskMessage(
    initial.id,
    "My name is Alex Example and my email is alex@example.com.",
  );

  assert.equal(updated.status, "awaiting_approval");
  assert.equal(updated.stage, "approve");
  assert.equal(updated.approvals.some((approval) => approval.status === "pending"), true);
  assert.equal(updated.artifacts.some((artifact) => artifact.kind === "extracted_slot"), true);
  const extractedSlot = updated.artifacts.find((artifact) => artifact.kind === "extracted_slot");
  const draftSubmission = updated.artifacts.find((artifact) => artifact.title === "Draft submission");
  assert.ok(extractedSlot?.content);
  assert.equal(draftSubmission?.content?.includes(extractedSlot.content), true);
});

test("approval completes the controlled demo booking", async () => {
  const initial = await createTaskFromMessage("Book me the earliest Burgeramt appointment for Anmeldung in Berlin.");
  const ready = await appendTaskMessage(
    initial.id,
    "My name is Alex Example and my email is alex@example.com.",
  );
  const completed = await approveTask(ready.id);

  assert.equal(completed.status, "completed");
  assert.equal(completed.stage, "complete");
  assert.equal(completed.artifacts.some((artifact) => artifact.kind === "confirmation"), true);
});

test("rejecting approval keeps the task safe", async () => {
  const initial = await createTaskFromMessage("Book me the earliest Burgeramt appointment for Anmeldung in Berlin.");
  const ready = await appendTaskMessage(
    initial.id,
    "My name is Alex Example and my email is alex@example.com.",
  );
  const rejected = await rejectTask(ready.id);

  assert.equal(rejected.status, "blocked");
  assert.equal(rejected.approvals.some((approval) => approval.status === "rejected"), true);
});

test("no-slot simulation returns a blocked recovery path", async () => {
  const ready = await createTaskFromMessage(
    "Book me the earliest Burgeramt appointment for Anmeldung in Berlin. My name is Alex Example, my email is alex@example.com. simulate:no-slots",
  );

  assert.equal(ready.status, "blocked");
  assert.equal(ready.lastErrorCode, "no_appointments_available");
});

test("site-change simulation fails safely", async () => {
  const blocked = await createTaskFromMessage(
    "Book me the earliest Burgeramt appointment for Anmeldung in Berlin. My name is Alex Example, my email is alex@example.com. simulate:site-change",
  );

  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.lastErrorCode, "site_changed");
});

test("telemetry resyncs an evaluation when its value changes", async () => {
  const originalPublicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const originalSecretKey = process.env.LANGFUSE_SECRET_KEY;
  const originalBaseUrl = process.env.LANGFUSE_BASE_URL;
  const originalClient = (globalThis as { __dreamAgentLangfuseClient?: unknown }).__dreamAgentLangfuseClient;

  const scoreCalls: Array<{ name: string; value: number; comment?: string }> = [];

  process.env.LANGFUSE_PUBLIC_KEY = "pk-test";
  process.env.LANGFUSE_SECRET_KEY = "sk-test";
  process.env.LANGFUSE_BASE_URL = "https://example.com";
  (globalThis as { __dreamAgentLangfuseClient?: unknown }).__dreamAgentLangfuseClient = {
    getTraceUrl: async (traceId: string) => `https://example.com/traces/${traceId}`,
    score: {
      create: (payload: { name: string; value: number; comment?: string }) => {
        scoreCalls.push(payload);
      },
    },
    flush: async () => {},
  };

  try {
    const task = await createTaskFromMessage("I need a Burgeramt appointment in Berlin.");
    await syncTaskTelemetry(task);

    const requiredFieldEval = task.evaluations.find((evaluation) => evaluation.name === "Required-field detection");
    assert.ok(requiredFieldEval);
    requiredFieldEval.score = 1;
    requiredFieldEval.summary = "All required fields are present.";

    await syncTaskTelemetry(task);

    const requiredFieldCalls = scoreCalls.filter((payload) => payload.name === "required_field_detection");
    assert.equal(requiredFieldCalls.length, 2);
    assert.deepEqual(
      requiredFieldCalls.map((payload) => payload.value),
      [0.84, 1],
    );
  } finally {
    if (originalPublicKey === undefined) {
      delete process.env.LANGFUSE_PUBLIC_KEY;
    } else {
      process.env.LANGFUSE_PUBLIC_KEY = originalPublicKey;
    }

    if (originalSecretKey === undefined) {
      delete process.env.LANGFUSE_SECRET_KEY;
    } else {
      process.env.LANGFUSE_SECRET_KEY = originalSecretKey;
    }

    if (originalBaseUrl === undefined) {
      delete process.env.LANGFUSE_BASE_URL;
    } else {
      process.env.LANGFUSE_BASE_URL = originalBaseUrl;
    }

    (globalThis as { __dreamAgentLangfuseClient?: unknown }).__dreamAgentLangfuseClient = originalClient;
  }
});
