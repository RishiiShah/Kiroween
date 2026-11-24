import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  ASSOCIATION_LABEL,
  ago,
  isNewcomer,
  isQuiet,
  profileUrl,
  QUIET_DAYS,
  type Issue,
  type PullDetails,
} from "./community";
import { Avatar } from "./People";
import type { CommentList, IssueList, Loadable } from "./useCommunity";
import { Icon, Skeleton, t } from "./ui";
import { AgeHistogram } from "./charts";
import { threadAgeBuckets } from "./activity";

type Kind = Issue["kind"];
type Props = {
  kind: Kind;
  repository: string;
  issues: Loadable<IssueList>;
  comments: Record<number, Loadable<CommentList>>;
  onLoad: () => void;
  onLoadComments: (number: number) => void;
  pulls?: Record<number, Loadable<PullDetails>>;
  onLoadPull?: (number: number) => void;
  focus?: number | null;
};
type Sort = "updated" | "comments" | "quiet";

const COPY: Record<Kind, { noun: string; plural: string; empty: string; icon: string }> = {
  issue: {
    noun: "issue",
    plural: "issues",
    empty: "No open issues among the items GitHub returned.",
    icon: "issue",
  },
  pull: {
    noun: "pull request",
    plural: "pull requests",
    empty: "No open pull requests among the items GitHub returned.",
    icon: "pull",
  },
};

