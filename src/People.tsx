import { Donut, RankBars } from "./charts";
import {
  ASSOCIATION_LABEL,
  ago,
  avatarUrl,
  profileUrl,
  type Details,
  type Issue,
} from "./community";
import {
  assigneeLoad,
  associationBreakdown,
  newcomersWaiting,
  openAuthors,
  recentCommitters,
} from "./contributors";
import type { Snapshot } from "./scan";
import { Icon, NumberTicker, Skeleton } from "./ui";
import type { IssueList, Loadable } from "./useCommunity";

type Props = {
  snapshot: Snapshot;
  details: Loadable<Details>;
  threads: Loadable<IssueList>;
  onLoadDetails: () => void;
  onLoadThreads: () => void;
  onOpenThread: (kind: Issue["kind"], number: number) => void;
};

function Panel({
  id,
  icon,
  title,
  note,
  span,
  children,
}: {
  id: string;
  icon: string;
  title: string;
  note?: React.ReactNode;
  span: 4 | 5 | 6 | 7 | 8 | 12;
  children: React.ReactNode;
}) {
  return (
    <section className={`block span-${span}`} aria-labelledby={id}>
      <header className="block-head">
        <Icon name={icon} size={15} className="block-icon" />
        <h3 id={id}>{title}</h3>
        {note && <span className="block-note">{note}</span>}
      </header>
      {children}
    </section>
  );
}

function Loader({ status, error, onLoad, cost }: { status: string; error?: string; onLoad: () => void; cost: string }) {
  if (status === "loading")
    return (
      <div className="chart-pad">
        <Skeleton lines={5} />
      </div>
    );
  return (
    <div className="load-inline">
      <p>{status === "error" ? error : "Imported reports stay offline until you ask."}</p>
      <button className="btn btn-plain" onClick={onLoad}>
        <Icon name="refresh" size={15} />
        {status === "error" ? "Try again" : "Load"} · {cost}
      </button>
    </div>
  );
}

