import { useCallback, useEffect, useState } from "react";
import type {
  ArchitectureConsoleState,
  ArchitectureFindingItem,
  DeveloperProposal
} from "./types";

async function fetchArchitectureConsole(): Promise<ArchitectureConsoleState | null> {
  const res = await fetch("/api/developer-console");
  if (!res.ok) return null;
  return res.json();
}

function findingKey(item: string | ArchitectureFindingItem, index: number): string {
  if (typeof item === "string") return `s-${index}-${item.slice(0, 24)}`;
  return item.id ?? `o-${index}-${item.title ?? "finding"}`;
}

function FindingEntry({ item }: { item: string | ArchitectureFindingItem }) {
  if (typeof item === "string") {
    return <li>{item}</li>;
  }
  return (
    <li className="arch-finding-entry">
      {item.id ? (
        <span className="arch-finding-id">{item.id}</span>
      ) : null}
      {item.title ? <strong className="arch-finding-title">{item.title}</strong> : null}
      {item.summary ? <p className="arch-finding-summary">{item.summary}</p> : null}
      {item.impact ? <p className="arch-finding-impact">Impact: {item.impact}</p> : null}
      {item.files?.length ? (
        <ul className="arch-finding-files">
          {item.files.slice(0, 5).map((f) => (
            <li key={f}>
              <code>{f}</code>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function FindingList({
  title,
  items,
  level
}: {
  title: string;
  items: Array<string | ArchitectureFindingItem>;
  level: "critical" | "high" | "medium";
}) {
  if (!items?.length) return null;
  return (
    <div className={`arch-findings-block arch-findings-${level}`}>
      <h4>{title}</h4>
      <ul className="arch-findings-items">
        {items.map((item, i) => (
          <FindingEntry key={findingKey(item, i)} item={item} />
        ))}
      </ul>
    </div>
  );
}

function ProposalPanel({
  proposal,
  onApprove,
  onDiscard,
  busy
}: {
  proposal: DeveloperProposal;
  onApprove: () => void;
  onDiscard: () => void;
  busy: boolean;
}) {
  const v = proposal.verification;
  const status = proposal.status ?? "unknown";

  if (status === "running") {
    return (
      <section className="card dev-proposal-card dev-proposal-running">
        <h2>Sandbox implement</h2>
        <p className="developer-console-muted">
          Agent running in isolated worktree… watch Terminal tab{" "}
          <code>Developer implement</code>. This panel refreshes automatically.
        </p>
      </section>
    );
  }

  if (status === "pending_approval") {
    const rateAfter = v?.successRateAfter ?? 0;
    const rateBefore = v?.successRateBefore ?? 0;
    const verifyOk = v?.ok ?? false;
    return (
      <section className="card dev-proposal-card dev-proposal-pending">
        <h2>Sandbox proposal — review &amp; approve</h2>
        <p className="arch-meta">
          Job <code>{proposal.jobId}</code>
          {proposal.completedAt ? ` · completed ${proposal.completedAt}` : ""}
          {proposal.sandboxAlive === false ? (
            <span className="dev-proposal-warn"> · sandbox worktree missing</span>
          ) : null}
        </p>

        <div className="dev-proposal-metrics">
          <div className={`dev-metric ${verifyOk ? "dev-metric-pass" : "dev-metric-warn"}`}>
            <span className="dev-metric-label">Verification</span>
            <strong>{verifyOk ? "PASS" : "REVIEW"}</strong>
          </div>
          <div className="dev-metric">
            <span className="dev-metric-label">Portfolio success rate</span>
            <strong>
              {rateBefore}% → {rateAfter}%
              {v?.successRateDelta ? (
                <span className="dev-metric-delta">
                  {" "}
                  ({v.successRateDelta >= 0 ? "+" : ""}
                  {v.successRateDelta}%)
                </span>
              ) : null}
            </strong>
          </div>
          <div className="dev-metric">
            <span className="dev-metric-label">Supervisor tests</span>
            <strong>{v?.supervisorExit === 0 ? "pass" : `exit ${v?.supervisorExit ?? "?"}`}</strong>
          </div>
          {v?.regressionExit !== null && v?.regressionExit !== undefined ? (
            <div className="dev-metric">
              <span className="dev-metric-label">Regression tier</span>
              <strong>{v.regressionExit === 0 ? "pass" : `exit ${v.regressionExit}`}</strong>
            </div>
          ) : null}
        </div>

        {proposal.changedFiles?.length ? (
          <div className="dev-proposal-files">
            <h3>Changed files ({proposal.changedFiles.length})</h3>
            <ul>
              {proposal.changedFiles.map((f) => (
                <li key={f}>
                  <code>{f}</code>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {proposal.report?.excerpt ? (
          <div className="dev-proposal-report">
            <h3>
              Agent report <code>{proposal.report.path}</code>
            </h3>
            <pre className="dev-raw-log dev-raw-log-collapsed">{proposal.report.excerpt.slice(0, 1200)}…</pre>
          </div>
        ) : null}

        <p className="arch-section-blurb">
          Changes live in an isolated git worktree until you approve. Approve copies files to your
          main repo; Discard deletes the sandbox.
        </p>

        <div className="dev-proposal-actions">
          <button
            type="button"
            className="dev-trigger-btn dev-trigger-primary"
            disabled={busy || proposal.sandboxAlive === false}
            onClick={onApprove}
          >
            {busy ? "Applying…" : "Approve & apply to main"}
          </button>
          <button type="button" className="dev-trigger-btn dev-trigger-danger" disabled={busy} onClick={onDiscard}>
            Discard sandbox
          </button>
        </div>
      </section>
    );
  }

  if (status === "approved") {
    return (
      <section className="card dev-proposal-card dev-proposal-approved">
        <h2>Last proposal — applied</h2>
        <p className="arch-meta">
          {proposal.approvedAt ? `Approved ${proposal.approvedAt}` : ""} ·{" "}
          {proposal.promotedFiles?.length ?? 0} file(s) copied to main
        </p>
      </section>
    );
  }

  if (status === "discarded") {
    return (
      <section className="card dev-proposal-card">
        <h2>Last proposal — discarded</h2>
        <p className="developer-console-muted">Sandbox torn down without applying changes.</p>
      </section>
    );
  }

  if (status === "failed") {
    return (
      <section className="card dev-proposal-card dev-proposal-failed">
        <h2>Sandbox implement — failed</h2>
        <p className="dev-proposal-warn">{proposal.error ?? "Agent or verification failed"}</p>
      </section>
    );
  }

  return null;
}

export function DeveloperConsolePage() {
  const [data, setData] = useState<ArchitectureConsoleState | null>(null);
  const [loading, setLoading] = useState(true);
  const [auditing, setAuditing] = useState(false);
  const [implementing, setImplementing] = useState(false);
  const [proposalBusy, setProposalBusy] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [showContext, setShowContext] = useState(false);
  const [showAudit, setShowAudit] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const next = await fetchArchitectureConsole();
      setData(next);
      setApiError(null);
    } catch {
      setApiError("Developer agent API unavailable");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 8000);
    return () => clearInterval(t);
  }, [refresh]);

  const runAudit = async () => {
    setAuditing(true);
    setApiError(null);
    try {
      const res = await fetch("/api/developer-console/audit", { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        setApiError(body.error ?? "Audit dispatch failed");
        return;
      }
    } catch (e) {
      setApiError(e instanceof Error ? e.message : String(e));
    } finally {
      setAuditing(false);
    }
  };

  const runImplement = async () => {
    setImplementing(true);
    setApiError(null);
    try {
      const res = await fetch("/api/developer-console/implement", { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        setApiError(body.error ?? "Implement dispatch failed");
        return;
      }
      void refresh();
    } catch (e) {
      setApiError(e instanceof Error ? e.message : String(e));
    } finally {
      setImplementing(false);
    }
  };

  const approveProposal = async () => {
    setProposalBusy(true);
    setApiError(null);
    try {
      const res = await fetch("/api/developer-console/proposal/approve", { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        setApiError(body.error ?? "Approve failed");
        return;
      }
      void refresh();
    } catch (e) {
      setApiError(e instanceof Error ? e.message : String(e));
    } finally {
      setProposalBusy(false);
    }
  };

  const discardProposal = async () => {
    setProposalBusy(true);
    setApiError(null);
    try {
      const res = await fetch("/api/developer-console/proposal/discard", { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        setApiError(body.error ?? "Discard failed");
        return;
      }
      void refresh();
    } catch (e) {
      setApiError(e instanceof Error ? e.message : String(e));
    } finally {
      setProposalBusy(false);
    }
  };

  const findings = data?.findings;
  const proposal = data?.proposal;
  const proposalBlocksImplement =
    proposal?.status === "pending_approval" || proposal?.status === "running";

  return (
    <div className="developer-page architecture-page">
      <header className="developer-page-header">
        <div>
          <h1>Developer Agent</h1>
          <p>
            Architecture and agent brain for this repo — pipeline layers, roles, locked decisions,
            and code-architect audits. Story fixes and test runs live on{" "}
            <strong>Tests Console</strong>.
          </p>
          {data ? (
            <p className="arch-phase">
              Active phase: <code>{data.activePhase}</code>
            </p>
          ) : null}
        </div>
        <div className="arch-header-actions">
          <button
            type="button"
            className="dev-trigger-btn dev-trigger-primary"
            disabled={!data?.hasCursorCli || auditing}
            onClick={() => void runAudit()}
            title="Read-only audit via code-architect-investigator skill"
          >
            {auditing ? "Opening Terminal…" : "Run architecture audit"}
          </button>
          <button
            type="button"
            className="dev-trigger-btn"
            disabled={
              !data?.hasCursorCli || implementing || proposalBlocksImplement || !findings?.recommendations?.length
            }
            onClick={() => void runImplement()}
            title="Implement top audit recommendations in isolated sandbox — approve before applying to main"
          >
            {implementing ? "Opening Terminal…" : "Implement in sandbox"}
          </button>
          <button type="button" className="dev-trigger-btn" onClick={() => void refresh()}>
            Refresh
          </button>
        </div>
      </header>

      {apiError ? (
        <div className="flow-hint api-error-banner">
          <span>{apiError}</span>
          <button type="button" className="pill-start" onClick={() => setApiError(null)}>
            Dismiss
          </button>
        </div>
      ) : null}

      {!data?.hasCursorCli ? (
        <p className="developer-console-warn">
          Cursor CLI not installed — architecture audit dispatch requires <code>agent</code> on PATH.
        </p>
      ) : null}

      {loading && !data ? (
        <p className="developer-console-muted">Loading architecture map…</p>
      ) : null}

      {proposal && proposal.status && proposal.status !== "unknown" ? (
        <ProposalPanel
          proposal={proposal}
          onApprove={() => void approveProposal()}
          onDiscard={() => void discardProposal()}
          busy={proposalBusy}
        />
      ) : null}

      {data ? (
        <>
          <section className="card arch-north-star">
            <h2>North star</h2>
            <p>{data.northStar}</p>
          </section>

          <section className="card">
            <h2>Visual pipeline</h2>
            <p className="arch-section-blurb">
              Hub: UniversalLayer JSON. Each step gates the next — shared adapters trigger Tier C
              regression.
            </p>
            <div className="arch-pipeline">
              {data.pipeline.map((step, i) => (
                <div key={step.id} className="arch-pipeline-step">
                  {i > 0 ? (
                    <span className="arch-pipeline-arrow" aria-hidden>
                      →
                    </span>
                  ) : null}
                  <div className="arch-pipeline-card">
                    <strong>{step.label}</strong>
                    {step.command ? <code className="arch-cmd">{step.command}</code> : null}
                    <p>{step.proves}</p>
                    <ul className="arch-file-list">
                      {step.files.map((f) => (
                        <li key={f}>
                          <code>{f}</code>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <div className="arch-two-col">
            <section className="card">
              <h2>Packages</h2>
              <table className="arch-table">
                <thead>
                  <tr>
                    <th>Package</th>
                    <th>Role</th>
                  </tr>
                </thead>
                <tbody>
                  {data.packages.map((p) => (
                    <tr key={p.name}>
                      <td>
                        <code>{p.name}</code>
                      </td>
                      <td>{p.role}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="card">
              <h2>Agent roles &amp; skill chain</h2>
              <p className="arch-section-blurb">
                Developer Agent composes lab skills + Superpowers plugin skills. Story fix workers
                are separate (Tests Console).
              </p>
              <ul className="arch-roles-list">
                {data.agentRoles.map((r) => (
                  <li key={r.role}>
                    <strong>{r.role}</strong>
                    <code>{r.skill}</code>
                    <span>{r.when}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <section className="card">
            <h2>Key brain files</h2>
            <table className="arch-table">
              <thead>
                <tr>
                  <th>Path</th>
                  <th>Role</th>
                  <th>Lines</th>
                </tr>
              </thead>
              <tbody>
                {data.keyFiles.map((f) => (
                  <tr key={f.path} className={f.exists ? "" : "arch-missing"}>
                    <td>
                      <code>{f.path}</code>
                    </td>
                    <td>{f.role}</td>
                    <td>{f.exists ? f.lines : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="card">
            <h2>Locked decisions</h2>
            <table className="arch-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Decision</th>
                  <th>Implication</th>
                </tr>
              </thead>
              <tbody>
                {data.decisions.map((d) => (
                  <tr key={d.id}>
                    <td>{d.id}</td>
                    <td>{d.title}</td>
                    <td>{d.implication}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <h3>Constraints</h3>
            <ul className="arch-constraints">
              {data.constraints.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </section>

          <section className="card arch-findings-card">
            <h2>Architecture findings</h2>
            {findings ? (
              <>
                <p className="arch-meta">
                  Last audit: {findings.auditedAt ?? "—"} · status:{" "}
                  <code>{findings.status ?? "unknown"}</code>
                </p>
                <FindingList title="Critical" items={findings.critical ?? []} level="critical" />
                <FindingList title="High" items={findings.high ?? []} level="high" />
                <FindingList
                  title="Medium / consolidation"
                  items={findings.medium ?? []}
                  level="medium"
                />
                {findings.recommendations?.length ? (
                  <div className="arch-findings-block">
                    <h4>Recommendations</h4>
                    <ol>
                      {findings.recommendations.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ol>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="developer-console-muted">
                No findings yet — run <strong>architecture audit</strong> to populate{" "}
                <code>.test-console/architecture-findings.json</code>
              </p>
            )}
          </section>

          {data.latestAudit ? (
            <section className="card">
              <div className="dev-raw-header">
                <h2>Latest audit report</h2>
                <button
                  type="button"
                  className="run-settings-toggle"
                  onClick={() => setShowAudit((v) => !v)}
                >
                  {showAudit ? "Collapse" : "Expand"}
                </button>
              </div>
              <p className="arch-meta">
                <code>{data.latestAudit.path}</code>
                {data.latestAudit.fullLength > 4000 ? " (truncated)" : ""}
              </p>
              {showAudit ? (
                <pre className="dev-raw-log">{data.latestAudit.excerpt}</pre>
              ) : (
                <pre className="dev-raw-log dev-raw-log-collapsed">
                  {data.latestAudit.excerpt.slice(0, 600)}…
                </pre>
              )}
            </section>
          ) : null}

          {data.specs.length > 0 ? (
            <section className="card">
              <h2>Specs</h2>
              <ul className="arch-specs-list">
                {data.specs.map((s) => (
                  <li key={s.path}>
                    <code>{s.path}</code>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {data.agentContextMarkdown ? (
            <section className="card">
              <div className="dev-raw-header">
                <h2>Agent context (auto)</h2>
                <button
                  type="button"
                  className="run-settings-toggle"
                  onClick={() => setShowContext((v) => !v)}
                >
                  {showContext ? "Hide" : "Show"}
                </button>
              </div>
              {showContext ? (
                <pre className="dev-raw-log">{data.agentContextMarkdown}</pre>
              ) : (
                <p className="developer-console-muted">
                  Orchestrator snapshot from <code>.cursor/agent-context.auto.md</code>
                </p>
              )}
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
