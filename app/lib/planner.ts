import type { ExecutionTarget, RiskLevel, Task, TaskInput, TaskMessage, TaskType } from "@/app/lib/domain";

type PlannerReasoningEffort = "minimal" | "low" | "medium" | "high";

export interface PlannerDecision {
  provider: "openai" | "heuristic";
  mode: "model" | "fallback";
  model: string;
  taskType: TaskType;
  targetService: string;
  riskLevel: RiskLevel;
  inputPatch: Partial<TaskInput>;
  summary: string;
  confidence: number;
  error?: string;
}

interface OpenAIPlannerPayload {
  taskType: TaskType;
  targetService: string;
  riskLevel: RiskLevel;
  summary: string;
  confidence: number;
  input: {
    serviceType: string | null;
    city: string | null;
    applicantName: string | null;
    applicantEmail: string | null;
    preferredDates: string[];
    notes: string | null;
    language: "en" | "de" | null;
    executionTarget: ExecutionTarget | null;
  };
}

declare global {
  var __dreamAgentOpenAIPlanner:
    | ((request: {
        model: string;
        reasoningEffort: PlannerReasoningEffort;
        latestMessage: string;
        task: Pick<Task, "goal" | "executionTarget" | "input">;
        messages: Pick<TaskMessage, "role" | "content">[];
      }) => Promise<OpenAIPlannerPayload>)
    | undefined;
}

const FALLBACK_MODEL = "heuristic-parser";
const DEFAULT_TARGET_SERVICE = "Berlin Burgeramt";
const DEFAULT_TASK_TYPE: TaskType = "appointment_booking";

const plannerSchema = {
  type: "object",
  additionalProperties: false,
  required: ["taskType", "targetService", "riskLevel", "summary", "confidence", "input"],
  properties: {
    taskType: {
      type: "string",
      enum: ["appointment_booking"],
    },
    targetService: {
      type: "string",
    },
    riskLevel: {
      type: "string",
      enum: ["low", "medium", "high"],
    },
    summary: {
      type: "string",
    },
    confidence: {
      type: "number",
      minimum: 0,
      maximum: 1,
    },
    input: {
      type: "object",
      additionalProperties: false,
      required: [
        "serviceType",
        "city",
        "applicantName",
        "applicantEmail",
        "preferredDates",
        "notes",
        "language",
        "executionTarget",
      ],
      properties: {
        serviceType: { type: ["string", "null"] },
        city: { type: ["string", "null"] },
        applicantName: { type: ["string", "null"] },
        applicantEmail: { type: ["string", "null"] },
        preferredDates: {
          type: "array",
          items: { type: "string" },
        },
        notes: { type: ["string", "null"] },
        language: {
          type: ["string", "null"],
          enum: ["en", "de", null],
        },
        executionTarget: {
          type: ["string", "null"],
          enum: ["demo", "live", null],
        },
      },
    },
  },
} as const;

const plannerInstructions = [
  "You are the planner for a semi-autonomous digital bureaucracy agent.",
  "Your job is only to classify the task and extract structured fields from the user conversation.",
  "Do not invent facts, do not promise actions, and do not generate browser steps.",
  "Prefer null for unknown scalar fields and [] for unknown preferredDates.",
  "Only set executionTarget when the user explicitly asks for a live or demo run.",
  "Preserve simulation flags such as simulate:no-slots or simulate:site-change inside notes when they appear.",
  "Map Burgeramt and appointment-related requests to appointment_booking and Berlin Burgeramt.",
  "If the request implies an irreversible real-world action, keep riskLevel at high.",
  "Applicant name must be the legal name if supplied. Applicant email must be a plain email address if supplied.",
].join(" ");

const serviceKeywords: Record<string, string> = {
  anmeldung: "Anmeldung einer Wohnung",
  wohnung: "Anmeldung einer Wohnung",
  personalausweis: "Personalausweis beantragen",
  reisepass: "Reisepass beantragen",
  passport: "Reisepass beantragen",
};

function normalizeReasoningEffort(value: string): PlannerReasoningEffort {
  if (value === "minimal" || value === "medium" || value === "high") {
    return value;
  }

  return "low";
}

function getPlannerModel() {
  return process.env.OPENAI_PLANNER_MODEL ?? "gpt-5.4-mini";
}

function getPlannerReasoningEffort() {
  return normalizeReasoningEffort(process.env.OPENAI_PLANNER_REASONING_EFFORT ?? "low");
}

function hasOpenAIPlannerConfig() {
  return Boolean(process.env.OPENAI_API_KEY);
}

function transcriptFromMessages(messages: Pick<TaskMessage, "role" | "content">[]) {
  return messages.map((message) => `${message.role.toUpperCase()}: ${message.content}`).join("\n");
}