export function Issues({
  kind,
  repository,
  issues,
  comments,
  onLoad,
  onLoadComments,
  pulls = {},
  onLoadPull = () => {},
  focus = null,
}: Props) {
  const [sort, setSort] = useState<Sort>("updated");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<number | null>(focus);
  useEffect(() => setOpen(focus), [focus]);
  const data = issues.data;
  const now = data?.fetchedAt ?? "";
  const copy = COPY[kind];
  const all = useMemo(
    () => (data?.items ?? []).filter((item) => item.kind === kind),
    [data, kind],
  );

  const stats = useMemo(
    () => ({
      total: all.length,
      drafts: all.filter((i) => i.draft).length,
      quiet: all.filter((i) => isQuiet(i, now)).length,
      discussed: all.filter((i) => i.comments > 0).length,
      labeled: all.filter((i) => i.labels.length > 0).length,
    }),
    [all, now],
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = all.filter(
      (item) =>
        !needle ||
        `${item.title} #${item.number} ${item.author} ${item.labels.join(" ")}`
          .toLowerCase()
          .includes(needle),
    );
    return [...list].sort((a, b) =>
      sort === "comments"
        ? b.comments - a.comments || b.number - a.number
        : sort === "quiet"
          ? Date.parse(a.updatedAt) - Date.parse(b.updatedAt)
          : Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
    );
  }, [all, sort, query]);

  if (issues.status === "loading")
    return (
      <section className="issues" aria-label={`Open ${copy.plural}`} aria-busy="true">
        <p className="issues-stats muted">
          <Icon name="loader" size={14} className="spin" /> Reading open {copy.plural} for{" "}
          {repository}…
        </p>
        <div className="split">
          <div className="issue-list">
            {Array.from({ length: 6 }, (_, index) => (
              <div className="issue-skeleton" key={index}>
                <Skeleton lines={2} />
              </div>
            ))}
          </div>
          <div className="issue-detail is-empty">
            <Skeleton lines={5} />
          </div>
        </div>
      </section>
    );

  if (issues.status !== "ready")
    return (
      <section className="load-panel" aria-label={`Open ${copy.plural}`}>
        <div className="load-icon" aria-hidden="true">
          <Icon name={copy.icon} size={20} />
        </div>
        <div>
          <h3>
            {issues.status === "error"
              ? `Couldn’t read ${copy.plural} just now`
              : `Open ${copy.plural} for ${repository}`}
          </h3>
          <p>
            {issues.status === "error"
              ? "Your findings are unaffected. You can retry once GitHub allows it."
              : "Imported reports stay offline. Load the latest open issues and pull requests from GitHub with one request."}
          </p>
          <div className="load-actions">
            <button className="btn btn-primary" onClick={onLoad}>
              <Icon name="refresh" size={15} />
              {issues.status === "error" ? "Try again · 1 request" : "Load from GitHub · 1 request"}
            </button>
            {issues.status === "error" && (
              <span className="inline-error" role="alert">
                {issues.error}
              </span>
            )}
          </div>
        </div>
      </section>
    );

  const current = visible.find((item) => item.number === open) ?? null;

  return (
    <section className="issues" aria-label={`Open ${copy.plural}`}>
      <div className="issues-stats">
        <span>
          <strong>{stats.total}</strong> open {stats.total === 1 ? copy.noun : copy.plural}
        </span>
        {kind === "pull" ? (
          <span>
            <strong>{stats.drafts}</strong> drafts
          </span>
        ) : (
          <span>
            <strong>{stats.labeled}</strong> labeled
          </span>
        )}
        <span>
          <strong>{stats.discussed}</strong> with discussion
        </span>
        <span className={stats.quiet ? "warn" : ""}>
          <strong>{stats.quiet}</strong> quiet {QUIET_DAYS}+ days
        </span>
        {data?.more && (
          <span className="muted">Newest {data.items.length} open items read; more exist</span>
        )}
        <button className="link-btn" onClick={onLoad}>
          <Icon name="refresh" size={13} />
          Refresh
        </button>
      </div>
      {all.length > 0 && (
        <figure className="issues-chart">
          <figcaption className="eyebrow">Time since last update</figcaption>
          <AgeHistogram buckets={threadAgeBuckets(all, now)} kinds={[kind]} height={120} />
        </figure>
      )}
      <div className="toolbar issues-toolbar">
        <label className="search">
          <Icon name="search" size={15} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label={`Filter ${copy.plural}`}
            placeholder="Title, author, label, or #number"
          />
        </label>
        <select
          aria-label={`Sort ${copy.plural}`}
          value={sort}
          onChange={(event) => setSort(event.target.value as Sort)}
        >
          <option value="updated">Recently updated</option>
          <option value="comments">Most discussed</option>
          <option value="quiet">Quietest first</option>
        </select>
      </div>

      {visible.length ? (
        <div className="split">
          <ul className="issue-list">
            {visible.map((item, index) => (
              <motion.li
                layout="position"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: t(Math.min(index, 12) * 0.018), duration: t(0.22)}}
                key={item.number}
                className={`issue ${open === item.number ? "is-open" : ""}`}
              >
                <button
                  className="issue-hit"
                  aria-pressed={open === item.number}
                  onClick={() => setOpen(item.number)}
                >
                  <span
                    className={`issue-kind kind-${item.kind} ${item.draft ? "is-draft" : ""}`}
                  >
                    <Icon
                      name={item.kind === "pull" ? (item.draft ? "draft" : "pull") : "issue"}
                      size={14}
                    />
                    <span className="sr-only">
                      {item.kind === "pull"
                        ? item.draft
                          ? "Draft pull request"
                          : "Pull request"
                        : "Issue"}
                    </span>
                  </span>
                  <span className="issue-title">{item.title}</span>
                  <span className="issue-meta">
                    #{item.number} · {item.author} · updated {ago(item.updatedAt, now)}
                    {isQuiet(item, now) ? " · quiet" : ""}
                  </span>
                  <span className="issue-count" aria-label={`${item.comments} comments`}>
                    <Icon name="message" size={12} />
                    {item.comments}
                  </span>
                </button>
              </motion.li>
            ))}
          </ul>
          <IssueDetail
            item={current}
            now={now}
            comments={current ? comments[current.number] : undefined}
            onLoadComments={() => current && onLoadComments(current.number)}
            pull={current ? pulls[current.number] : undefined}
            onLoadPull={() => current && onLoadPull(current.number)}
          />
        </div>
      ) : (
        <p className="empty">{all.length ? `No ${copy.plural} match this filter.` : copy.empty}</p>
      )}
    </section>
  );
}