export function People({ snapshot, details, threads, onLoadDetails, onLoadThreads, onOpenThread }: Props) {
  const committers = recentCommitters(snapshot.commits);
  const items = threads.data?.items ?? [];
  const now = threads.data?.fetchedAt ?? snapshot.observedAt;
  const authors = openAuthors(items);
  const load = assigneeLoad(items);
  const newcomers = newcomersWaiting(items);
  const pulls = items.filter((item) => item.kind === "pull");
  const groups = associationBreakdown(pulls);
  const contributors = details.data?.contributors ?? [];

  return (
    <div className="overview people-view">
      <dl className="kpis">
        <div>
          <dt>All-time contributors</dt>
          <dd>
            {details.status === "ready" ? (
              <>
                <NumberTicker value={contributors.length} />
                {details.data?.contributorsMore ? "+" : ""}
              </>
            ) : (
              "—"
            )}
          </dd>
        </div>
        <div>
          <dt>Recent committers</dt>
          <dd>
            <NumberTicker value={committers.length} />
            <small> in {snapshot.commits?.length ?? 0} commits</small>
          </dd>
        </div>
        <div>
          <dt>People with open work</dt>
          <dd>{threads.status === "ready" ? <NumberTicker value={authors.length} /> : "—"}</dd>
        </div>
        <div className={newcomers.length ? "kpi-warn" : ""}>
          <dt>Newcomers waiting</dt>
          <dd>{threads.status === "ready" ? <NumberTicker value={newcomers.length} /> : "—"}</dd>
        </div>
      </dl>

      <div className="ov-grid">
        <Panel
          id="newcomers-title"
          icon="sparkles"
          title="First-time contributors waiting"
          note={threads.status === "ready" ? `${newcomers.length} open pull requests` : undefined}
          span={7}
        >
          {threads.status !== "ready" ? (
            <Loader status={threads.status} error={threads.error} onLoad={onLoadThreads} cost="1 request" />
          ) : newcomers.length ? (
            <ul className="person-list">
              {newcomers.slice(0, 8).map((item) => (
                <li key={item.number}>
                  <button onClick={() => onOpenThread("pull", item.number)}>
                    <Avatar id={item.authorId} login={item.author} />
                    <span className="person-main">
                      <span className="person-title">{item.title}</span>
                      <span className="person-meta">
                        {item.author} · #{item.number} · updated {ago(item.updatedAt, now)}
                        {item.assignees.length
                          ? ` · assigned ${item.assignees.map((a) => a.login).join(", ")}`
                          : " · no assignee"}
                      </span>
                    </span>
                    <Icon name="next" size={14} className="att-go" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="block-empty">
              No open pull requests from first-time contributors among the loaded items.
            </p>
          )}
        </Panel>

        <Panel id="assoc-title" icon="pull" title="Who opens pull requests" span={5}>
          {threads.status !== "ready" ? (
            <Loader status={threads.status} error={threads.error} onLoad={onLoadThreads} cost="1 request" />
          ) : (
            <div className="donut-wrap">
              <Donut
                label={`Open pull requests by author relationship: ${groups.map((g) => `${g.label} ${g.value}`).join(", ")}`}
                center={String(pulls.length)}
                caption="open PRs"
                segments={groups}
              />
              <ul className="group-list legend-list">
                {groups.map((group) => (
                  <li key={group.key}>
                    <span className={`legend-swatch ${group.className}`} aria-hidden="true" />
                    <span className="group-name">{group.label}</span>
                    <span className="group-count">{group.value}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>

        <Panel
          id="contributors-title"
          icon="users"
          title="All-time top contributors"
          note={details.status === "ready" ? "commits on the default branch" : undefined}
          span={6}
        >
          {details.status !== "ready" ? (
            <Loader status={details.status} error={details.error} onLoad={onLoadDetails} cost="4 requests" />
          ) : contributors.length ? (
            <div className="chart-pad">
              <RankBars
                label="Top contributors by commits"
                unit="commits"
                rows={contributors.slice(0, 12).map((person) => ({
                  key: person.login,
                  label: person.login,
                  value: person.contributions,
                  avatar: avatarUrl(person.id, 44),
                  href: person.url,
                }))}
              />
            </div>
          ) : (
            <p className="block-empty">GitHub returned no contributor list.</p>
          )}
        </Panel>

        <Panel
          id="committers-title"
          icon="pulse"
          title="Recently committing"
          note={snapshot.commits ? `latest ${snapshot.commits.length} commits` : undefined}
          span={6}
        >
          {committers.length ? (
            <div className="chart-pad">
              <RankBars
                label="Authors of the latest inspected commits"
                unit="commits"
                rows={committers.slice(0, 12).map((person) => ({
                  key: person.login ?? person.name,
                  label: person.name,
                  value: person.commits,
                  avatar: avatarUrl(person.avatarId, 44),
                  href: person.login ? profileUrl(person.login) : undefined,
                  detail: `last ${ago(person.last, snapshot.observedAt)}`,
                  tone: "ok",
                }))}
              />
            </div>
          ) : (
            <p className="block-empty">
              This snapshot predates commit-author capture. Run a fresh scan to see who is
              committing.
            </p>
          )}
        </Panel>

        <Panel id="authors-title" icon="message" title="Open work by author" span={6}>
          {threads.status !== "ready" ? (
            <Loader status={threads.status} error={threads.error} onLoad={onLoadThreads} cost="1 request" />
          ) : authors.length ? (
            <div className="chart-pad">
              <RankBars
                label="Open issues and pull requests by author"
                unit="open"
                rows={authors.slice(0, 10).map((person) => ({
                  key: person.login,
                  label: person.login,
                  value: person.pulls + person.issues,
                  avatar: avatarUrl(person.id, 44),
                  href: profileUrl(person.login),
                  detail: `${person.pulls} PR · ${person.issues} issue · ${ASSOCIATION_LABEL[person.association]}`,
                  tone: "branches",
                }))}
              />
            </div>
          ) : (
            <p className="block-empty">No open threads were loaded.</p>
          )}
        </Panel>

        <Panel
          id="assignees-title"
          icon="board"
          title="Assignee workload"
          note={threads.status === "ready" ? `${load.unassigned} unassigned` : undefined}
          span={6}
        >
          {threads.status !== "ready" ? (
            <Loader status={threads.status} error={threads.error} onLoad={onLoadThreads} cost="1 request" />
          ) : load.people.length ? (
            <div className="chart-pad">
              <RankBars
                label="Open threads per assignee"
                unit="assigned"
                rows={load.people.slice(0, 10).map((person) => ({
                  key: person.login,
                  label: person.login,
                  value: person.pulls + person.issues,
                  avatar: avatarUrl(person.id, 44),
                  href: profileUrl(person.login),
                  detail: `${person.pulls} PR · ${person.issues} issue`,
                  tone: "warn",
                }))}
              />
            </div>
          ) : (
            <p className="block-empty">
              None of the {items.length} loaded threads has an assignee.
            </p>
          )}
        </Panel>
      </div>
      <p className="fine people-note">
        Counts come from public GitHub data: the scan's latest commits, up to{" "}
        {threads.data?.items.length ?? 100} open threads, and the top contributors list.
        They describe activity, not anyone's performance.
      </p>
    </div>
  );
}

export function Avatar({ id, login, size = 28 }: { id: number | null; login: string; size?: number }) {
  const src = avatarUrl(id, size * 2);
  return src ? (
    <img className="avatar" src={src} alt="" width={size} height={size} loading="lazy" referrerPolicy="no-referrer" />
  ) : (
    <span className="avatar avatar-initial" style={{ width: size, height: size }} aria-hidden="true">
      {login.slice(0, 1).toUpperCase()}
    </span>
  );
}
