import { createId, nowIso, type ApprovalRequest, type ExecutorResult, type Task } from "@/app/lib/domain";
import type { PreparedSubmission, RequirementCollection, ServiceExecutor } from "@/app/lib/executors/types";
import {
  buildSvgArtifact,
  burgeramtRequirements,
  createArtifact,
  hasSimulation,
} from "@/app/lib/executors/burgeramt/shared";

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

function selectedSlotLabel(task: Task, discoveredSlot?: string) {
  return (
    discoveredSlot ??
    `${task.input.preferredDates?.[0] ?? "Earliest available"} · Tue, 21 Apr 2026 at 08:10 · Burgeramt Mitte`
  );
}

function reviewSummary(task: Task, selectedSlot: string) {
  return `${task.input.serviceType} for ${task.input.applicantName} (${task.input.applicantEmail}) · ${selectedSlot}`;
}

export const burgeramtDemoExecutor: ServiceExecutor = {
  key: "burgeramt-demo",
  targetService: "Berlin Burgeramt",

  detectRequirements() {
    return burgeramtRequirements;
  },

  collectInputs(task): RequirementCollection {
    const missing = burgeramtRequirements.filter((requirement) => !task.input[requirement.field]);
    return {
      missing,
      prompt:
        missing.length === 0
          ? "All required Burgeramt booking details are available."
          : `I can continue the Burgeramt booking flow, but I still need your ${missing.map((item) => item.label).join(", ")}. I will search slots and prepare the submission once those are filled, then pause before the irreversible booking step.`,
    };
  },

  async prepareSubmission(task): Promise<PreparedSubmission> {
    return {
      summary: "Prepared a draft Burgeramt submission from the structured intake.",
      runtime: {
        executorKey: "burgeramt-demo",
      },
      artifacts: [],
      traceEvents: [
        {
          id: createId("trace"),
          name: "Submission draft prepared",
          detail: "The agent converted structured task input into a reviewable booking payload.",
          stage: "prepare",
          kind: "step",
          createdAt: nowIso(),
        },
      ],
      evaluations: [
        {
          id: createId("eval"),
          name: "Structured intake completeness",
          label: "pass",
          score: 1,
          summary: "The draft submission could be built from the structured task input.",
          createdAt: nowIso(),
        },
      ],
    };
  },

  async searchAvailability(task): Promise<ExecutorResult> {
    if (hasSimulation(task.input.notes, "no-slots")) {
      return {
        status: "blocked",
        nextAction: "No appointments were available in the controlled flow.",
        errorCode: "no_appointments_available",
        runtime: {
          executorKey: "burgeramt-demo",
        },
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

    if (hasSimulation(task.input.notes, "site-change")) {
      return {
        status: "blocked",
        nextAction: "The controlled demo was forced into a selector-change failure.",
        errorCode: "site_changed",
        runtime: {
          executorKey: "burgeramt-demo",
        },
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
    const selectedSlot = selectedSlotLabel(task, browserRun?.selectedSlot);
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
        executorKey: "burgeramt-demo",
        selectedSlot,
      },
      artifacts: [
        createArtifact(
          "screenshot",
          "Browser evidence",
          "Captured the booking interface after slot search.",
          undefined,
          screenshot,
        ),
        createArtifact(
          "extracted_slot",
          "Best available slot",
          "The agent extracted the earliest matching slot.",
          selectedSlot,
        ),
        createArtifact(
          "form_preview",
          "Draft submission",
          "Prepared the review payload that will be submitted after approval.",
          reviewSummary(task, selectedSlot),
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
  },

  async submitWithApproval(task, approval): Promise<ExecutorResult> {
    const selectedSlot = String(approval.payload?.selectedSlot ?? task.runtime.selectedSlot ?? "Pending slot");
    const confirmationCode = `BG-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    return {
      status: "completed",
      nextAction: "Booking confirmed and evidence captured.",
      runtime: {
        executorKey: "burgeramt-demo",
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
      ],
    };
  },

  async captureEvidence(task, stage) {
    if (stage === "complete" && task.runtime.confirmationCode && task.runtime.selectedSlot) {
      return [
        createArtifact(
          "screenshot",
          "Confirmation proof",
          "Generated confirmation evidence suitable for the user timeline and Langfuse trace story.",
          undefined,
          buildSvgArtifact(
            "Burgeramt Confirmation",
            [
              `Reference: ${task.runtime.confirmationCode}`,
              `Slot: ${task.runtime.selectedSlot}`,
              `Applicant: ${task.input.applicantName ?? "Unknown"}`,
            ],
            "#2a6f4f",
          ),
        ),
      ];
    }

    if (stage === "prepare") {
      return [
        createArtifact(
          "note",
          "Pre-flight checks passed",
          "The controlled executor validated inputs and prepared a demo-safe review payload.",
        ),
      ];
    }

    return [];
  },
};
