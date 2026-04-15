"use client";

import { startTransition, useMemo, useState } from "react";
import { brand, executionTargetLabel, type ViewMode } from "@/app/lib/brand";
import type { ApprovalRequest, Task } from "@/app/lib/domain";

type CreateResponse = {
  task: Task;
};

const starterPrompts = [
  {
    label: "Earliest dentist slot",
    prompt: "Book me the earliest dentist appointment in Berlin.",
  },
  {
    label: "Dermatologist search",
    prompt: "Find me the earliest dermatologist appointment in Berlin with public insurance.",
  },
  {
    label: "Simulate no slots",
    prompt: "Find me a cardiology appointment in Berlin with private insurance. simulate:no-slots",
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

function formatLabel(value: string) {
  return value.replaceAll("_", " ");
}

function pendingApproval(task: Task | null): ApprovalRequest | undefined {
  return task?.approvals.find((approval) => approval.status === "pending");
}

function basicStatusCopy(task: Task, approval: ApprovalRequest | undefined) {
  if (approval) {
    return "Harbor paused before the irreversible step and is waiting for your approval.";
  }

  if (task.nextPrompt) {
    return "Harbor needs one more detail before it can continue.";
  }

  if (task.status === "completed") {
    return "The run is finished and the proof bundle is ready.";
  }

  if (task.status === "blocked" || task.status === "failed") {
    return "The run hit a blocker and kept the latest evidence attached for review.";
  }

  return "Harbor is preparing the next step and will pause if approval is required.";
}

function proofBundleCopy(task: Task | null) {
  if (!task || task.artifacts.length === 0) {
    return "Screenshots and notes will appear here as Harbor works.";
  }

  return `${task.artifacts.length} saved item${task.artifacts.length === 1 ? "" : "s"} attached to this run.`;
}

export function TaskDashboard() {
  const [draft, setDraft] = useState(starterPrompts[0].prompt);
  const [followUp, setFollowUp] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("basic");
  const [task, setTask] = useState<Task | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const executionTarget: "demo" = "demo";

  const approval = pendingApproval(task);
  const visibleMessages = task ? (viewMode === "basic" ? task.messages.slice(-4) : task.messages) : [];
  const recentTimeline = task ? task.timeline.slice(0, viewMode === "basic" ? 3 : task.timeline.length) : [];
  const recentArtifacts = task ? task.artifacts.slice(0, viewMode === "basic" ? 2 : task.artifacts.length) : [];

  const stats = useMemo(() => {
    if (viewMode === "basic") {
      if (!task) {
        return brand.trustPillars;
      }

        return [
          {
            label: "Current workflow",
            value: task.targetService,
          },
        {
          label: "Approval step",
          value: approval ? "Waiting on your review" : "Only when needed",
        },
        {
          label: "Proof bundle",
          value: proofBundleCopy(task),
        },
      ];
    }

    if (!task) {
      return [
        { label: "Task type", value: "Appointment booking" },
        { label: "Execution path", value: "Controlled appointment demo" },
        { label: "Risk level", value: "Approval-gated" },
      ];
    }

    return [
      { label: "Task type", value: formatLabel(task.type) },
      { label: "Execution path", value: executionTargetLabel(task.executionTarget, "advanced") },
      { label: "Risk level", value: task.riskLevel },
    ];
  }, [approval, task, viewMode]);

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
      <section className="hero harbor-hero">
        <div className="hero-top">
          <div className="brand-lockup">
            <div className="brand-mark" aria-hidden="true">
              H
            </div>
            <div>
              <p className="eyebrow">{brand.name}</p>
              <p className="hero-tagline">{brand.tagline}</p>
            </div>
          </div>

          <div className="mode-switch" aria-label="View mode">
            {[brand.basicLabel, brand.advancedLabel].map((label) => {
              const mode = label.toLowerCase() as ViewMode;
              return (
                <button
                  key={mode}
                  type="button"
                  className={`mode-button ${viewMode === mode ? "active" : ""}`}
                  onClick={() => setViewMode(mode)}
                  aria-pressed={viewMode === mode}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="hero-copy">
          <h1>{brand.headline}</h1>
          <p>{brand.supportingCopy}</p>
          <p>{brand.exampleCopy}</p>
        </div>

        <div className="hero-grid">
          <div className="panel strong panel-pad stack">
            <div className="stack-tight">
              <div className="split-row">
                <div>
                  <p className="eyebrow">Start a run</p>
                  <strong className="section-title">What needs handling?</strong>
                </div>
                {task ? (
                  <span className={`status-pill status-${task.status}`}>{formatLabel(task.status)}</span>
                ) : null}
              </div>

              <p className="muted">
                Tell Harbor the outcome you want. It will gather the missing details,
                pause before the irreversible step, and keep the proof attached.
              </p>
            </div>

            <div>
              <label className="label" htmlFor="goal">
                Task request
              </label>
              <textarea
                id="goal"
                className="textarea"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Book me the earliest dentist appointment in Berlin."
              />
            </div>

            <div className="button-row">
              <button
                className="button primary"
                type="button"
                onClick={() => createTask(draft)}
                disabled={isWorking}
              >
                Start run
              </button>
              <a className="button secondary" href="/demo/appointments">
                Open demo workflow
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
        <section className="panel panel-pad alert-card">
          <strong>Run error</strong>
          <p className="muted">{error}</p>
        </section>
      ) : null}

      <section className="dashboard-grid">
        <div className="stack">
          <section className="panel strong panel-pad stack">
            <div className="split-row">
              <div>
                <p className="eyebrow">{viewMode === "basic" ? "Conversation" : "Task thread"}</p>
                <strong className="section-title">
                  {task?.goal ?? "Start a run to open the working conversation"}
                </strong>
              </div>
              {task ? (
                <span className={`status-pill status-${task.status}`}>{formatLabel(task.status)}</span>
              ) : null}
            </div>

            {task ? (
              <>
                {viewMode === "basic" ? (
                  <div className="approval-card summary-card">
                    <strong>Current status</strong>
                    <p>{basicStatusCopy(task, approval)}</p>
                    <p className="muted">
                      {task.nextPrompt ?? "Harbor will ask the next useful question only if it needs more detail."}
                    </p>
                  </div>
                ) : null}

                <div className="thread">
                  {visibleMessages.map((message) => (
                    <div key={message.id} className={`bubble ${message.role}`}>
                      <div className="bubble-head">
                        {message.role} · {formatDate(message.createdAt)}
                      </div>
                      <div>{message.content}</div>
                    </div>
                  ))}
                </div>

                <div className="stack">
                  <div>
                    <label className="label" htmlFor="follow-up">
                      {viewMode === "basic" ? "Reply to Harbor" : "Reply to the agent"}
                    </label>
                    <textarea
                      id="follow-up"
                      className="textarea"
                      value={followUp}
                      onChange={(event) => setFollowUp(event.target.value)}
                      placeholder="My name is Alex Example, I have public insurance, and my email is alex@example.com."
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
                Harbor will keep the conversation, approval step, and proof bundle in one place
                after the first run starts.
              </div>
            )}
          </section>

          {viewMode === "advanced" && task ? (
            <section className="panel panel-pad stack">
              <p className="eyebrow">Progress timeline</p>
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

          {viewMode === "basic" ? (
            <>
              <section className="panel panel-pad stack">
                <p className="eyebrow">Run summary</p>
                <div className="summary-list">
                  <div className="summary-item">
                    <span className="label">Execution path</span>
                    <strong>{executionTargetLabel(task?.executionTarget ?? "demo", "basic")}</strong>
                  </div>
                  <div className="summary-item">
                    <span className="label">Current workflow</span>
                    <strong>{task?.targetService ?? "Doctor and dentist appointment search"}</strong>
                  </div>
                  <div className="summary-item">
                    <span className="label">Latest update</span>
                    <strong>
                      {task && recentTimeline[0]
                        ? `${recentTimeline[0].label} · ${formatDate(recentTimeline[0].createdAt)}`
                        : "Waiting for the first run"}
                    </strong>
                  </div>
                  <div className="summary-item">
                    <span className="label">Proof bundle</span>
                    <strong>{proofBundleCopy(task)}</strong>
                  </div>
                </div>
              </section>

              <section className="panel panel-pad stack">
                <p className="eyebrow">Proof at a glance</p>
                {task && recentArtifacts.length > 0 ? (
                  <div className="artifact-grid compact">
                    {recentArtifacts.map((artifact) => (
                      <article key={artifact.id} className="artifact-card compact">
                        {artifact.kind === "screenshot" && artifact.href ? (
                          <img src={artifact.href} alt={artifact.title} />
                        ) : null}
                        <strong>{artifact.title}</strong>
                        <p>{artifact.summary}</p>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="approval-card">
                    <strong>No proof yet</strong>
                    <p className="muted">
                      Harbor will attach screenshots, extracted slots, and confirmation details
                      as the run advances.
                    </p>
                  </div>
                )}
              </section>

              <section className="panel panel-pad stack">
                <p className="eyebrow">Recent progress</p>
                {task && recentTimeline.length > 0 ? (
                  <div className="timeline">
                    {recentTimeline.map((event) => (
                      <div key={event.id} className="timeline-item">
                        <strong>{event.label}</strong>
                        <p>{event.detail}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="approval-card">
                    <strong>Quiet until the first step</strong>
                    <p className="muted">
                      Harbor keeps the timeline compact in Basic mode and expands it in Advanced
                      mode.
                    </p>
                  </div>
                )}
              </section>
            </>
          ) : null}

          {viewMode === "advanced" && task ? (
            <>
              <section className="panel panel-pad stack">
                <p className="eyebrow">Evidence</p>
                <div className="artifact-grid">
                  {recentArtifacts.map((artifact) => (
                    <article key={artifact.id} className="artifact-card">
                      {artifact.kind === "screenshot" && artifact.href ? (
                        <img src={artifact.href} alt={artifact.title} />
                      ) : null}
                      <strong>{artifact.title}</strong>
                      <p>{artifact.summary}</p>
                      {artifact.content ? <pre className="code-block">{artifact.content}</pre> : null}
                    </article>
                  ))}
                </div>
              </section>

              <section className="detail-grid">
                <div className="panel panel-pad stack">
                  <p className="eyebrow">Langfuse trace story</p>
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
                  <p className="eyebrow">Eval hooks</p>
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
            </>
          ) : null}
        </div>
      </section>
    </main>
  );
}
