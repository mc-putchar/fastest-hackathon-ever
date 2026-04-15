import { earliestAppointmentMatch } from "@/app/lib/appointment-demo-data";
import {
  createId,
  nowIso,
  type ApprovalRequest,
  type ExecutorResult,
  type Task,
  type WeekdayCode,
} from "@/app/lib/domain";
import type { PreparedSubmission, RequirementCollection, ServiceExecutor } from "@/app/lib/executors/types";
import {
  appointmentHunterRequirements,
  buildSvgArtifact,
  createArtifact,
  hasSimulation,
  missingAppointmentRequirements,
} from "@/app/lib/executors/appointment-hunter/shared";

async function tryDemoPlaywright(task: Task) {
  try {
    const { chromium } = await import("playwright");
    const baseUrl = process.env.APP_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:3000";
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    await page.goto(`${baseUrl}/demo/appointments`, { waitUntil: "networkidle", timeout: 4_000 });
    if (task.input.appointmentKind) {
      await page.selectOption('[data-testid="appointment-kind-select"]', task.input.appointmentKind);
    }
    if (task.input.appointmentKind === "doctor" && task.input.specialty) {
      await page.selectOption('[data-testid="specialty-select"]', { label: task.input.specialty });
    }
    if (task.input.insuranceType) {
      await page.selectOption('[data-testid="insurance-select"]', task.input.insuranceType);
    }
    if (task.input.patientName) {
      await page.fill('[data-testid="patient-name"]', task.input.patientName);
    }
    if (task.input.patientEmail) {
      await page.fill('[data-testid="patient-email"]', task.input.patientEmail);
    }
    await page.click('[data-testid="search-appointments"]');
    await page.waitForSelector('[data-testid="provider-card-0"]', { timeout: 4_000 });

    const providerCard = page.locator('[data-testid="provider-card-0"]');
    const slotButton = page.locator('[data-testid="slot-option-0"]');
    const providerName = await providerCard.getAttribute("data-provider-name");
    const selectedSlot = (await slotButton.getAttribute("data-slot-label")) ?? (await slotButton.textContent());
    await slotButton.click();
    const screenshot = await page.screenshot({ type: "png" });
    await browser.close();

    if (!providerName || !selectedSlot) {
      return null;
    }

    return {
      providerName,
      selectedSlot,
      screenshot: `data:image/png;base64,${screenshot.toString("base64")}`,
    };
  } catch {
    return null;
  }
}

function reviewSummary(task: Task, providerName: string, selectedSlot: string) {
  const label = task.input.appointmentKind === "dentist" ? "Dentist visit" : `${task.input.specialty} visit`;
  return `${label} for ${task.input.patientName} (${task.input.patientEmail}) · ${providerName} · ${selectedSlot}`;
}

function slotWeekday(label: string) {
  return label.split(",", 1)[0] as WeekdayCode;
}

