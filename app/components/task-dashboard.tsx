"use client";

import { startTransition, useMemo, useState } from "react";
import type { ApprovalRequest, Task } from "@/app/lib/domain";

type CreateResponse = {
  task: Task;
};

const starterPrompts = [
  {
    label: "Earliest Anmeldung appointment",
    prompt: "Book me the earliest Burgeramt appointment for Anmeldung in Berlin.",
  },
  {
    label: "Need docs first",
    prompt: "I need a Burgeramt appointment in Berlin.",
  },
  {
    label: "Simulate no slots",
    prompt: "Book me a Burgeramt appointment in Berlin. simulate:no-slots",
  },
];

async function requestJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `Request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function pendingApproval(task: Task | null): ApprovalRequest | undefined {
  return task?.approvals.find((approval) => approval.status === "pending");
}

function traceStatusLabel(task: Task | null) {
  if (!task) {
    return "Langfuse-ready";
  }

  return task.runtime.traceExportState ?? "pending";
}

function plannerLabel(task: Task | null) {
  if (!task) {
    return "OpenAI gpt-5.4-mini";
  }

  const provider = task.runtime.plannerProvider ?? "heuristic";
  const model = task.runtime.plannerModel ?? "heuristic-parser";
  return `${provider}:${model}`;
}

function executorLabel(task: Task | null) {
  if (!task) {
    return "Playwright executor";
  }

  return task.runtime.executorKey ?? `${task.executionTarget}-executor`;
}

export function TaskDashboard() {
  const [draft, setDraft] = useState(starterPrompts[0].prompt);
  const [followUp, setFollowUp] = useState("");
  const [executionTarget, setExecutionTarget] = useState<"demo" | "live">("demo");
  const [task, setTask] = useState<Task | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stats = useMemo(() => {
    if (!task) {
      return [
        { label: "Task type", value: "Appointment booking" },
        { label: "Planner", value: plannerLabel(null) },
        { label: "Executor", value: executorLabel(null) },
        { label: "Trace sink", value: "Langfuse-ready" },
      ];
    }

    return [
      { label: "Task type", value: task.type.replaceAll("_", " ") },
      { label: "Planner", value: plannerLabel(task) },
      { label: "Executor", value: executorLabel(task) },
      { label: "Langfuse", value: traceStatusLabel(task) },
    ];
  }, [task]);

  const approval = pendingApproval(task);

  async function createTask(prompt: string) {
    setIsWorking(true);
    setError(null);

    try {
      const response = await requestJson<CreateResponse>("/api/tasks", {
        method: "POST",
        body: JSON.stringify({ message: prompt, executionTarget }),
      });

      startTransition(() => {
        setTask(response.task);
        setFollowUp("");
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to create the task.");
    } finally {
      setIsWorking(false);
    }
  }

  async function sendMessage() {
    if (!task || !followUp.trim()) {
      return;
    }

    setIsWorking(true);
    setError(null);

    try {
      const response = await requestJson<CreateResponse>(`/api/tasks/${task.id}/message`, {
        method: "POST",
        body: JSON.stringify({ message: followUp }),
      });

      startTransition(() => {
        setTask(response.task);
        setFollowUp("");
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to send the message.");
    } finally {
      setIsWorking(false);
    }
  }

  async function decideApproval(action: "approve" | "reject") {
    if (!task) {
      return;
    }

    setIsWorking(true);
    setError(null);

    try {
      const response = await requestJson<CreateResponse>(`/api/tasks/${task.id}/${action}`, {
        method: "POST",
      });

      startTransition(() => setTask(response.task));
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : `Unable to ${action} the task.`,
      );
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">Dream Agent Prototype</p>
        <h1>Delegating bureaucracy to a calm, careful operator.</h1>
        <p>
          This prototype turns messy digital errands into a guided agent run. The
          planner model handles intent extraction and structured intake, while the
          browser executor stays deterministic and approval-gated. The first
          workflow is Berlin Burgeramt appointment booking, but the product
          language stays task-centric: goal intake, structured clarification,
          browser execution, approval gates, evidence, and trace-backed confidence.
        </p>

        <div className="hero-grid">
          <div className="panel strong panel-pad stack">
            <div>
              <label className="label" htmlFor="goal">
                Describe the task
              </label>
              <textarea
                id="goal"
                className="textarea"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Book me the earliest Burgeramt appointment for Anmeldung in Berlin."
              />
            </div>

            <div>
              <label className="label" htmlFor="target">
                Execution target
              </label>
              <select
                id="target"
                className="select"
                value={executionTarget}
                onChange={(event) => setExecutionTarget(event.target.value as "demo" | "live")}
              >
                <option value="demo">Controlled demo flow</option>
                <option value="live">Live Berlin service probe</option>
              </select>
            </div>

            <div className="button-row">
              <button className="button primary" type="button" onClick={() => createTask(draft)} disabled={isWorking}>
                Start task run
              </button>
              <a className="button secondary" href="/demo/burgeramt">
                Open demo target
              </a>
            </div>

            <div className="chip-row">
              {starterPrompts.map((starter) => (
                <button
                  key={starter.label}
                  type="button"
                  className="chip"
                  onClick={() => setDraft(starter.prompt)}
                >
                  <strong>{starter.label}</strong>
                </button>
              ))}
            </div>
          </div>

          <div className="stats-grid">
            {stats.map((stat) => (
              <div key={stat.label} className="panel metric">
                <span className="label">{stat.label}</span>
                <strong>{stat.value}</strong>
              </div>
            ))}
          </div>
        </div>
      </section>

      {error ? (
        <section className="panel panel-pad" style={{ marginBottom: 20 }}>
          <strong>Error</strong>
          <p className="muted">{error}</p>
        </section>
      ) : null}

      <section className="dashboard-grid">
        <div className="stack">
          <section className="panel strong panel-pad stack">
            <div className="split-row">
              <div>
                <p className="eyebrow" style={{ marginBottom: 4 }}>
                  Chat Thread
                </p>
                <strong>{task?.goal ?? "Start a task to open the working thread"}</strong>
              </div>
              {task ? (
                <span className={`status-pill status-${task.status}`}>{task.status.replaceAll("_", " ")}</span>
              ) : null}
            </div>

            {task ? (
              <>
                <div className="thread">
                  {task.messages.map((message) => (
                    <div key={message.id} className={`bubble ${message.role}`}>
                      <div className="bubble-head">
                        {message.role} · {formatDate(message.createdAt)}
                      </div>
                      <div>{message.content}</div>
                    </div>
                  ))}
                </div>

                {task.nextPrompt ? (
                  <div className="approval-card">
                    <strong>Why I&apos;m asking</strong>
                    <p className="muted">{task.nextPrompt}</p>
                  </div>
                ) : null}

                <div className="stack">
                  <div>
                    <label className="label" htmlFor="follow-up">
                      Reply to the agent
                    </label>
                    <textarea
                      id="follow-up"
                      className="textarea"
                      value={followUp}
                      onChange={(event) => setFollowUp(event.target.value)}
                      placeholder="My name is Alex Example and my email is alex@example.com."
                    />
                  </div>
                  <div className="button-row">
                    <button
                      className="button primary"
                      type="button"
                      onClick={sendMessage}
                      disabled={isWorking || !followUp.trim()}
                    >
                      Send details
                    </button>
                    {approval ? (
                      <>
                        <button
                          className="button warning"
                          type="button"
                          onClick={() => decideApproval("approve")}
                          disabled={isWorking}
                        >
                          Approve action
                        </button>
                        <button
                          className="button danger"
                          type="button"
                          onClick={() => decideApproval("reject")}
                          disabled={isWorking}
                        >
                          Reject action
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              </>
            ) : (
              <div className="empty-state">
                The task thread, approvals, and evidence will appear here after the first
                run starts.
              </div>
            )}
          </section>

          {task ? (
            <section className="panel panel-pad stack">
              <p className="eyebrow">Progress Timeline</p>
              <div className="timeline">
                {task.timeline.map((event) => (
                  <div key={event.id} className="timeline-item">
                    <strong>{event.label}</strong>
                    <p>{event.detail}</p>
                    <span className="muted">
                      {event.stage} · {formatDate(event.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <div className="stack">
          {approval ? (
            <section className="panel strong panel-pad">
              <div className="approval-card">
                <strong>Approval required</strong>
                <p>{approval.summary}</p>
                <p className="muted">{approval.userImpact}</p>
                <span className="code">{approval.action}</span>
              </div>
            </section>
          ) : null}

          {task ? (
            <section className="panel panel-pad stack">
              <p className="eyebrow">Runtime Split</p>
              <div className="approval-card">
                <strong>Planner model</strong>
                <p className="muted">
                  {plannerLabel(task)} · {task.runtime.plannerMode ?? "fallback"}
                </p>
                <p>{task.runtime.plannerSummary ?? "Waiting for planner output."}</p>
                {task.runtime.plannerLastError ? (
                  <p className="muted">Latest planner issue: {task.runtime.plannerLastError}</p>
                ) : null}
              </div>
              <div className="approval-card">
                <strong>Browser executor</strong>
                <p className="muted">{executorLabel(task)}</p>
                <p>
                  The planner only extracts and updates structured state. The
                  Playwright executor owns slot search, evidence capture, and
                  approval-gated submission.
                </p>
              </div>
            </section>
          ) : null}

          {task ? (
            <section className="panel panel-pad stack">
              <p className="eyebrow">Evidence</p>
              <div className="artifact-grid">
                {task.artifacts.map((artifact) => (
                  <article key={artifact.id} className="artifact-card">
                    {artifact.kind === "screenshot" && artifact.href ? (
                      <img src={artifact.href} alt={artifact.title} />
                    ) : null}
                    <strong>{artifact.title}</strong>
                    <p>{artifact.summary}</p>
                    {artifact.content ? <pre className="code">{artifact.content}</pre> : null}
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {task ? (
            <section className="detail-grid">
              <div className="panel panel-pad stack">
                <div className="split-row">
                  <p className="eyebrow">Langfuse Trace Story</p>
                  {task.runtime.traceUrl ? (
                    <a className="button secondary" href={task.runtime.traceUrl} target="_blank" rel="noreferrer">
                      Open trace
                    </a>
                  ) : null}
                </div>
                <div className="approval-card">
                  <strong>Trace status</strong>
                  <p>
                    <span className="code">{task.runtime.traceId}</span>
                  </p>
                  <p className="muted">
                    Export state: {task.runtime.traceExportState ?? "pending"}
                    {task.runtime.traceLastSyncedAt ? ` · synced ${formatDate(task.runtime.traceLastSyncedAt)}` : ""}
                  </p>
                  {task.runtime.traceLastError ? (
                    <p className="muted">Latest export issue: {task.runtime.traceLastError}</p>
                  ) : null}
                </div>
                <div className="trace-list">
                  {task.traces.map((trace) => (
                    <div key={trace.id} className="trace-item">
                      <strong>{trace.name}</strong>
                      <p>{trace.detail}</p>
                      <span className="muted">
                        {trace.stage} · {trace.kind} · {formatDate(trace.createdAt)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="panel panel-pad stack">
                <p className="eyebrow">Eval Hooks</p>
                <div className="eval-list">
                  {task.evaluations.map((evaluation) => (
                    <div key={evaluation.id} className="eval-item">
                      <strong>{evaluation.name}</strong>
                      <p>{evaluation.summary}</p>
                      <span className="muted">
                        score {evaluation.score.toFixed(2)} · {evaluation.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          ) : null}
        </div>
      </section>
    </main>
  );
}
