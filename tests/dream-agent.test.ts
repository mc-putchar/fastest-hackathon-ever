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
    targetService: "Medical appointment search",
    riskLevel: "high",
    summary: "Model planner extracted the medical appointment intake fields.",
    confidence: 0.96,
    input: {
      appointmentKind: "doctor",
      specialty: "Dermatology",
      insuranceType: "public",
      city: "Berlin",
      patientName: null,
      patientEmail: null,
      preferredDates: ["Earliest available"],
      unavailableWeekdays: [],
      notes: null,
      language: "en",
      executionTarget: "live",
    },
  });

  try {
    const task = await createTaskFromMessage("Book me the earliest live dermatologist appointment in Berlin.");

    assert.equal(task.runtime.plannerProvider, "openai");
    assert.equal(task.runtime.plannerModel, "gpt-5.4-mini");
    assert.equal(task.input.appointmentKind, "doctor");
    assert.equal(task.input.specialty, "Dermatology");
    assert.equal(task.input.insuranceType, "public");
    assert.equal(task.executionTarget, "live");
    assert.equal(task.runtime.executorKey, "appointment-hunter-live");
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

test("extracts doctor specialty and insurance heuristically", async () => {
  const task = await createTaskFromMessage("I need a dermatologist appointment in Berlin with public insurance.");

  assert.equal(task.input.appointmentKind, "doctor");
  assert.equal(task.input.specialty, "Dermatology");
  assert.equal(task.input.insuranceType, "public");
  assert.equal(task.status, "needs_input");
});

test("asks for missing dentist fields before automation without requesting a specialty", async () => {
  const task = await createTaskFromMessage("I need a dentist appointment in Berlin.");

  assert.equal(task.status, "needs_input");
  assert.equal(task.stage, "clarify");
  assert.match(task.nextPrompt ?? "", /insurance type/i);
  assert.match(task.nextPrompt ?? "", /full name/i);
  assert.match(task.nextPrompt ?? "", /email address/i);
  assert.doesNotMatch(task.nextPrompt ?? "", /specialty/i);
  assert.equal(typeof task.runtime.traceId, "string");
  assert.notEqual(task.runtime.traceId.length, 0);
});

test("doctor searches require a specialty before automation", async () => {
  const task = await createTaskFromMessage("I need a doctor appointment in Berlin.");

  assert.equal(task.status, "needs_input");
  assert.equal(task.stage, "clarify");
  assert.match(task.nextPrompt ?? "", /specialty/i);
});

test("live search completes with extracted marketplace matches and no approval", async () => {
  const originalSearch = (globalThis as { __dreamAgentLiveAppointmentSearch?: unknown }).__dreamAgentLiveAppointmentSearch;

  (globalThis as {
    __dreamAgentLiveAppointmentSearch?: (typeof globalThis)["__dreamAgentLiveAppointmentSearch"];
  }).__dreamAgentLiveAppointmentSearch = async () => ({
    providerKey: "doctolib",
    providerLabel: "Doctolib",
    searchUrl: "https://www.doctolib.de/hautarzt/berlin?insurance_sector=public",
    matches: [
      {
        providerName: "Praxis Dr. Lenz",
        providerType: "Hautarzt",
        address: "Friedrichstraße 89, 10117 Berlin",
        availabilityLabel: "Donnerstag 16 Apr. 09:15",
        href: "https://www.doctolib.de/hautarzt/berlin/praxis-dr-lenz",
        source: "Doctolib",
      },
      {
        providerName: "Hautzentrum Spree",
        providerType: "Hautarzt",
        address: "Warschauer Straße 10, 10243 Berlin",
        availabilityLabel: "Freitag 17 Apr. 08:40",
        href: "https://www.doctolib.de/hautarzt/berlin/hautzentrum-spree",
        source: "Doctolib",
      },
    ],
  });

  try {
    const ready = await createTaskFromMessage(
      "Find me the earliest live dermatologist appointment in Berlin with public insurance. My name is Alex Example and my email is alex@example.com.",
      "live",
    );

    assert.equal(ready.status, "completed");
    assert.equal(ready.stage, "complete");
    assert.equal(ready.approvals.some((approval) => approval.status === "pending"), false);
    assert.equal(ready.runtime.executorKey, "appointment-hunter-live");
    assert.equal(ready.runtime.selectedProvider, "Praxis Dr. Lenz");
    assert.equal(ready.artifacts.some((artifact) => artifact.title === "Best live appointment option"), true);
  } finally {
    (globalThis as { __dreamAgentLiveAppointmentSearch?: unknown }).__dreamAgentLiveAppointmentSearch = originalSearch;
  }
});

test("collects details and pauses at approval before submission", async () => {
  const initial = await createTaskFromMessage("Book me the earliest dentist appointment in Berlin.");
  const updated = await appendTaskMessage(
    initial.id,
    "My name is Alex Example, I have public insurance, and my email is alex@example.com.",
  );

  assert.equal(updated.status, "awaiting_approval");
  assert.equal(updated.stage, "approve");
  assert.equal(updated.approvals.some((approval) => approval.status === "pending"), true);
  assert.equal(updated.artifacts.some((artifact) => artifact.kind === "extracted_slot"), true);
  const extractedSlot = updated.artifacts.find((artifact) => artifact.kind === "extracted_slot");
  const draftSubmission = updated.artifacts.find((artifact) => artifact.title === "Draft booking review");
  assert.ok(extractedSlot?.content);
  assert.equal(draftSubmission?.content?.includes(extractedSlot.content), true);
});

test("follow-up constraints update the active goal and rerun slot selection", async () => {
  const initial = await createTaskFromMessage(
    "Book me the earliest dentist appointment in Berlin. My name is Alex Example, I have public insurance, and my email is alex@example.com.",
  );

  assert.equal(initial.status, "awaiting_approval");
  const firstApproval = initial.approvals.find((approval) => approval.status === "pending");
  assert.match(String(firstApproval?.payload?.selectedSlot ?? ""), /Tue,/);

  const updated = await appendTaskMessage(initial.id, "I can't make it on Tuesday.");
  const pendingApproval = updated.approvals.find((approval) => approval.status === "pending");
  const extractedSlot = updated.artifacts.find((artifact) => artifact.kind === "extracted_slot");

  assert.equal(updated.status, "awaiting_approval");
  assert.match(updated.goal, /Update: I can't make it on Tuesday\./);
  assert.deepEqual(updated.input.unavailableWeekdays, ["Tue"]);
  assert.match(String(pendingApproval?.payload?.selectedSlot ?? ""), /Wed,|Thu,|Fri,/);
  assert.doesNotMatch(String(pendingApproval?.payload?.selectedSlot ?? ""), /Tue,/);
  assert.match(String(extractedSlot?.content ?? ""), /Wed,|Thu,|Fri,/);
  assert.doesNotMatch(String(extractedSlot?.content ?? ""), /Tue,/);
});

test("approval completes the controlled demo booking", async () => {
  const initial = await createTaskFromMessage("Book me the earliest dentist appointment in Berlin.");
  const ready = await appendTaskMessage(
    initial.id,
    "My name is Alex Example, I have public insurance, and my email is alex@example.com.",
  );
  const completed = await approveTask(ready.id);

  assert.equal(completed.status, "completed");
  assert.equal(completed.stage, "complete");
  assert.equal(completed.artifacts.some((artifact) => artifact.kind === "confirmation"), true);
});

test("rejecting approval keeps the task safe", async () => {
  const initial = await createTaskFromMessage("Book me the earliest dentist appointment in Berlin.");
  const ready = await appendTaskMessage(
    initial.id,
    "My name is Alex Example, I have public insurance, and my email is alex@example.com.",
  );
  const rejected = await rejectTask(ready.id);

  assert.equal(rejected.status, "blocked");
  assert.equal(rejected.approvals.some((approval) => approval.status === "rejected"), true);
});

test("no-slot simulation returns a blocked recovery path", async () => {
  const ready = await createTaskFromMessage(
    "Book me the earliest dentist appointment in Berlin. My name is Alex Example, I have public insurance, my email is alex@example.com. simulate:no-slots",
  );

  assert.equal(ready.status, "blocked");
  assert.equal(ready.lastErrorCode, "no_appointments_available");
});

test("site-change simulation fails safely", async () => {
  const blocked = await createTaskFromMessage(
    "Book me the earliest dentist appointment in Berlin. My name is Alex Example, I have public insurance, my email is alex@example.com. simulate:site-change",
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
    const task = await createTaskFromMessage("I need a dentist appointment in Berlin.");
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
