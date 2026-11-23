import {
  branchAges,
  commitDates,
  summarizeActivity,
  threadAgeBuckets,
  zoneCounts,
} from "./activity";
import {
  AgeHistogram,
  BranchAgeChart,
  CalendarHeatmap,
  CommitTimeline,
  Donut,
  RankBars,
  ReleaseTimeline,
} from "./charts";
import { avatarUrl } from "./community";
import { recentCommitters } from "./contributors";
import { ago, isQuiet, type Details, type Issue } from "./community";
import { ZONES, type Snapshot, type Zone } from "./scan";
import type { IssueList, Loadable } from "./useCommunity";
import { Icon, NumberTicker, Skeleton } from "./ui";

const day = (value: string) =>
  new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

type Props = {
  snapshot: Snapshot;
  onOpen: (id: string) => void;
  onBrowse: (zone: Zone | "all") => void;
  details: Loadable<Details>;
  onLoadDetails: () => void;
  threads: Loadable<IssueList>;
  onLoadThreads: () => void;
  onOpenThread: (kind: Issue["kind"], number: number) => void;
  onOpenPeople?: () => void;
};

function Block({
  id,
  icon,
  title,
  note,
  span,
  children,
  className = "",
}: {
  id: string;
  icon: string;
  title: string;
  note?: React.ReactNode;
  span: 4 | 5 | 6 | 7 | 8 | 12;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`block span-${span} ${className}`} aria-labelledby={id}>
      <header className="block-head">
        <Icon name={icon} size={15} className="block-icon" />
        <h3 id={id}>{title}</h3>
        {note && <span className="block-note">{note}</span>}
      </header>
      {children}
    </section>
  );
}

