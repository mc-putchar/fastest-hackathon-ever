export type TaskType = "appointment_booking";
export type TaskStage = "intake" | "clarify" | "prepare" | "execute" | "approve" | "complete";
export type TaskStatus =
  | "needs_input"
  | "ready"
  | "running"
  | "awaiting_approval"
  | "blocked"
  | "completed"
  | "failed";
export type RiskLevel = "low" | "medium" | "high";
export type ArtifactKind = "screenshot" | "extracted_slot" | "form_preview" | "confirmation" | "note";
export type ExecutionTarget = "demo" | "live";
export type MessageRole = "user" | "agent" | "system";
export type ExecutorErrorCode =
  | "missing_info"
  | "no_appointments_available"
  | "login_required"
  | "site_changed"
  | "captcha_required"
  | "manual_follow_up_required"
  | "playwright_unavailable";

export type TraceKind = "input" | "decision" | "step" | "risk" | "output" | "eval";

export interface TaskMessage {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: string;
}

export interface TaskArtifact {
  id: string;
  kind: ArtifactKind;
  title: string;
  summary: string;
  content?: string;
  href?: string;
  createdAt: string;
}

export interface ApprovalRequest {
  id: string;
  taskId: string;
  action: string;
  summary: string;
  userImpact: string;
  expiresAt: string;
  status: "pending" | "approved" | "rejected";
  payload?: Record<string, unknown>;
}

export interface TimelineEvent {
  id: string;
  label: string;
  detail: string;
  createdAt: string;
  stage: TaskStage;
  tone: "info" | "warning" | "danger" | "success";
}

export interface TraceEvent {
  id: string;
  name: string;
  detail: string;
  stage: TaskStage;
  kind: TraceKind;
  createdAt: string;
}

export interface TaskEvaluation {
  id: string;
  name: string;
  label: "pass" | "warn" | "fail";
  score: number;
  summary: string;
  createdAt: string;
}

export interface TaskInput {
  appointmentKind?: "doctor" | "dentist";
  specialty?: string;
  insuranceType?: "public" | "private" | "self_pay";
  city?: string;
  patientName?: string;
  patientEmail?: string;
  preferredDates?: string[];
  notes?: string;
  language?: "en" | "de";
  executionTarget: ExecutionTarget;
}

export interface TaskRuntime {
  traceId: string;
  selectedSlot?: string;
  selectedProvider?: string;
  liveUrl?: string;
  confirmationCode?: string;
  plannerProvider?: "openai" | "heuristic";
  plannerModel?: string;
  plannerMode?: "model" | "fallback";
  plannerSummary?: string;
  plannerLastError?: string;
  traceUrl?: string;
  traceExportState?: "pending" | "synced" | "disabled" | "error";
  traceLastSyncedAt?: string;
  traceLastError?: string;
  syncedEvaluationVersions?: Record<string, string>;
  executorKey?: string;
}

export interface Task {
  id: string;
  type: TaskType;
  status: TaskStatus;
  stage: TaskStage;
  riskLevel: RiskLevel;
  targetService: string;
  goal: string;
  createdAt: string;
  updatedAt: string;
  executionTarget: ExecutionTarget;
  input: TaskInput;
  runtime: TaskRuntime;
  nextPrompt?: string;
  lastErrorCode?: ExecutorErrorCode;
  messages: TaskMessage[];
  artifacts: TaskArtifact[];
  approvals: ApprovalRequest[];
  timeline: TimelineEvent[];
  traces: TraceEvent[];
  evaluations: TaskEvaluation[];
}

export interface ExecutorResult {
  status: "awaiting_approval" | "completed" | "blocked";
  nextAction: string;
  artifacts: TaskArtifact[];
  approvalRequest?: ApprovalRequest;
  errorCode?: ExecutorErrorCode;
  traceEvents?: TraceEvent[];
  evaluations?: TaskEvaluation[];
  runtime?: Partial<TaskRuntime>;
}

export function createId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function cloneTask(task: Task) {
  return structuredClone(task);
}