function compactInputSnapshot(input: TaskInput) {
  return {
    serviceType: input.serviceType ?? null,
    city: input.city ?? null,
    applicantName: input.applicantName ?? null,
    applicantEmail: input.applicantEmail ?? null,
    preferredDates: input.preferredDates ?? [],
    notes: input.notes ?? null,
    language: input.language ?? null,
    executionTarget: input.executionTarget,
  };
}

function heuristicExtract(message: string): OpenAIPlannerPayload {
  const normalized = message.toLowerCase();
  const emailMatch = message.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const nameMatch = message.match(/(?:my name is|i am|i'm)\s+([a-z][a-z\s'-]+)/i);
  const simulationFlags = message.match(/simulate:[a-z-]+/gi) ?? [];

  let serviceType: string | null = null;
  for (const [keyword, value] of Object.entries(serviceKeywords)) {
    if (normalized.includes(keyword)) {
      serviceType = value;
      break;
    }
  }

  return {
    taskType: DEFAULT_TASK_TYPE,
    targetService: DEFAULT_TARGET_SERVICE,
    riskLevel: "high",
    summary: "Fell back to the local heuristic planner because the model planner was unavailable.",
    confidence: 0.72,
    input: {
      serviceType,
      city: normalized.includes("berlin") ? "Berlin" : null,
      applicantName: nameMatch ? nameMatch[1].trim().replace(/\.$/, "") : null,
      applicantEmail: emailMatch?.[0] ?? null,
      preferredDates: normalized.includes("earliest") ? ["Earliest available"] : [],
      notes: simulationFlags.length > 0 ? simulationFlags.join(", ") : null,
      language: /\b(ich|bitte|termin|anmeldung)\b/i.test(message) ? "de" : "en",
      executionTarget: /\blive\b/i.test(message) ? "live" : /\bdemo\b/i.test(message) ? "demo" : null,
    },
  };
}

function validatePlannerPayload(value: unknown): OpenAIPlannerPayload | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const payload = value as Partial<OpenAIPlannerPayload>;
  const input = payload.input;
  if (
    payload.taskType !== "appointment_booking" ||
    typeof payload.targetService !== "string" ||
    (payload.riskLevel !== "low" && payload.riskLevel !== "medium" && payload.riskLevel !== "high") ||
    typeof payload.summary !== "string" ||
    typeof payload.confidence !== "number" ||
    !input ||
    typeof input !== "object"
  ) {
    return null;
  }

  const parsedInput = input as OpenAIPlannerPayload["input"];
  if (
    !Array.isArray(parsedInput.preferredDates) ||
    (parsedInput.language !== null && parsedInput.language !== "en" && parsedInput.language !== "de") ||
    (parsedInput.executionTarget !== null &&
      parsedInput.executionTarget !== "demo" &&
      parsedInput.executionTarget !== "live")
  ) {
    return null;
  }

  return {
    taskType: payload.taskType,
    targetService: payload.targetService,
    riskLevel: payload.riskLevel,
    summary: payload.summary,
    confidence: Math.max(0, Math.min(1, payload.confidence)),
    input: {
      serviceType: typeof parsedInput.serviceType === "string" ? parsedInput.serviceType : null,
      city: typeof parsedInput.city === "string" ? parsedInput.city : null,
      applicantName: typeof parsedInput.applicantName === "string" ? parsedInput.applicantName : null,
      applicantEmail: typeof parsedInput.applicantEmail === "string" ? parsedInput.applicantEmail : null,
      preferredDates: parsedInput.preferredDates.filter((value): value is string => typeof value === "string"),
      notes: typeof parsedInput.notes === "string" ? parsedInput.notes : null,
      language: parsedInput.language,
      executionTarget: parsedInput.executionTarget,
    },
  };
}

function extractOutputText(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const response = payload as {
    output_text?: unknown;
    output?: Array<{
      type?: string;
      content?: Array<{
        type?: string;
        text?: unknown;
      }>;
    }>;
  };

  if (typeof response.output_text === "string" && response.output_text.length > 0) {
    return response.output_text;
  }

  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string") {
        return content.text;
      }
    }
  }

  return null;
}