export const appointmentHunterDemoExecutor: ServiceExecutor = {
  key: "appointment-hunter-demo",
  targetService: "Medical appointment search",

  detectRequirements() {
    return appointmentHunterRequirements;
  },

  collectInputs(task): RequirementCollection {
    const missing = missingAppointmentRequirements(task);
    return {
      missing,
      prompt:
        missing.length === 0
          ? "All required appointment-search details are available."
          : `I can continue the appointment hunter flow, but I still need your ${missing.map((item) => item.label).join(", ")}. I will search providers, prepare the booking summary, and pause before the irreversible confirmation step.`,
    };
  },

  async prepareSubmission(task): Promise<PreparedSubmission> {
    return {
      summary: "Prepared a draft medical appointment search from the structured intake.",
      runtime: {
        executorKey: "appointment-hunter-demo",
      },
      artifacts: [],
      traceEvents: [
        {
          id: createId("trace"),
          name: "Search draft prepared",
          detail: "The agent converted structured task input into a reviewable appointment-search payload.",
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
          summary: "The appointment search could be prepared from the structured task input.",
          createdAt: nowIso(),
        },
      ],
    };
  },

  async searchAvailability(task): Promise<ExecutorResult> {
    if (hasSimulation(task.input.notes, "no-slots")) {
      return {
        status: "blocked",
        nextAction: "No matching appointments were available in the controlled marketplace flow.",
        errorCode: "no_appointments_available",
        runtime: {
          executorKey: "appointment-hunter-demo",
        },
        artifacts: [
          createArtifact(
            "note",
            "No appointments found",
            "The demo executor simulated a zero-availability response so the recovery path can be demonstrated.",
            "Try widening the insurance, specialty, or time preference.",
          ),
        ],
      };
    }

    if (hasSimulation(task.input.notes, "site-change")) {
      return {
        status: "blocked",
        nextAction: "The controlled marketplace was forced into a selector-change failure.",
        errorCode: "site_changed",
        runtime: {
          executorKey: "appointment-hunter-demo",
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

    const matched = earliestAppointmentMatch({
      appointmentKind: task.input.appointmentKind,
      specialty: task.input.specialty,
      insuranceType: task.input.insuranceType,
      unavailableWeekdays: task.input.unavailableWeekdays,
    });

    if (!matched) {
      return {
        status: "blocked",
        nextAction: "No matching providers were available for the current filters.",
        errorCode: "no_appointments_available",
        runtime: {
          executorKey: "appointment-hunter-demo",
        },
        artifacts: [
          createArtifact(
            "note",
            "No providers matched",
            "The controlled marketplace did not have a provider that matched the requested appointment type, specialty, and insurance.",
          ),
        ],
      };
    }

    const browserRun = await tryDemoPlaywright(task);
    const browserSlotAllowed =
      browserRun?.selectedSlot &&
      !task.input.unavailableWeekdays?.includes(slotWeekday(browserRun.selectedSlot));
    const selectedProvider = browserSlotAllowed ? browserRun.providerName : matched.provider.name;
    const selectedSlot = browserSlotAllowed ? browserRun.selectedSlot : matched.slot.label;
    const screenshot =
      (browserSlotAllowed ? browserRun?.screenshot : undefined) ??
      buildSvgArtifact(
        "Controlled Appointment Search",
        [
          `Type: ${task.input.appointmentKind ?? "doctor"}`,
          `Specialty: ${task.input.specialty ?? "Not needed"}`,
          `Insurance: ${task.input.insuranceType ?? "public"}`,
          `Provider: ${selectedProvider}`,
          `Slot: ${selectedSlot}`,
        ],
        "#0b8f8c",
      );

    const approvalRequest: ApprovalRequest = {
      id: createId("approval"),
      taskId: task.id,
      action: "submit_appointment_booking",
      summary: `I found an appointment at ${selectedProvider} for ${selectedSlot}. Approve the booking handoff?`,
      userImpact:
        "Approving this will confirm the selected appointment in the controlled flow and reserve the slot.",
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      status: "pending",
      payload: {
        providerName: selectedProvider,
        selectedSlot,
        appointmentKind: task.input.appointmentKind,
        mode: "demo",
      },
    };

    return {
      status: "awaiting_approval",
      nextAction: "Await user approval before confirming the appointment booking.",
      approvalRequest,
      runtime: {
        executorKey: "appointment-hunter-demo",
        selectedProvider,
        selectedSlot,
      },
      artifacts: [
        createArtifact(
          "screenshot",
          "Browser evidence",
          "Captured the appointment marketplace after the provider search.",
          undefined,
          screenshot,
        ),
        createArtifact(
          "extracted_slot",
          "Best available appointment",
          "The agent extracted the earliest matching provider and slot.",
          `${selectedProvider} · ${selectedSlot}`,
        ),
        createArtifact(
          "form_preview",
          "Draft booking review",
          "Prepared the booking review that will be confirmed after approval.",
          reviewSummary(task, selectedProvider, selectedSlot),
        ),
      ],
      traceEvents: [
        {
          id: createId("trace"),
          name: "Appointment extracted",
          detail: `Selected ${selectedProvider} at ${selectedSlot} from the controlled marketplace results.`,
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
          summary: "The executor surfaced a valid provider and appointment slot for approval.",
          createdAt: nowIso(),
        },
        {
          id: createId("eval"),
          name: "Approval safety",
          label: "pass",
          score: 1,
          summary: "The workflow paused before the irreversible confirmation step.",
          createdAt: nowIso(),
        },
      ],
    };
  },

  async submitWithApproval(task, approval): Promise<ExecutorResult> {
    const selectedProvider = String(approval.payload?.providerName ?? task.runtime.selectedProvider ?? "Pending provider");
    const selectedSlot = String(approval.payload?.selectedSlot ?? task.runtime.selectedSlot ?? "Pending slot");
    const confirmationCode = `MH-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    return {
      status: "completed",
      nextAction: "Appointment booking confirmed and evidence captured.",
      runtime: {
        executorKey: "appointment-hunter-demo",
        selectedProvider,
        selectedSlot,
        confirmationCode,
      },
      artifacts: [
        createArtifact(
          "confirmation",
          "Appointment confirmation",
          "The controlled demo has moved through the final confirmation step.",
          `${confirmationCode} · ${selectedProvider} · ${selectedSlot}`,
        ),
      ],
    };
  },

  async captureEvidence(task, stage) {
    if (stage === "complete" && task.runtime.confirmationCode && task.runtime.selectedSlot) {
      return [
        createArtifact(
          "screenshot",
          "Confirmation receipt",
          "Rendered a synthetic confirmation receipt for the completed appointment.",
          undefined,
          buildSvgArtifact(
            "Appointment Confirmation",
            [
              `Reference: ${task.runtime.confirmationCode}`,
              `Patient: ${task.input.patientName ?? "Unknown"}`,
              `Provider: ${task.runtime.selectedProvider ?? "Unknown"}`,
              `Slot: ${task.runtime.selectedSlot}`,
            ],
            "#2f7157",
          ),
        ),
      ];
    }

    return [];
  },
};
