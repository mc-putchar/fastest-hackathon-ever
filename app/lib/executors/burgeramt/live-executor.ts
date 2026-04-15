import { createId, nowIso, type ExecutorResult } from "@/app/lib/domain";
import type { PreparedSubmission, RequirementCollection, ServiceExecutor } from "@/app/lib/executors/types";
import {
  BURGERAMT_LIVE_URL,
  burgeramtRequirements,
  createArtifact,
} from "@/app/lib/executors/burgeramt/shared";

export const burgeramtLiveExecutor: ServiceExecutor = {
  key: "burgeramt-live",
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
          : `I can continue the live Burgeramt flow, but I still need your ${missing.map((item) => item.label).join(", ")} before opening the portal.`,
    };
  },

  async prepareSubmission(task): Promise<PreparedSubmission> {
    return {
      summary: "Prepared a live-probe configuration and safety envelope for the public Burgeramt portal.",
      runtime: {
        executorKey: "burgeramt-live",
        liveUrl: BURGERAMT_LIVE_URL,
      },
      artifacts: [
        createArtifact(
          "note",
          "Live execution strategy",
          "The live path proves reachability and current portal state, but final submission stays human-supervised to avoid brittle or unsafe public-site automation.",
          BURGERAMT_LIVE_URL,
        ),
      ],
      traceEvents: [
        {
          id: createId("trace"),
          name: "Live probe configured",
          detail: "Prepared a safe probe against the public Burgeramt portal.",
          stage: "prepare",
          kind: "step",
          createdAt: nowIso(),
        },
      ],
    };
  },

  async searchAvailability(): Promise<ExecutorResult> {
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
          executorKey: "burgeramt-live",
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
        runtime: {
          executorKey: "burgeramt-live",
          liveUrl: BURGERAMT_LIVE_URL,
        },
        artifacts: [
          createArtifact(
            "note",
            "Live execution unavailable",
            "Switch to the controlled demo mode for the stable end-to-end happy path, or configure Playwright plus network access for live probing.",
          ),
        ],
      };
    }
  },

  async submitWithApproval(): Promise<ExecutorResult> {
    return {
      status: "blocked",
      nextAction: "The live flow still requires a human-supervised selector pass before final submission is enabled.",
      errorCode: "manual_follow_up_required",
      runtime: {
        executorKey: "burgeramt-live",
        liveUrl: BURGERAMT_LIVE_URL,
      },
      artifacts: [
        createArtifact(
          "note",
          "Live submission intentionally disabled",
          "The prototype stops here to avoid brittle or unsafe automated submission against a real public service.",
        ),
      ],
    };
  },

  async captureEvidence(task, stage) {
    if (stage !== "complete") {
      return [];
    }

    return [
      createArtifact(
        "note",
        "Manual follow-up required",
        "The live probe finished safely. A human-supervised selector review is still needed before enabling final submission.",
      ),
    ];
  },
};