export function Overview({
  snapshot,
  onOpen,
  onBrowse,
  details,
  onLoadDetails,
  threads,
  onLoadThreads,
  onOpenThread,
  onOpenPeople = () => {},
}: Props) {
  const attention = snapshot.findings.filter((finding) => finding.severity === "review");
  const dates = commitDates(snapshot);
  const activity = summarizeActivity(dates, snapshot.observedAt);
  const zones = zoneCounts(snapshot);
  const branches = branchAges(snapshot);
  const quietBranches = branches.filter((branch) => branch.days >= 90).length;
  const threadItems = threads.data?.items ?? [];
  const quietThreads = threads.data
    ? threadItems.filter((item) => isQuiet(item, threads.data!.fetchedAt)).length
    : 0;
  const revisionUrl = snapshot.revision
    ? `https://github.com/${snapshot.repository}/commit/${snapshot.revision}`
    : "";

  return (
    <div className="overview">
      <p className="ov-lede">
        <strong>
          <NumberTicker value={attention.length} />
        </strong>{" "}
        of <NumberTicker value={snapshot.findings.length} /> traces need a closer look
        {quietBranches > 0 && (
          <>
            , including <strong>{quietBranches}</strong> quiet{" "}
            {quietBranches === 1 ? "branch" : "branches"}
          </>
        )}
        .{" "}
        {activity.latestAgeDays !== null && (
          <>
            Last commit{" "}
            {activity.latestAgeDays === 0
              ? "the day of the scan"
              : `${activity.latestAgeDays} days before the scan`}
            .
          </>
        )}
      </p>

      <div className="ov-grid">
        {/* 1. What to act on */}
        <Block id="attention-title" icon="alert" title="Needs attention" note={attention.length} span={7}>
          {attention.length ? (
            <ul className="attention-list">
              {attention.slice(0, 6).map((finding) => (
                <li key={finding.id}>
                  <button onClick={() => onOpen(finding.id)}>
                    <span className={`group-icon z-${finding.zone}`} aria-hidden="true">
                      <Icon name={ZONES.find((item) => item.id === finding.zone)!.icon} size={14} />
                    </span>
                    <span className="att-main">
                      <span className="att-title">{finding.title}</span>
                      <span className="att-path">{finding.path}</span>
                    </span>
                    <span className="att-conf">{finding.confidence}</span>
                    <Icon name="next" size={14} className="att-go" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="block-empty">
              No restless spirits in this sample. That only covers what was read; it
              does not mean the repository has no problems.
            </p>
          )}
          {attention.length > 6 && (
            <footer className="block-foot">
              <button className="link-btn" onClick={() => onBrowse("all")}>
                See all {attention.length} on the board
                <Icon name="next" size={13} />
              </button>
            </footer>
          )}
        </Block>

        <Block id="groups-title" icon="board" title="Findings by group" span={5}>
          <div className="donut-wrap">
            <Donut
              label={`Findings by group: ${zones.map((zone) => `${zone.name} ${zone.total}`).join(", ")}`}
              center={String(snapshot.findings.length)}
              caption="traces"
              segments={zones.map((zone) => ({
                key: zone.id,
                label: zone.name,
                value: zone.total,
                className: `z-${zone.id}`,
              }))}
            />
            <ul className="group-list">
              {zones.map((zone) => (
                <li key={zone.id}>
                  <button onClick={() => onBrowse(zone.id)}>
                    <span className={`legend-swatch z-${zone.id}`} aria-hidden="true" />
                    <span className="group-name">{zone.name}</span>
                    <span className="group-count">
                      {zone.total}
                      {zone.review ? <em> · {zone.review} review</em> : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </Block>

        {/* 2. How stale things are */}
        <Block
          id="branches-title"
          icon="branch"
          title="Branch tip age"
          note={branches.length ? `${quietBranches} of ${branches.length} past 90 days` : undefined}
          span={6}
        >
          {branches.length ? (
            <div className="chart-pad">
              <BranchAgeChart branches={branches} onOpen={onOpen} />
            </div>
          ) : (
            <p className="block-empty">No non-default branch tips were read in this sample.</p>
          )}
        </Block>

        <Block
          id="thread-age-title"
          icon="message"
          title="Open threads by last update"
          note={threads.data ? `${quietThreads} of ${threadItems.length} quiet 90+ days` : undefined}
          span={6}
        >
          {threads.status === "loading" ? (
            <div className="chart-pad">
              <Skeleton lines={4} />
            </div>
          ) : threads.status === "ready" && threads.data ? (
            threadItems.length ? (
              <div className="chart-pad">
                <AgeHistogram buckets={threadAgeBuckets(threadItems, threads.data.fetchedAt)} />
                <p className="legend">
                  <span><i className="legend-swatch kind-pull" /> Pull requests</span>
                  <span><i className="legend-swatch kind-issue" /> Issues</span>
                  <span className="muted">Faded bars: quiet 90+ days</span>
                </p>
              </div>
            ) : (
              <p className="block-empty">GitHub reports no open issues or pull requests.</p>
            )
          ) : (
            <div className="load-inline">
              <p>
                {threads.status === "error"
                  ? threads.error
                  : "Imported reports stay offline. Load open issues and pull requests when you want them."}
              </p>
              <button className="btn btn-plain" onClick={onLoadThreads}>
                <Icon name="refresh" size={15} />
                {threads.status === "error" ? "Try again · 1 request" : "Load · 1 request"}
              </button>
            </div>
          )}
        </Block>

        {/* 3. Recent movement */}
        <Block
          id="activity-title"
          icon="activity"
          title="Commit activity"
          note={
            details.data?.weeks?.length
              ? `${details.data.weeks.reduce((sum, week) => sum + week.total, 0).toLocaleString()} commits in 52 weeks`
              : activity.total
                ? `${activity.total} commits · ${day(activity.first!)} – ${day(activity.last!)}`
                : undefined
          }
          span={12}
        >
          <div className="chart-pad activity-stack">
            {details.status === "loading" ? (
              <Skeleton lines={3} />
            ) : details.data?.weeks?.length ? (
              <div>
                <p className="eyebrow">Last 52 weeks</p>
                <CalendarHeatmap weeks={details.data.weeks} />
              </div>
            ) : details.data?.weeksPending ? (
              <p className="fine">
                GitHub is still computing the 52-week history for this repository. Refresh
                details in a minute to see the heatmap.
              </p>
            ) : null}
            {activity.total ? (
              <div>
                <p className="eyebrow">Latest {activity.total} inspected commits</p>
                <CommitTimeline
                  dates={dates}
                  observedAt={snapshot.observedAt}
                  labels={Object.fromEntries(
                    (snapshot.commits ?? []).map((commit) => [new Date(commit.date).toISOString(), commit.author]),
                  )}
                />
              </div>
            ) : (
              <p className="block-empty">No commit dates were captured in this snapshot.</p>
            )}
            <p className="fine">Activity alone does not establish repository health.</p>
          </div>
        </Block>

        <Block
          id="people-title"
          icon="users"
          title="People"
          span={6}
          note={
            <button className="link-btn" onClick={onOpenPeople}>
              All people <Icon name="next" size={12} />
            </button>
          }
        >
          {(() => {
            const committers = recentCommitters(snapshot.commits);
            const top = details.data?.contributors ?? [];
            const rows = committers.length
              ? committers.slice(0, 5).map((person) => ({
                  key: person.login ?? person.name,
                  label: person.name,
                  value: person.commits,
                  avatar: avatarUrl(person.avatarId, 44),
                  detail: `last ${ago(person.last, snapshot.observedAt)}`,
                  tone: "ok" as const,
                }))
              : top.slice(0, 5).map((person) => ({
                  key: person.login,
                  label: person.login,
                  value: person.contributions,
                  avatar: avatarUrl(person.id, 44),
                }));
            return rows.length ? (
              <div className="chart-pad">
                <p className="eyebrow">
                  {committers.length ? "Most active in recent commits" : "Top all-time contributors"}
                </p>
                <RankBars label="Most active people" unit="commits" rows={rows} />
              </div>
            ) : details.status === "loading" ? (
              <div className="chart-pad">
                <Skeleton lines={4} />
              </div>
            ) : (
              <p className="block-empty">Run a fresh scan or load details to see who works here.</p>
            );
          })()}
        </Block>

        <Block
          id="releases-title"
          icon="star"
          title="Release cadence"
          span={6}
          note={details.data?.release ? `latest ${details.data.release.tag}` : undefined}
        >
          {details.status === "loading" ? (
            <div className="chart-pad">
              <Skeleton lines={3} />
            </div>
          ) : details.data?.releases.length ? (
            <div className="chart-pad">
              <ReleaseTimeline releases={details.data.releases} observedAt={snapshot.observedAt} />
            </div>
          ) : details.status === "ready" ? (
            <p className="block-empty">No published releases.</p>
          ) : (
            <DetailsLoad details={details} onLoad={onLoadDetails} />
          )}
        </Block>

        {/* 4. Conversations */}
        <Block
          id="threads-title"
          icon="message"
          title="Newest open threads"
          note={threads.data ? `updated ${ago(threads.data.fetchedAt, new Date().toISOString())}` : undefined}
          span={12}
        >
          {threads.status === "loading" ? (
            <div className="threads">
              <Skeleton lines={4} />
              <Skeleton lines={4} />
            </div>
          ) : threads.status === "ready" && threads.data ? (
            <div className="threads">
              {(["pull", "issue"] as const).map((kind) => (
                <ThreadColumn
                  key={kind}
                  kind={kind}
                  items={threadItems.filter((item) => item.kind === kind)}
                  now={threads.data!.fetchedAt}
                  onOpen={onOpenThread}
                />
              ))}
            </div>
          ) : (
            <p className="block-empty">Threads appear here once loaded.</p>
          )}
        </Block>

        {/* 5. Background */}
        <Block
          id="details-title"
          icon="report"
          title="Languages"
          span={6}
          note={
            details.status === "ready" ? (
              <button className="link-btn" onClick={onLoadDetails}>
                <Icon name="refresh" size={12} /> Refresh
              </button>
            ) : undefined
          }
        >
          {details.status === "loading" ? (
            <div className="details-loading">
              <Skeleton lines={2} />
              <Skeleton lines={3} />
            </div>
          ) : details.status !== "ready" ? (
            <DetailsLoad details={details} onLoad={onLoadDetails} />
          ) : (
            <DetailsBody details={details.data!} />
          )}
        </Block>

        <Block id="facts-title" icon="report" title="At a glance" span={6}>
          <p className="facts-desc">
            {snapshot.meta?.archived && <span className="tag tag-review">Archived</span>}{" "}
            {snapshot.description}
          </p>
          {snapshot.meta?.topics.length ? (
            <ul className="label-list topics" aria-label="Topics">
              {snapshot.meta.topics.map((topic) => (
                <li key={topic}>{topic}</li>
              ))}
            </ul>
          ) : null}
          <dl className="facts">
            <div>
              <dt>Default branch</dt>
              <dd>{snapshot.defaultBranch}</dd>
            </div>
            <div>
              <dt>Revision</dt>
              <dd>
                {revisionUrl ? (
                  <a href={revisionUrl} target="_blank" rel="noreferrer">
                    {snapshot.revision.slice(0, 7)}
                  </a>
                ) : (
                  "Unavailable"
                )}
              </dd>
            </div>
            <div>
              <dt>Stars</dt>
              <dd>{snapshot.stars.toLocaleString()}</dd>
            </div>
            {snapshot.meta && (
              <>
                <div>
                  <dt>Forks · watchers</dt>
                  <dd>
                    {snapshot.meta.forks.toLocaleString()} · {snapshot.meta.watchers.toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt>License</dt>
                  <dd>{snapshot.meta.license ?? "None detected"}</dd>
                </div>
                {snapshot.meta.createdAt && (
                  <div>
                    <dt>Created</dt>
                    <dd>{day(snapshot.meta.createdAt)}</dd>
                  </div>
                )}
                {snapshot.meta.pushedAt && (
                  <div>
                    <dt>Last push</dt>
                    <dd>{ago(snapshot.meta.pushedAt, snapshot.observedAt)}</dd>
                  </div>
                )}
                {snapshot.meta.homepage && (
                  <div>
                    <dt>Homepage</dt>
                    <dd>
                      <a href={snapshot.meta.homepage} target="_blank" rel="noreferrer">
                        {new URL(snapshot.meta.homepage).host}
                      </a>
                    </dd>
                  </div>
                )}
              </>
            )}
            <div>
              <dt>Files in tree</dt>
              <dd>{snapshot.files.length.toLocaleString()}</dd>
            </div>
            <div>
              <dt>Sources sampled</dt>
              <dd>{snapshot.sampledFiles}</dd>
            </div>
            <div>
              <dt>API requests</dt>
              <dd>{snapshot.requests}</dd>
            </div>
          </dl>
        </Block>

        {snapshot.warnings.length > 0 && (
          <Block id="coverage-title" icon="alert" title="Coverage notes" span={12} className="block-muted">
            <ul className="coverage-list">
              {snapshot.warnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          </Block>
        )}
      </div>
    </div>
  );
}

function DetailsLoad({ details, onLoad }: { details: Loadable<Details>; onLoad: () => void }) {
  return (
    <div className="load-inline">
      <p>
        {details.status === "error"
          ? details.error
          : "Imported reports stay offline. Load languages, contributors, releases, and 52-week activity when you want them."}
      </p>
      <button className="btn btn-plain" onClick={onLoad}>
        <Icon name="users" size={15} />
        {details.status === "error" ? "Try again" : "Load details"} · 4 requests
      </button>
    </div>
  );
}

function DetailsBody({ details }: { details: Details }) {
  const total = details.languages.reduce((sum, language) => sum + language.bytes, 0);
  if (!details.languages.length)
    return (
      <>
        <p className="block-empty">No language data.</p>
        {details.warnings.map((warning, index) => (
          <p key={index} className="inline-error block-empty">
            {warning}
          </p>
        ))}
      </>
    );
  return (
    <>
      <div className="donut-wrap">
        <Donut
          label={`Languages by bytes: ${details.languages.map((l) => `${l.name} ${((l.bytes / total) * 100).toFixed(1)}%`).join(", ")}`}
          center={details.languages[0].name.length > 8 ? details.languages[0].name.slice(0, 7) + "…" : details.languages[0].name}
          caption={`${((details.languages[0].bytes / total) * 100).toFixed(0)}% of code`}
          segments={details.languages.map((language, index) => ({
            key: language.name,
            label: language.name,
            value: language.bytes,
            className: `lang-z lang-${index}`,
          }))}
        />
        <ul className="group-list legend-list">
          {details.languages.map((language, index) => (
            <li key={language.name}>
              <span className={`legend-swatch lang-${index}`} aria-hidden="true" />
              <span className="group-name">{language.name}</span>
              <span className="group-count">{((language.bytes / total) * 100).toFixed(1)}%</span>
            </li>
          ))}
        </ul>
      </div>
      {details.warnings.map((warning, index) => (
        <p key={index} className="inline-error block-empty">
          {warning}
        </p>
      ))}
    </>
  );
}

function ThreadColumn({
  kind,
  items,
  now,
  onOpen,
}: {
  kind: Issue["kind"];
  items: Issue[];
  now: string;
  onOpen: (kind: Issue["kind"], number: number) => void;
}) {
  const label = kind === "pull" ? "Pull requests" : "Issues";
  const quiet = items.filter((item) => isQuiet(item, now)).length;
  return (
    <div className="thread-col">
      <p className="thread-head">
        <Icon name={kind} size={14} />
        <strong>{items.length}</strong> {label.toLowerCase()}
        {quiet > 0 && <span className="warn"> · {quiet} quiet</span>}
      </p>
      {items.length ? (
        <ul className="thread-list">
          {items.slice(0, 4).map((item) => (
            <li key={item.number}>
              <button onClick={() => onOpen(kind, item.number)}>
                <span className="thread-title">{item.title}</span>
                <span className="thread-meta">
                  #{item.number} · {ago(item.updatedAt, now)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">None open.</p>
      )}
      {items.length > 4 && (
        <button
          className="link-btn"
          onClick={() => onOpen(kind, items[0].number)}
        >
          All {items.length} {label.toLowerCase()}
          <Icon name="next" size={13} />
        </button>
      )}
    </div>
  );
}
