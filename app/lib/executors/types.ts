import type {
  ApprovalRequest,
  ExecutorResult,
  Task,
  TaskArtifact,
  TaskEvaluation,
  TaskInput,
  TaskRuntime,
  TraceEvent,
} from "@/app/lib/domain";

export type TaskInputField = keyof TaskInput;

export interface TaskRequirement {
  field: TaskInputField;
  label: string;
  reason: string;
}

export interface RequirementCollection {
  missing: TaskRequirement[];
  prompt: string;
}

export interface PreparedSubmission {
  summary: string;
  artifacts: TaskArtifact[];
  runtime?: Partial<TaskRuntime>;
  traceEvents?: TraceEvent[];
  evaluations?: TaskEvaluation[];
}

export interface ServiceExecutor {
  key: string;
  targetService: string;
  detectRequirements(task: Task): TaskRequirement[];
  collectInputs(task: Task): RequirementCollection;
  prepareSubmission(task: Task): Promise<PreparedSubmission>;
  searchAvailability(task: Task): Promise<ExecutorResult>;
  submitWithApproval(task: Task, approval: ApprovalRequest): Promise<ExecutorResult>;
  captureEvidence(task: Task, stage: Task["stage"]): Promise<TaskArtifact[]>;
}