const REVIEW_LABEL: Record<string, string> = {
  APPROVED: "Approved",
  CHANGES_REQUESTED: "Changes requested",
  COMMENTED: "Commented",
  DISMISSED: "Dismissed",
  PENDING: "Pending",
};

function IssueDetail({
  item,
  now,
  comments,
  onLoadComments,
  pull,
  onLoadPull,
}: {
  item: Issue | null;
  now: string;
  comments?: Loadable<CommentList>;
  onLoadComments: () => void;
  pull?: Loadable<PullDetails>;
  onLoadPull: () => void;
}) {
  if (!item)
    return (
      <div className="issue-detail is-empty">
        <Icon name="ghost" size={26} />
        <p>Pick a thread on the left to read it here.</p>
      </div>
    );
  return (
    <motion.article
      key={item.number}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: t(0.22), ease: [0.16, 1, 0.3, 1] }}
      className="issue-detail"
      aria-labelledby="issue-detail-title"
    >
      <p className="eyebrow">
        {item.kind === "pull" ? (item.draft ? "Draft pull request" : "Pull request") : "Issue"}{" "}
        #{item.number}
      </p>
      <h3 id="issue-detail-title">{item.title}</h3>
      <div className="issue-people">
        <Avatar id={item.authorId} login={item.author} size={30} />
        <div>
          <p className="issue-byline">
            <a href={profileUrl(item.author)} target="_blank" rel="noreferrer">
              <strong>{item.author}</strong>
            </a>{" "}
            <span className={`tag ${isNewcomer(item.association) ? "tag-review" : ""}`}>
              {ASSOCIATION_LABEL[item.association]}
            </span>
          </p>
          <p className="issue-byline">
            Opened {ago(item.createdAt, now)} · updated {ago(item.updatedAt, now)}
            {isQuiet(item, now) && <span className="warn"> · quiet {QUIET_DAYS}+ days</span>}
            {item.reactions > 0 && ` · ${item.reactions} reactions`}
          </p>
        </div>
      </div>
      <dl className="issue-facts">
        <div>
          <dt>Assignees</dt>
          <dd>
            {item.assignees.length ? (
              <span className="avatar-stack">
                {item.assignees.map((person) => (
                  <a key={person.login} href={profileUrl(person.login)} target="_blank" rel="noreferrer" title={person.login}>
                    <Avatar id={person.id} login={person.login} size={22} />
                    <span>{person.login}</span>
                  </a>
                ))}
              </span>
            ) : (
              <span className="muted">Nobody yet</span>
            )}
          </dd>
        </div>
        <div>
          <dt>Comments</dt>
          <dd>{item.comments}</dd>
        </div>
      </dl>
      {item.kind === "pull" && <PullReview pull={pull} onLoad={onLoadPull} />}
      {item.labels.length > 0 && (
        <ul className="label-list" aria-label="Labels">
          {item.labels.map((label) => (
            <li key={label}>{label}</li>
          ))}
        </ul>
      )}
      <p className="issue-excerpt">{item.excerpt || "No description provided."}</p>
      <div className="issue-actions">
        <a href={item.url} target="_blank" rel="noreferrer" className="btn btn-plain">
          Open on GitHub
          <Icon name="link" size={14} />
        </a>
        {item.comments > 0 && (!comments || comments.status === "error") && (
          <button className="btn btn-plain" onClick={onLoadComments}>
            <Icon name="message" size={14} />
            Load comments · 1 request
          </button>
        )}
        {comments?.status === "loading" && (
          <span className="muted">
            <Icon name="loader" size={14} className="spin" /> Loading comments…
          </span>
        )}
      </div>
      {comments?.status === "error" && (
        <p className="inline-error" role="alert">
          {comments.error}
        </p>
      )}
      {comments?.status === "ready" && comments.data && (
        <ol className="comment-list" aria-label={`Comments on #${item.number}`}>
          {comments.data.items.map((comment, index) => (
            <motion.li
              key={comment.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: t(index * 0.04), duration: t(0.2)}}
            >
              <p className="comment-meta">
                <strong>{comment.author}</strong> · {ago(comment.createdAt, now)}
              </p>
              <p className="issue-excerpt">{comment.excerpt || "(empty comment)"}</p>
            </motion.li>
          ))}
          {comments.data.more && (
            <li className="comment-more">
              Showing the first {comments.data.items.length}.{" "}
              <a href={item.url} target="_blank" rel="noreferrer">
                Read the rest on GitHub
              </a>
            </li>
          )}
        </ol>
      )}
    </motion.article>
  );
}

