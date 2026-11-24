import { motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CodeFrequency, Donut, PunchCard } from "./charts";
import { ago, profileUrl } from "./community";
import {
  branchRefs,
  commitType,
  commitTypeBreakdown,
  layoutGraph,
  type CommitDetail,
  type Graph,
  type GraphRow,
  type Insights,
} from "./history";
import { Avatar } from "./People";
import type { Snapshot } from "./scan";
import { Icon, NumberTicker, Skeleton, t } from "./ui";
import type { Loadable } from "./useCommunity";

const ROW = 44;
const LANE = 16;
const PAD = 12;
const laneX = (lane: number) => PAD + lane * LANE;
const curve = (x1: number, y1: number, x2: number, y2: number) => {
  const mid = (y1 + y2) / 2;
  return `M${x1} ${y1} C${x1} ${mid} ${x2} ${mid} ${x2} ${y2}`;
};
const TYPE_CLASS: Record<string, string> = {
  feat: "ct-feat",
  fix: "ct-fix",
  deps: "ct-deps",
  docs: "ct-docs",
  test: "ct-test",
  refactor: "ct-refactor",
  chore: "ct-chore",
  merge: "ct-merge",
  other: "ct-other",
};

type Props = {
  snapshot: Snapshot;
  auto: boolean;
  graph: Loadable<Graph>;
  insights: Loadable<Insights>;
  commits: Record<string, Loadable<CommitDetail>>;
  onLoadGraph: () => void;
  onLoadInsights: () => void;
  onLoadCommit: (sha: string) => void;
  onAuto: () => void;
};

