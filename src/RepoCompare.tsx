import { m } from "motion/react";
import { useRef, useState } from "react";
import { branchAges, commitDates, summarizeActivity } from "./activity";
import { ago } from "./community";
import type { HistoryEntry } from "./Home";
import { scanRepository, type Snapshot } from "./scan";
import { Icon, t } from "./ui";

type Metric = { label: string; a: number | null; b: number | null; unit?: string; format?: (value: number) => string };

/** Plain numbers for side-by-side reading; no "better/worse" judgement is implied. */
export function metricsFor(snapshot: Snapshot) {
  const ages = branchAges(snapshot);
  const activity = summarizeActivity(commitDates(snapshot), snapshot.observedAt);
  const perWeek =
    activity.total > 1 && activity.spanDays > 0 ? Math.round((activity.total / activity.spanDays) * 7 * 10) / 10 : null;
  return {
    stars: snapshot.stars,
    forks: snapshot.meta?.forks ?? null,
    openThreads: snapshot.meta?.openIssues ?? null,
    findings: snapshot.findings.length,
    review: snapshot.findings.filter((finding) => finding.severity === "review").length,
    todos: snapshot.findings.filter((finding) => finding.id.startsWith("todo:")).length,
    quietBranches: ages.filter((age) => age.days >= 90).length,
    oldestBranch: ages.length ? ages[0].days : null,
    lastCommit: activity.latestAgeDays,
    perWeek,
    files: snapshot.files.length,
  };
}

export function Compare({
  snapshot,
  history,
}: {
  snapshot: Snapshot;
  history: HistoryEntry[];
}) {
  const [input, setInput] = useState("");
  const [other, setOther] = useState<Snapshot | null>(null);
  const [status, setStatus] = useState<{ busy: boolean; progress: string; error: string }>({ busy: false, progress: "", error: "" });
  const controller = useRef<AbortController | null>(null);

  async function run(value: string) {
    const target = /^[A-Za-z0-9][\w.-]*\/[\w.-]+$/.test(value.trim()) ? `https://github.com/${value.trim()}` : value;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setStatus({ busy: true, progress: "Opening the repository…", error: "" });
    try {
      const result = await scanRepository(target, abort.signal, (progress) => setStatus((s) => ({ ...s, progress })));
      if (result.repository.toLowerCase() === snapshot.repository.toLowerCase())
        throw new Error("Pick a different repository to compare with.");
      setOther(result);
      setStatus({ busy: false, progress: "", error: "" });
    } catch (error) {
      if (abort.signal.aborted) return setStatus({ busy: false, progress: "", error: "" });
      setStatus({ busy: false, progress: "", error: error instanceof Error ? error.message : "Scan failed." });
    }
  }

  const picks = history.filter((entry) => entry.repository.toLowerCase() !== snapshot.repository.toLowerCase()).slice(0, 5);
  const a = metricsFor(snapshot);
  const b = other ? metricsFor(other) : null;
  const rows: Metric[] = [
    { label: "Stars", a: a.stars, b: b?.stars ?? null },
    { label: "Forks", a: a.forks, b: b?.forks ?? null },
    { label: "Open issues + PRs", a: a.openThreads, b: b?.openThreads ?? null },
    { label: "Sampled traces", a: a.findings, b: b?.findings ?? null },
    { label: "Need review", a: a.review, b: b?.review ?? null },
    { label: "TODO / FIXME markers", a: a.todos, b: b?.todos ?? null },
    { label: "Quiet branches (90d+)", a: a.quietBranches, b: b?.quietBranches ?? null },
    { label: "Oldest branch tip", a: a.oldestBranch, b: b?.oldestBranch ?? null, unit: "d" },
    { label: "Days since last commit", a: a.lastCommit, b: b?.lastCommit ?? null, unit: "d" },
    { label: "Commits per week", a: a.perWeek, b: b?.perWeek ?? null },
    { label: "Files in tree", a: a.files, b: b?.files ?? null },
  ];

  return (
    <div className="compare-view">
      <form
        className="block compare-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (input.trim()) void run(input);
        }}
      >
        <label htmlFor="compare-url" className="eyebrow">
          Compare {snapshot.repository} with
        </label>
        <div className="compare-row">
          <div className="scan-field">
            <input
              id="compare-url"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="owner/repo"
              spellCheck={false}
              autoComplete="off"
              disabled={status.busy}
            />
          </div>
          <button className="btn btn-primary" disabled={status.busy || !input.trim()}>
            <Icon name={status.busy ? "loader" : "compare"} size={15} className={status.busy ? "spin" : ""} />
            {status.busy ? "Scanning…" : "Compare · up to 8 requests"}
          </button>
        </div>
        {picks.length > 0 && (
          <p className="compare-picks">
            Recent:
            {picks.map((entry) => (
              <button
                key={entry.repository}
                type="button"
                className="label-chip"
                onClick={() => {
                  setInput(entry.repository);
                  void run(entry.repository);
                }}
                disabled={status.busy}
              >
                {entry.repository}
              </button>
            ))}
          </p>
        )}
        {status.busy && <p className="fine">{status.progress}</p>}
        {status.error && (
          <p className="inline-error" role="alert">
            {status.error}
          </p>
        )}
        <p className="fine">
          Recent scans are reused from the 45-minute cache. Both sides are bounded samples, so
          differences describe what was read, not overall quality.
        </p>
      </form>

      {other && b ? (
        <section className="block compare-table" aria-label="Side-by-side comparison">
          <div className="compare-heads">
            <div className="compare-head side-a">
              <span className="eyebrow">This repository</span>
              <strong>{snapshot.repository}</strong>
              <span className="muted">{snapshot.description}</span>
            </div>
            <div className="compare-head side-b">
              <span className="eyebrow">Compared with</span>
              <strong>{other.repository}</strong>
              <span className="muted">
                {other.description} · scanned {ago(other.observedAt, new Date().toISOString())}
              </span>
            </div>
          </div>
          <ul className="butterfly">
            {rows.map((row, index) => {
              const peak = Math.max(1, row.a ?? 0, row.b ?? 0);
              const fmt = (value: number | null) =>
                value === null ? "—" : `${value.toLocaleString()}${row.unit ?? ""}`;
              return (
                <li key={row.label}>
                  <span className={`bf-value a ${row.a !== null && row.b !== null && row.a > row.b ? "is-more" : ""}`}>
                    {fmt(row.a)}
                  </span>
                  <span className="bf-bar a" aria-hidden="true">
                    <m.i
                      initial={{ width: 0 }}
                      animate={{ width: `${((row.a ?? 0) / peak) * 100}%` }}
                      transition={{ delay: t(index * 0.03), duration: t(0.5), ease: [0.22, 1, 0.36, 1] }}
                    />
                  </span>
                  <span className="bf-label">{row.label}</span>
                  <span className="bf-bar b" aria-hidden="true">
                    <m.i
                      initial={{ width: 0 }}
                      animate={{ width: `${((row.b ?? 0) / peak) * 100}%` }}
                      transition={{ delay: t(index * 0.03), duration: t(0.5), ease: [0.22, 1, 0.36, 1] }}
                    />
                  </span>
                  <span className={`bf-value b ${row.a !== null && row.b !== null && row.b > row.a ? "is-more" : ""}`}>
                    {fmt(row.b)}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="fine compare-note">
            “—” means the snapshot does not include that field (for example, reports saved before
            repository facts were captured).
          </p>
        </section>
      ) : (
        <div className="block compare-empty">
          <Icon name="compare" size={26} />
          <p>Pick a repository to see both side by side.</p>
        </div>
      )}
    </div>
  );
}
