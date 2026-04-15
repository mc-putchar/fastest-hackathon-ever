import { createId, nowIso, type ExecutorResult } from "@/app/lib/domain";
import type { PreparedSubmission, RequirementCollection, ServiceExecutor } from "@/app/lib/executors/types";
import {
  APPOINTMENT_HUNTER_LIVE_URL,
  appointmentHunterRequirements,
  createArtifact,
  missingAppointmentRequirements,
} from "@/app/lib/executors/appointment-hunter/shared";

export const appointmentHunterLiveExecutor: ServiceExecutor = {
  key: "appointment-hunter-live",
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
          : `I can continue the live compatibility path, but I still need your ${missing.map((item) => item.label).join(", ")} before handing off to a human-supervised booking flow.`,
    };
  },

  async prepareSubmission(): Promise<PreparedSubmission> {
    return {
      summary: "Prepared a compatibility stub for live medical booking sites.",
      runtime: {
        executorKey: "appointment-hunter-live",
        liveUrl: APPOINTMENT_HUNTER_LIVE_URL,
      },
      artifacts: [
        createArtifact(
          "note",
          "Live mode compatibility stub",
          "The hackathon build keeps the live execution contract, but all real medical booking sites remain human-supervised.",
          APPOINTMENT_HUNTER_LIVE_URL,
        ),
      ],
      traceEvents: [
        {
          id: createId("trace"),
          name: "Live compatibility path prepared",
          detail: "Prepared a safe handoff for live medical booking sites without attempting browser automation.",
          stage: "prepare",
          kind: "step",
          createdAt: nowIso(),
        },
      ],
    };
  },

  async searchAvailability(): Promise<ExecutorResult> {
    return {
      status: "blocked",
      nextAction: "Live medical booking remains intentionally disabled in this hackathon build and requires human follow-up.",
      errorCode: "manual_follow_up_required",
      runtime: {
        executorKey: "appointment-hunter-live",
        liveUrl: APPOINTMENT_HUNTER_LIVE_URL,
      },
      artifacts: [
        createArtifact(
          "note",
          "Live booking disabled",
          "Use the controlled demo workflow for the end-to-end experience. Real provider sites are left for human-supervised follow-up.",
          APPOINTMENT_HUNTER_LIVE_URL,
        ),
      ],
    };
  },

  async submitWithApproval(): Promise<ExecutorResult> {
    return {
      status: "blocked",
      nextAction: "The live medical booking path does not submit appointments automatically.",
      errorCode: "manual_follow_up_required",
      runtime: {
        executorKey: "appointment-hunter-live",
        liveUrl: APPOINTMENT_HUNTER_LIVE_URL,
      },
      artifacts: [
        createArtifact(
          "note",
          "Manual follow-up required",
          "The compatibility live path keeps a clear boundary: real appointments are not submitted automatically in this prototype.",
        ),
      ],
    };
  },

  async captureEvidence() {
    return [];
  },
};