export function Commits({ snapshot, auto, graph, insights, commits, onLoadGraph, onLoadInsights, onLoadCommit, onAuto }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const started = useRef(false);
  useEffect(() => {
    if (started.current || !auto) return;
    if (graph.status !== "idle" && insights.status !== "idle") return;
    started.current = true;
    onAuto();
  }, [auto, graph.status, insights.status, onAuto]);

  const data = graph.data;
  const layout = useMemo(() => (data ? layoutGraph(data.commits) : null), [data]);
  const loaded = useMemo(() => new Set(data?.commits.map((commit) => commit.sha)), [data]);
  const stats = useMemo(() => {
    const list = data?.commits ?? [];
    const authors = new Set(list.map((commit) => commit.author));
    const merges = list.filter((commit) => commit.parents.length > 1).length;
    const weekday = new Array(7).fill(0);
    for (const commit of list) weekday[new Date(commit.date).getDay()]++;
    const busiest = weekday.indexOf(Math.max(...weekday));
    return { total: list.length, authors: authors.size, merges, busiest };
  }, [data]);
  const types = useMemo(() => commitTypeBreakdown(data?.commits ?? []), [data]);

  useEffect(() => {
    if (!selected && data?.commits[0]) setSelected(data.commits[0].sha);
  }, [data, selected]);
  useEffect(() => {
    if (selected && !commits[selected]) onLoadCommit(selected);
  }, [selected, commits, onLoadCommit]);

  const branches = branchRefs(snapshot);
  const cost = 1 + branches.length;

  if (graph.status === "idle" || graph.status === "error")
    return (
      <section className="load-panel" aria-label="Commit graph">
        <div className="load-icon" aria-hidden="true">
          <Icon name="graph" size={20} />
        </div>
        <div>
          <h3>{graph.status === "error" ? "Couldn’t read the commit history" : "Commit graph"}</h3>
          <p>
            {graph.status === "error"
              ? graph.error
              : graph.note
                ? graph.note
                : `Draws the last 40 commits on ${snapshot.defaultBranch} and up to 15 on each sampled branch as a lane graph, with merges, branch labels, authors, and per-commit file changes.`}
          </p>
          <div className="load-actions">
            <button className="btn btn-primary" onClick={onLoadGraph}>
              <Icon name="refresh" size={15} />
              {graph.status === "error" ? "Try again" : "Load graph"} · {cost} {cost === 1 ? "request" : "requests"}
            </button>
          </div>
        </div>
      </section>
    );

  const needle = query.trim().toLowerCase();
  const matches = (row: GraphRow) =>
    !needle ||
    `${row.commit.message} ${row.commit.author} ${row.commit.sha} ${row.commit.refs.join(" ")}`
      .toLowerCase()
      .includes(needle);
  const graphWidth = layout ? PAD * 2 + (layout.width - 1) * LANE : 40;
  const current = data?.commits.find((commit) => commit.sha === selected) ?? null;
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  return (
    <div className="commits">
      <dl className="kpis">
        <div>
          <dt>Commits drawn</dt>
          <dd>{graph.status === "loading" ? "—" : <NumberTicker value={stats.total} />}</dd>
        </div>
        <div>
          <dt>Authors</dt>
          <dd>{graph.status === "loading" ? "—" : <NumberTicker value={stats.authors} />}</dd>
        </div>
        <div>
          <dt>Merge commits</dt>
          <dd>{graph.status === "loading" ? "—" : <NumberTicker value={stats.merges} />}</dd>
        </div>
        <div>
          <dt>Busiest weekday</dt>
          <dd className="kpi-text">{graph.status === "loading" || !stats.total ? "—" : days[stats.busiest]}</dd>
        </div>
      </dl>

      <div className="commits-split">
        <section className="block graph-block" aria-labelledby="graph-title">
          <header className="block-head">
            <Icon name="graph" size={15} className="block-icon" />
            <h3 id="graph-title">Commit graph</h3>
            {data && (
              <span className="block-note">
                {data.branches.length} {data.branches.length === 1 ? "branch" : "branches"}
                {data.truncated ? " · older history not loaded" : ""}
              </span>
            )}
          </header>
          {graph.status === "loading" || !layout ? (
            <div className="chart-pad">
              <Skeleton lines={8} />
            </div>
          ) : (
            <>
              <div className="graph-tools">
                <label className="search">
                  <Icon name="search" size={15} />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    aria-label="Highlight commits"
                    placeholder="Highlight by message, author, sha, or branch"
                  />
                </label>
                <ul className="graph-legend" aria-label="Branches">
                  {data!.branches.map((branch, index) => (
                    <li key={branch}>
                      <i className={`lane-swatch lane-${index % 6}`} />
                      {branch}
                    </li>
                  ))}
                </ul>
              </div>
              <ol className="graph" aria-label={`Commit graph, ${layout.rows.length} commits, newest first`}>
                {layout.rows.map((row, index) => (
                  <motion.li
                    key={row.commit.sha}
                    className={`graph-row ${selected === row.commit.sha ? "is-selected" : ""} ${matches(row) ? "" : "is-dim"}`}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: t(Math.min(index, 25) * 0.015), duration: t(0.25)}}
                  >
                    <button
                      className="graph-hit"
                      onClick={() => setSelected(row.commit.sha)}
                      aria-pressed={selected === row.commit.sha}
                    >
                      <GraphCell row={row} width={graphWidth} loaded={loaded} last={index === layout.rows.length - 1} />
                      <span className="graph-main">
                        <span className="graph-msg">
                          {row.commit.refs.map((ref) => (
                            <span key={ref} className={`ref ${ref === snapshot.defaultBranch ? "ref-head" : ""}`}>
                              <Icon name="branch" size={11} />
                              {ref}
                            </span>
                          ))}
                          <span className={`ct-dot ${TYPE_CLASS[commitType(row.commit)]}`} aria-hidden="true" />
                          <span className="graph-text">{row.commit.message}</span>
                        </span>
                        <span className="graph-meta">
                          <Avatar id={row.commit.avatarId} login={row.commit.author} size={16} />
                          {row.commit.author} · {ago(row.commit.date, data!.fetchedAt)}
                          {row.commit.parents.length > 1 ? " · merge" : ""}
                        </span>
                      </span>
                      <code className="graph-sha">{row.commit.sha.slice(0, 7)}</code>
                    </button>
                  </motion.li>
                ))}
              </ol>
            </>
          )}
        </section>

        <CommitPanel
          repository={snapshot.repository}
          commit={current}
          detail={current ? commits[current.sha] : undefined}
          now={data?.fetchedAt ?? snapshot.observedAt}
          onRetry={() => current && onLoadCommit(current.sha)}
          onSelect={setSelected}
          loaded={loaded}
        />
      </div>

      <div className="ov-grid">
        <section className="block span-4" aria-labelledby="types-title">
          <header className="block-head">
            <Icon name="tag" size={15} className="block-icon" />
            <h3 id="types-title">What changed</h3>
            <span className="block-note">by commit message</span>
          </header>
          {types.length ? (
            <div className="donut-wrap stacked">
              <Donut
                label={`Commit types: ${types.map((type) => `${type.label} ${type.value}`).join(", ")}`}
                center={String(stats.total)}
                caption="commits"
                segments={types.map((type) => ({ ...type, className: TYPE_CLASS[type.key] }))}
              />
              <ul className="group-list legend-list">
                {types.map((type) => (
                  <li key={type.key}>
                    <span className={`legend-swatch ${TYPE_CLASS[type.key]}`} aria-hidden="true" />
                    <span className="group-name">{type.label}</span>
                    <span className="group-count">{type.value}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="chart-pad">
              <Skeleton lines={4} />
            </div>
          )}
        </section>

        <section className="block span-8" aria-labelledby="punch-title">
          <header className="block-head">
            <Icon name="clock" size={15} className="block-icon" />
            <h3 id="punch-title">When commits happen</h3>
            <span className="block-note">all history · each commit’s own time zone</span>
          </header>
          <InsightBody insights={insights} onLoad={onLoadInsights} pendingKey="Commit hours">
            {(value) =>
              value.punch?.length ? <PunchCard punches={value.punch} /> : <p className="block-empty">No hourly data.</p>
            }
          </InsightBody>
        </section>

        <section className="block span-12" aria-labelledby="freq-title">
          <header className="block-head">
            <Icon name="diff" size={15} className="block-icon" />
            <h3 id="freq-title">Code frequency</h3>
            <span className="block-note">lines added and removed per week · symmetric log scale</span>
          </header>
          <InsightBody insights={insights} onLoad={onLoadInsights} pendingKey="Code frequency">
            {(value) =>
              value.frequency?.length ? (
                <>
                  <CodeFrequency weeks={value.frequency} />
                  <p className="legend">
                    <span><i className="legend-swatch sw-add" /> Additions</span>
                    <span><i className="legend-swatch sw-del" /> Deletions</span>
                  </p>
                </>
              ) : (
                <p className="block-empty">
                  GitHub does not provide weekly code frequency for this repository (it is
                  omitted for repositories with 10,000+ commits).
                </p>
              )
            }
          </InsightBody>
        </section>
      </div>
    </div>
  );
}

function InsightBody({
  insights,
  onLoad,
  pendingKey,
  children,
}: {
  insights: Loadable<Insights>;
  onLoad: () => void;
  pendingKey: string;
  children: (value: Insights) => React.ReactNode;
}) {
  if (insights.status === "loading")
    return (
      <div className="chart-pad">
        <Skeleton lines={4} />
      </div>
    );
  if (insights.status !== "ready" || !insights.data)
    return (
      <div className="load-inline">
        <p>
          {insights.status === "error"
            ? insights.error
            : insights.note || "Repository statistics load on request."}
        </p>
        <button className="btn btn-plain" onClick={onLoad}>
          <Icon name="refresh" size={15} />
          {insights.status === "error" ? "Try again" : "Load"} · 2 requests
        </button>
      </div>
    );
  if (insights.data.pending.includes(pendingKey))
    return (
      <div className="load-inline">
        <p>GitHub is still computing these statistics. Try again in a minute.</p>
        <button className="btn btn-plain" onClick={onLoad}>
          <Icon name="refresh" size={15} />
          Refresh · 2 requests
        </button>
      </div>
    );
  return <div className="chart-pad">{children(insights.data)}</div>;
}

function GraphCell({
  row,
  width,
  loaded,
  last,
}: {
  row: GraphRow;
  width: number;
  loaded: Set<string>;
  last: boolean;
}) {
  const mid = ROW / 2;
  const x = laneX(row.lane);
  const merge = row.commit.parents.length > 1;
  return (
    <svg className="graph-cell" width={width} height={ROW} aria-hidden="true">
      {row.before.map((sha, lane) => {
        if (sha === null) return null;
        if (lane === row.lane)
          return <line key={`in-${lane}`} x1={x} y1={0} x2={x} y2={mid} className={`edge lane-${lane % 6}`} />;
        if (row.joins.includes(lane))
          return <path key={`in-${lane}`} d={curve(laneX(lane), 0, x, mid)} className={`edge lane-${lane % 6}`} />;
        return (
          <line
            key={`pass-${lane}`}
            x1={laneX(lane)}
            y1={0}
            x2={laneX(lane)}
            y2={ROW}
            className={`edge lane-${lane % 6}`}
          />
        );
      })}
      {row.commit.parents.map((parent, index) => {
        const target = row.parentLanes[index];
        const fade = !loaded.has(parent);
        const className = `edge lane-${target % 6} ${fade && last ? "edge-fade" : ""} ${fade ? "edge-open" : ""}`;
        return target === row.lane ? (
          <line key={`out-${parent}`} x1={x} y1={mid} x2={x} y2={ROW} className={className} />
        ) : (
          <path key={`out-${parent}`} d={curve(x, mid, laneX(target), ROW)} className={className} />
        );
      })}
      <motion.circle
        cx={x}
        cy={mid}
        className={`node lane-${row.lane % 6} ${merge ? "is-merge" : ""} ${row.commit.refs.length ? "is-ref" : ""}`}
        initial={{ r: 0 }}
        animate={{ r: merge ? 5.5 : row.commit.refs.length ? 6 : 4.5 }}
        transition={{ duration: t(0.3)}}
      />
    </svg>
  );
}

function CommitPanel({
  repository,
  commit,
  detail,
  now,
  onRetry,
  onSelect,
  loaded,
}: {
  repository: string;
  commit: Graph["commits"][number] | null;
  detail?: Loadable<CommitDetail>;
  now: string;
  onRetry: () => void;
  onSelect: (sha: string) => void;
  loaded: Set<string>;
}) {
  if (!commit)
    return (
      <aside className="commit-panel is-empty">
        <Icon name="graph" size={26} />
        <p>Select a commit to see its files.</p>
      </aside>
    );
  const data = detail?.data;
  const total = data ? Math.max(1, data.additions + data.deletions) : 1;
  const peak = data ? Math.max(1, ...data.files.map((file) => file.additions + file.deletions)) : 1;
  return (
    <motion.aside
      key={commit.sha}
      className="commit-panel"
      aria-labelledby="commit-title"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: t(0.22)}}
    >
      <p className="eyebrow">
        Commit <code>{commit.sha.slice(0, 10)}</code>
        {data?.verified && (
          <span className="tag tag-done verified">
            <Icon name="shield" size={11} /> Verified
          </span>
        )}
      </p>
      <h3 id="commit-title">{commit.message}</h3>
      <div className="issue-people">
        <Avatar id={commit.avatarId} login={commit.author} size={28} />
        <p className="issue-byline">
          {commit.login ? (
            <a href={profileUrl(commit.login)} target="_blank" rel="noreferrer">
              <strong>{commit.author}</strong>
            </a>
          ) : (
            <strong>{commit.author}</strong>
          )}{" "}
          committed {ago(commit.date, now)} · {new Date(commit.date).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
        </p>
      </div>
      {commit.parents.length > 0 && (
        <p className="parents">
          {commit.parents.length > 1 ? "Parents" : "Parent"}{" "}
          {commit.parents.map((parent) =>
            loaded.has(parent) ? (
              <button key={parent} className="link-btn mono" onClick={() => onSelect(parent)}>
                {parent.slice(0, 7)}
              </button>
            ) : (
              <code key={parent} className="muted">
                {parent.slice(0, 7)}
              </code>
            ),
          )}
        </p>
      )}
      {!detail || detail.status === "loading" ? (
        <Skeleton lines={5} />
      ) : detail.status === "error" ? (
        <div className="load-inline">
          <p className="inline-error" role="alert">
            {detail.error}
          </p>
          <button className="btn btn-plain" onClick={onRetry}>
            Try again · 1 request
          </button>
        </div>
      ) : (
        data && (
          <>
            {data.message.includes("\n") && <pre className="commit-body">{data.message.split("\n").slice(1).join("\n").trim()}</pre>}
            <div className="diffstat">
              <span className="add">+{data.additions.toLocaleString()}</span>
              <span className="del">−{data.deletions.toLocaleString()}</span>
              <span className="diffbar" aria-hidden="true">
                <motion.i className="add" initial={{ width: 0 }} animate={{ width: `${(data.additions / total) * 100}%` }} />
                <motion.i className="del" initial={{ width: 0 }} animate={{ width: `${(data.deletions / total) * 100}%` }} />
              </span>
              <span className="muted">
                {data.files.length}
                {data.moreFiles ? "+" : ""} files
              </span>
            </div>
            <ul className="file-list" aria-label="Changed files">
              {data.files.map((file, index) => (
                <motion.li
                  key={file.path}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: t(Math.min(index, 20) * 0.015)}}
                >
                  <span className={`file-status st-${file.status}`} title={file.status}>
                    <Icon
                      name={file.status === "added" ? "file-add" : file.status === "removed" ? "file-del" : "file-edit"}
                      size={13}
                    />
                  </span>
                  <a href={file.url} target="_blank" rel="noreferrer" className="file-path" title={file.path}>
                    {file.path}
                  </a>
                  <span className="file-bar" aria-label={`${file.additions} added, ${file.deletions} removed`}>
                    <i className="add" style={{ width: `${(file.additions / peak) * 100}%` }} />
                    <i className="del" style={{ width: `${(file.deletions / peak) * 100}%` }} />
                  </span>
                  <span className="file-num">
                    <span className="add">+{file.additions}</span> <span className="del">−{file.deletions}</span>
                  </span>
                </motion.li>
              ))}
            </ul>
          </>
        )
      )}
      <a
        className="btn btn-plain"
        href={`https://github.com/${repository}/commit/${commit.sha}`}
        target="_blank"
        rel="noreferrer"
      >
        Open commit on GitHub <Icon name="link" size={14} />
      </a>
    </motion.aside>
  );
}