async function requestPlannerPayload(params: {
  model: string;
  reasoningEffort: PlannerReasoningEffort;
  latestMessage: string;
  task: Pick<Task, "goal" | "executionTarget" | "input">;
  messages: Pick<TaskMessage, "role" | "content">[];
}) {
  if (globalThis.__dreamAgentOpenAIPlanner) {
    return globalThis.__dreamAgentOpenAIPlanner(params);
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: params.model,
      reasoning: {
        effort: params.reasoningEffort,
      },
      instructions: plannerInstructions,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: [
                `Task goal: ${params.task.goal}`,
                `Latest user message: ${params.latestMessage}`,
                `Execution target requested so far: ${params.task.executionTarget}`,
                `Current structured input: ${JSON.stringify(compactInputSnapshot(params.task.input))}`,
                "Conversation transcript:",
                transcriptFromMessages(params.messages),
              ].join("\n\n"),
            },
          ],
        },
      ],
      max_output_tokens: 500,
      store: false,
      text: {
        format: {
          type: "json_schema",
          name: "dream_agent_planner",
          description: "Structured task extraction for a bureaucracy workflow planner.",
          strict: true,
          schema: plannerSchema,
        },
      },
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | {
        error?: {
          message?: string;
        };
      }
    | null;

  if (!response.ok) {
    throw new Error(payload?.error?.message ?? "OpenAI planner request failed.");
  }

  const outputText = extractOutputText(payload);
  if (!outputText) {
    throw new Error("OpenAI planner response did not include structured output.");
  }

  const parsed = validatePlannerPayload(JSON.parse(outputText));
  if (!parsed) {
    throw new Error("OpenAI planner response did not match the expected schema.");
  }

  return parsed;
}

function trimPatch(payload: OpenAIPlannerPayload): Partial<TaskInput> {
  return {
    serviceType: payload.input.serviceType ?? undefined,
    city: payload.input.city ?? undefined,
    applicantName: payload.input.applicantName ?? undefined,
    applicantEmail: payload.input.applicantEmail ?? undefined,
    preferredDates: payload.input.preferredDates.length > 0 ? payload.input.preferredDates : undefined,
    notes: payload.input.notes ?? undefined,
    language: payload.input.language ?? undefined,
    executionTarget: payload.input.executionTarget ?? undefined,
  };
}

export function mergeTaskInput(current: TaskInput, patch: Partial<TaskInput>): TaskInput {
  const next: TaskInput = {
    ...current,
  };

  if (patch.serviceType) {
    next.serviceType = patch.serviceType;
  }
  if (patch.city) {
    next.city = patch.city;
  }
  if (patch.applicantName) {
    next.applicantName = patch.applicantName;
  }
  if (patch.applicantEmail) {
    next.applicantEmail = patch.applicantEmail;
  }
  if (patch.preferredDates && patch.preferredDates.length > 0) {
    next.preferredDates = patch.preferredDates;
  }
  if (patch.language) {
    next.language = patch.language;
  }
  if (patch.executionTarget) {
    next.executionTarget = patch.executionTarget;
  }

  if (patch.notes) {
    const mergedNotes = new Set(
      [next.notes, patch.notes]
        .flatMap((value) => (value ?? "").split(","))
        .map((value) => value.trim())
        .filter(Boolean),
    );
    next.notes = [...mergedNotes].join(", ");
  }

  return next;
}

export async function planTaskUpdate(params: {
  latestMessage: string;
  task: Pick<Task, "goal" | "executionTarget" | "input">;
  messages: Pick<TaskMessage, "role" | "content">[];
}): Promise<PlannerDecision> {
  const model = getPlannerModel();

  if (!hasOpenAIPlannerConfig()) {
    const fallback = heuristicExtract(params.latestMessage);
    return {
      provider: "heuristic",
      mode: "fallback",
      model: FALLBACK_MODEL,
      taskType: fallback.taskType,
      targetService: fallback.targetService,
      riskLevel: fallback.riskLevel,
      inputPatch: trimPatch(fallback),
      summary: fallback.summary,
      confidence: fallback.confidence,
    };
  }

  try {
    const payload = await requestPlannerPayload({
      model,
      reasoningEffort: getPlannerReasoningEffort(),
      latestMessage: params.latestMessage,
      task: params.task,
      messages: params.messages,
    });

    return {
      provider: "openai",
      mode: "model",
      model,
      taskType: payload.taskType,
      targetService: payload.targetService,
      riskLevel: payload.riskLevel,
      inputPatch: trimPatch(payload),
      summary: payload.summary,
      confidence: payload.confidence,
    };
  } catch (error) {
    const fallback = heuristicExtract(params.latestMessage);
    return {
      provider: "heuristic",
      mode: "fallback",
      model: FALLBACK_MODEL,
      taskType: fallback.taskType,
      targetService: fallback.targetService,
      riskLevel: fallback.riskLevel,
      inputPatch: trimPatch(fallback),
      summary: fallback.summary,
      confidence: fallback.confidence,
      error: error instanceof Error ? error.message : "OpenAI planner failed.",
    };
  }
}