function PullReview({ pull, onLoad }: { pull?: Loadable<PullDetails>; onLoad: () => void }) {
  if (!pull || pull.status === "idle" || pull.status === "error")
    return (
      <div className="pull-review is-idle">
        <p className="muted">Size, files changed, requested reviewers, and review verdicts.</p>
        <button className="btn btn-plain" onClick={onLoad}>
          <Icon name="pull" size={14} />
          Load review details · 2 requests
        </button>
        {pull?.status === "error" && (
          <p className="inline-error" role="alert">
            {pull.error}
          </p>
        )}
      </div>
    );
  if (pull.status === "loading")
    return (
      <div className="pull-review">
        <Skeleton lines={3} />
      </div>
    );
  const data = pull.data!;
  const total = Math.max(1, data.additions + data.deletions);
  const latest = new Map<string, PullDetails["reviews"][number]>();
  for (const review of data.reviews) latest.set(review.author, review);
  return (
    <motion.div
      className="pull-review"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="diffstat" aria-label={`${data.additions} additions, ${data.deletions} deletions across ${data.changedFiles} files`}>
        <span className="add">+{data.additions.toLocaleString()}</span>
        <span className="del">−{data.deletions.toLocaleString()}</span>
        <span className="diffbar" aria-hidden="true">
          <motion.i
            className="add"
            initial={{ width: 0 }}
            animate={{ width: `${(data.additions / total) * 100}%` }}
            transition={{ duration: t(0.5)}}
          />
          <motion.i
            className="del"
            initial={{ width: 0 }}
            animate={{ width: `${(data.deletions / total) * 100}%` }}
            transition={{ duration: t(0.5), delay: t(0.1)}}
          />
        </span>
        <span className="muted">
          {data.changedFiles} files · {data.commits} commits
          {data.mergeableState ? ` · ${data.mergeableState.replace(/_/g, " ")}` : ""}
        </span>
      </div>
      <div className="review-people">
        <p className="eyebrow">Reviews</p>
        {latest.size || data.requestedReviewers.length ? (
          <ul>
            {[...latest.values()].map((review) => (
              <li key={review.author}>
                <Avatar id={review.id} login={review.author} size={22} />
                <a href={profileUrl(review.author)} target="_blank" rel="noreferrer">
                  {review.author}
                </a>
                <span className={`tag review-${review.state.toLowerCase()}`}>
                  {REVIEW_LABEL[review.state] ?? review.state}
                </span>
              </li>
            ))}
            {data.requestedReviewers
              .filter((person) => !latest.has(person.login))
              .map((person) => (
                <li key={person.login}>
                  <Avatar id={person.id} login={person.login} size={22} />
                  <a href={profileUrl(person.login)} target="_blank" rel="noreferrer">
                    {person.login}
                  </a>
                  <span className="tag">Review requested</span>
                </li>
              ))}
          </ul>
        ) : (
          <p className="muted">No reviews or review requests yet.</p>
        )}
      </div>
    </motion.div>
  );
}
