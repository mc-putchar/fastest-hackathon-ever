import type { SpanContext } from "@opentelemetry/api";
import { LangfuseClient } from "@langfuse/client";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import {
  createTraceId,
  getActiveTraceId,
  startActiveObservation,
  type LangfuseSpan,
} from "@langfuse/tracing";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { nowIso, type Task, type TaskStage } from "@/app/lib/domain";

declare global {
  var __dreamAgentLangfuseSdk: NodeSDK | undefined;
  var __dreamAgentLangfuseSdkPromise: Promise<boolean> | undefined;
  var __dreamAgentLangfuseClient: LangfuseClient | undefined;
}

function getLangfuseConfig() {
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  const baseUrl = process.env.LANGFUSE_BASE_URL ?? "https://cloud.langfuse.com";

  if (!publicKey || !secretKey) {
    return null;
  }

  return {
    publicKey,
    secretKey,
    baseUrl,
  };
}

export function hasLangfuseConfig() {
  return getLangfuseConfig() !== null;
}

export async function registerLangfuseInstrumentation() {
  const config = getLangfuseConfig();
  if (!config) {
    return false;
  }

  if (globalThis.__dreamAgentLangfuseSdkPromise) {
    return globalThis.__dreamAgentLangfuseSdkPromise;
  }

  if (globalThis.__dreamAgentLangfuseSdk) {
    return true;
  }

  const sdk = new NodeSDK({
    spanProcessors: [
      new LangfuseSpanProcessor({
        ...config,
        environment: process.env.LANGFUSE_TRACING_ENVIRONMENT ?? "hackathon-prototype",
      }),
    ],
  });

  globalThis.__dreamAgentLangfuseSdkPromise = (async () => {
    try {
      await Promise.resolve(sdk.start());
      globalThis.__dreamAgentLangfuseSdk = sdk;
      return true;
    } catch (error) {
      globalThis.__dreamAgentLangfuseSdk = undefined;
      globalThis.__dreamAgentLangfuseSdkPromise = undefined;
      throw error;
    }
  })();

  return globalThis.__dreamAgentLangfuseSdkPromise;
}

function getLangfuseClient() {
  const config = getLangfuseConfig();
  if (!config) {
    return null;
  }

  if (!globalThis.__dreamAgentLangfuseClient) {
    globalThis.__dreamAgentLangfuseClient = new LangfuseClient(config);
  }

  return globalThis.__dreamAgentLangfuseClient;
}

function syntheticParentSpanContext(traceId: string): SpanContext {
  return {
    traceId,
    spanId: traceId.slice(0, 16),
    traceFlags: 1,
  };
}

function summarizeObservationOutput(result: unknown) {
  if (!result || typeof result !== "object") {
    return result;
  }

  if ("status" in result || "nextAction" in result) {
    const value = result as { status?: string; nextAction?: string; errorCode?: string };
    return {
      status: value.status,
      nextAction: value.nextAction,
      errorCode: value.errorCode,
    };
  }

  if ("id" in result && "stage" in result && "status" in result) {
    const value = result as { id?: string; stage?: string; status?: string };
    return {
      id: value.id,
      stage: value.stage,
      status: value.status,
    };
  }

  return {
    type: Array.isArray(result) ? "array" : "object",
  };
}

export async function ensureTaskTrace(task: Task) {
  if (!task.runtime.traceId) {
    task.runtime.traceId = await createTraceId(task.id);
  }
}

export async function withTaskObservation<T>(
  task: Task,
  name: string,
  stage: TaskStage,
  input: Record<string, unknown>,
  work: (span: LangfuseSpan) => Promise<T>,
) {
  await ensureTaskTrace(task);
  await registerLangfuseInstrumentation();

  const activeTraceId = getActiveTraceId();
  const options =
    activeTraceId && activeTraceId === task.runtime.traceId
      ? undefined
      : { parentSpanContext: syntheticParentSpanContext(task.runtime.traceId) };

  return startActiveObservation(
    name,
    async (span) => {
      span.update({
        input,
        metadata: {
          taskId: task.id,
          stage,
          executionTarget: task.executionTarget,
          targetService: task.targetService,
        },
      });
      span.setTraceIO({
        input: {
          taskId: task.id,
          goal: task.goal,
        },
      });

      try {
        const result = await work(span);
        span.update({
          output: summarizeObservationOutput(result),
        });
        span.setTraceIO({
          output: {
            status: task.status,
            stage: task.stage,
          },
        });
        return result;
      } catch (error) {
        span.update({
          output: {
            error: error instanceof Error ? error.message : "Unknown task observation failure",
          },
        });
        throw error;
      }
    },
    options,
  );
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function evaluationVersion(score: number, summary: string) {
  return JSON.stringify({
    score,
    summary,
  });
}

export async function syncTaskTelemetry(task: Task) {
  const client = getLangfuseClient();
  if (!client) {
    task.runtime.traceExportState = "disabled";
    return task;
  }

  try {
    task.runtime.traceUrl = await client.getTraceUrl(task.runtime.traceId);

    const syncedVersions = {
      ...(task.runtime.syncedEvaluationVersions ?? {}),
    };
    for (const evaluation of task.evaluations) {
      const key = slugify(evaluation.name);
      const version = evaluationVersion(evaluation.score, evaluation.summary);
      if (syncedVersions[key] === version) {
        continue;
      }

      client.score.create({
        traceId: task.runtime.traceId,
        name: key,
        value: evaluation.score,
        comment: evaluation.summary,
      });
      syncedVersions[key] = version;
    }

    await client.flush();
    task.runtime.syncedEvaluationVersions = syncedVersions;
    task.runtime.traceExportState = "synced";
    task.runtime.traceLastSyncedAt = nowIso();
    task.runtime.traceLastError = undefined;
  } catch (error) {
    task.runtime.traceExportState = "error";
    task.runtime.traceLastError =
      error instanceof Error ? error.message : "Unable to sync the task trace to Langfuse.";
  }

  return task;
}
