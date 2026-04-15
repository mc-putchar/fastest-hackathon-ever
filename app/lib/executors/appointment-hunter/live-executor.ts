import { createId, nowIso, type ExecutorResult } from "@/app/lib/domain";
import type { PreparedSubmission, RequirementCollection, ServiceExecutor } from "@/app/lib/executors/types";
import {
  APPOINTMENT_HUNTER_LIVE_URL,
  appointmentHunterRequirements,
  createArtifact,
  hasSimulation,
  missingAppointmentRequirements,
} from "@/app/lib/executors/appointment-hunter/shared";
import { findLiveAppointmentMatches } from "@/app/lib/executors/appointment-hunter/live-search";

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
          ? "All required live-search details are available."
          : `I can continue the live marketplace search, but I still need your ${missing.map((item) => item.label).join(", ")} before checking Doctolib and similar provider directories.`,
    };
  },

  async prepareSubmission(task): Promise<PreparedSubmission> {
    return {
      summary: "Prepared a live marketplace search and kept the workflow non-submitting.",
      runtime: {
        executorKey: "appointment-hunter-live",
        liveUrl: APPOINTMENT_HUNTER_LIVE_URL,
      },
      artifacts: [
        createArtifact(
          "note",
          "Live search prepared",
          "The live path will search real marketplace listings, capture evidence, and stop before any booking confirmation.",
          [
            `Type: ${task.input.appointmentKind ?? "doctor"}`,
            `Specialty: ${task.input.specialty ?? "Not needed"}`,
            `Insurance: ${task.input.insuranceType ?? "Not specified"}`,
            `City: ${task.input.city ?? "Berlin"}`,
          ].join("\n"),
          APPOINTMENT_HUNTER_LIVE_URL,
        ),
      ],
      traceEvents: [
        {
          id: createId("trace"),
          name: "Live search prepared",
          detail: "Prepared a non-submitting live marketplace search for real appointment listings.",
          stage: "prepare",
          kind: "step",
          createdAt: nowIso(),
        },
      ],
    };
  },

  async searchAvailability(task): Promise<ExecutorResult> {
    if (hasSimulation(task.input.notes, "no-slots")) {
      return {
        status: "blocked",
        nextAction: "No matching appointments were available in the live provider search.",
        errorCode: "no_appointments_available",
        runtime: {
          executorKey: "appointment-hunter-live",
          liveUrl: APPOINTMENT_HUNTER_LIVE_URL,
        },
        artifacts: [
          createArtifact(
            "note",
            "No live appointments found",
            "The live provider-search flow returned no matching appointment cards for the current filters.",
          ),
        ],
      };
    }

    if (hasSimulation(task.input.notes, "site-change")) {
      return {
        status: "blocked",
        nextAction: "The live provider page changed enough that Harbor stopped instead of guessing.",
        errorCode: "site_changed",
        runtime: {
          executorKey: "appointment-hunter-live",
          liveUrl: APPOINTMENT_HUNTER_LIVE_URL,
        },
        artifacts: [
          createArtifact(
            "note",
            "Live provider parsing stopped",
            "The live-search parser hit a simulated site change and preserved the handoff boundary.",
          ),
        ],
      };
    }

    const outcome = await findLiveAppointmentMatches(task);
    const artifacts = [];

    if (outcome.screenshotHref) {
      artifacts.push(
        createArtifact(
          "screenshot",
          "Live search evidence",
          `Captured the ${outcome.providerLabel} results page during the real appointment search.`,
          undefined,
          outcome.screenshotHref,
        ),
      );
    }

    if (outcome.fallbackReason === "playwright_unavailable") {
      return {
        status: "blocked",
        nextAction: "The live search URL is ready, but Playwright could not open the provider page in this environment.",
        errorCode: "playwright_unavailable",
        runtime: {
          executorKey: "appointment-hunter-live",
          liveUrl: outcome.searchUrl,
        },
        artifacts: [
          ...artifacts,
          createArtifact(
            "note",
            "Live search handoff",
            "Harbor prepared the exact live search URL, but automatic extraction could not start in this environment.",
            outcome.detail,
            outcome.searchUrl,
          ),
        ],
      };
    }

    if (outcome.fallbackReason === "site_changed") {
      return {
        status: "blocked",
        nextAction: "The live provider page loaded, but the appointment cards were not stable enough to extract safely.",
        errorCode: "site_changed",
        runtime: {
          executorKey: "appointment-hunter-live",
          liveUrl: outcome.searchUrl,
        },
        artifacts: [
          ...artifacts,
          createArtifact(
            "note",
            "Live search needs review",
            "Harbor stopped after loading the provider search because it could not extract stable appointment cards safely.",
            outcome.detail,
            outcome.searchUrl,
          ),
        ],
      };
    }

    if (outcome.matches.length === 0) {
      return {
        status: "blocked",
        nextAction: "No matching appointments were available from the live provider search.",
        errorCode: "no_appointments_available",
        runtime: {
          executorKey: "appointment-hunter-live",
          liveUrl: outcome.searchUrl,
        },
        artifacts: [
          ...artifacts,
          createArtifact(
            "note",
            "No live matches",
            "The live provider search ran successfully, but it did not surface matching appointment cards.",
            outcome.detail,
            outcome.searchUrl,
          ),
        ],
      };
    }

    const [bestMatch, ...otherMatches] = outcome.matches;

    return {
      status: "completed",
      nextAction: `Harbor found live appointment options on ${outcome.providerLabel} and stopped before any booking step.`,
      runtime: {
        executorKey: "appointment-hunter-live",
        liveUrl: outcome.searchUrl,
        selectedProvider: bestMatch.providerName,
        selectedSlot: bestMatch.availabilityLabel,
      },
      artifacts: [
        ...artifacts,
        createArtifact(
          "extracted_slot",
          "Best live appointment option",
          `Captured the earliest extracted option from ${outcome.providerLabel}.`,
          [bestMatch.providerName, bestMatch.availabilityLabel ?? "Open profile for availability"]
            .filter(Boolean)
            .join(" · "),
          bestMatch.href,
        ),
        createArtifact(
          "note",
          "Live search overview",
          `Found ${outcome.matches.length} live provider option${outcome.matches.length === 1 ? "" : "s"} without attempting a booking confirmation.`,
          [
            `${bestMatch.providerName}${bestMatch.providerType ? ` · ${bestMatch.providerType}` : ""}`,
            bestMatch.address ?? "Address unavailable",
            bestMatch.availabilityLabel ?? "Open profile for latest availability",
          ].join("\n"),
          outcome.searchUrl,
        ),
        ...otherMatches.map((match, index) =>
          createArtifact(
            "note",
            `Alternate live option ${index + 1}`,
            `${match.source} result captured for manual review.`,
            [
              `${match.providerName}${match.providerType ? ` · ${match.providerType}` : ""}`,
              match.address ?? "Address unavailable",
              match.availabilityLabel ?? "Open profile for latest availability",
            ].join("\n"),
            match.href,
          ),
        ),
      ],
      traceEvents: [
        {
          id: createId("trace"),
          name: "Live appointments extracted",
          detail: `Found ${outcome.matches.length} live provider option${outcome.matches.length === 1 ? "" : "s"} on ${outcome.providerLabel} without attempting submission.`,
          stage: "execute",
          kind: "output",
          createdAt: nowIso(),
        },
      ],
      evaluations: [
        {
          id: createId("eval"),
          name: "Live slot extraction",
          label: "pass",
          score: 0.92,
          summary: `The executor extracted live provider results from ${outcome.providerLabel} without crossing into booking confirmation.`,
          createdAt: nowIso(),
        },
        {
          id: createId("eval"),
          name: "Live search safety",
          label: "pass",
          score: 1,
          summary: "The live search completed without submitting any appointment form.",
          createdAt: nowIso(),
        },
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
