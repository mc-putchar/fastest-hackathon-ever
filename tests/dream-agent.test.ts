import test from "node:test";
import assert from "node:assert/strict";
import {
  appendTaskMessage,
  approveTask,
  createTaskFromMessage,
  rejectTask,
} from "@/app/lib/dream-agent";

test("asks for missing fields before automation", async () => {
  const task = await createTaskFromMessage("I need a Burgeramt appointment in Berlin.");

  assert.equal(task.status, "needs_input");
  assert.equal(task.stage, "clarify");
  assert.match(task.nextPrompt ?? "", /full legal name/i);
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
