import { useMemo, useState } from "react";
import { ago, isQuiet, QUIET_DAYS, type Issue } from "./community";
import type { CommentList, IssueList, Loadable } from "./useCommunity";
import { motion } from "motion/react";
import { Icon, Skeleton } from "./ui";

type Props = {
  repository: string;
  issues: Loadable<IssueList>;
  comments: Record<number, Loadable<CommentList>>;
  onLoad: () => void;
  onLoadComments: (number: number) => void;
};
type Kind = "all" | "issue" | "pull";
type Sort = "updated" | "comments" | "quiet";

export function Issues({ repository, issues, comments, onLoad, onLoadComments }: Props) {
  const [kind, setKind] = useState<Kind>("all");
  const [sort, setSort] = useState<Sort>("updated");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const data = issues.data;
  const now = data?.fetchedAt ?? "";

  const stats = useMemo(() => {
    const items = data?.items ?? [];
    return {
      total: items.length,
      issue: items.filter((i) => i.kind === "issue").length,
      pull: items.filter((i) => i.kind === "pull").length,
      quiet: items.filter((i) => isQuiet(i, now)).length,
      discussed: items.filter((i) => i.comments > 0).length,
    };
  }, [data, now]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = (data?.items ?? []).filter(
      (item) =>
        (kind === "all" || item.kind === kind) &&
        (!needle ||
          `${item.title} #${item.number} ${item.author} ${item.labels.join(" ")}`
            .toLowerCase()
            .includes(needle)),
    );
    return [...list].sort((a, b) =>
      sort === "comments"
        ? b.comments - a.comments || b.number - a.number
        : sort === "quiet"
          ? Date.parse(a.updatedAt) - Date.parse(b.updatedAt)
          : Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
    );
  }, [data, kind, sort, query]);

  if (issues.status !== "ready")
    return (
      <section className="load-panel" aria-label="Issues and pull requests">
        <div className="load-icon" aria-hidden="true">
          <Icon name="pull" size={20} />
        </div>
        <div>
          <h3>Who is knocking on the door?</h3>
          <p>
            Load the 30 most recently updated open issues and pull requests for{" "}
            <strong>{repository}</strong>. Spot quiet threads that went cold,
            the most discussed items, and drafts waiting for a reviewer.
            Comments load one thread at a time, only when you ask.
          </p>
          {issues.status === "loading" && <Skeleton lines={4} />}
          <div className="load-actions">
            <button
              className="btn btn-primary"
              onClick={onLoad}
              disabled={issues.status === "loading"}
            >
              <Icon
                name={issues.status === "loading" ? "loader" : "pull"}
                size={15}
                className={issues.status === "loading" ? "spin" : ""}
              />
              {issues.status === "loading" ? "Loading…" : "Load issues · 1 request"}
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
    <section className="issues" aria-label="Issues and pull requests">
      <div className="issues-stats">
        <span>
          <strong>{stats.issue}</strong> issues
        </span>
        <span>
          <strong>{stats.pull}</strong> pull requests
        </span>
        <span>
          <strong>{stats.discussed}</strong> with discussion
        </span>
        <span className={stats.quiet ? "warn" : ""}>
          <strong>{stats.quiet}</strong> quiet {QUIET_DAYS}+ days
        </span>
        {data?.more && <span className="muted">More exist on GitHub</span>}
        <button className="link-btn" onClick={onLoad}>
          <Icon name="refresh" size={13} />
          Refresh · 1 request
        </button>
      </div>
      <div className="toolbar issues-toolbar">
        <label className="search">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Filter issues"
            placeholder="Title, author, label, or #number"
          />
        </label>
        <div className="segmented" role="group" aria-label="Item type">
          {(
            [
              ["all", "All"],
              ["issue", "Issues"],
              ["pull", "Pull requests"],
            ] as const
          ).map(([value, label]) => (
            <button key={value} aria-pressed={kind === value} onClick={() => setKind(value)}>
              {label}
            </button>
          ))}
        </div>
        <select
          aria-label="Sort issues"
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
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: Math.min(index, 12) * 0.02, duration: 0.2 }}
                key={item.number}
                className={`issue ${open === item.number ? "is-open" : ""}`}
              >
                <button
                  className="issue-hit"
                  aria-pressed={open === item.number}
                  onClick={() => setOpen(item.number)}
                >
                  <span className={`issue-kind kind-${item.kind} ${item.draft ? "is-draft" : ""}`}>
                    <Icon
                      name={item.kind === "pull" ? (item.draft ? "draft" : "pull") : "issue"}
                      size={14}
                    />
                    <span className="sr-only">
                      {item.kind === "pull" ? (item.draft ? "Draft pull request" : "Pull request") : "Issue"}
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
          />
        </div>
      ) : (
        <p className="empty">
          {data?.items.length
            ? "No loaded items match these filters."
            : "GitHub reports no open issues or pull requests."}
        </p>
      )}
    </section>
  );
}

function IssueDetail({
  item,
  now,
  comments,
  onLoadComments,
}: {
  item: Issue | null;
  now: string;
  comments?: Loadable<CommentList>;
  onLoadComments: () => void;
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
      transition={{ duration: 0.2 }}
      className="issue-detail"
      aria-labelledby="issue-detail-title"
    >
      <p className="eyebrow">
        {item.kind === "pull" ? (item.draft ? "Draft pull request" : "Pull request") : "Issue"}{" "}
        #{item.number}
      </p>
      <h3 id="issue-detail-title">{item.title}</h3>
      <p className="issue-byline">
        Opened {ago(item.createdAt, now)} by {item.author} · updated{" "}
        {ago(item.updatedAt, now)}
        {isQuiet(item, now) && <span className="warn"> · quiet {QUIET_DAYS}+ days</span>}
      </p>
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
          {comments.data.items.map((comment) => (
            <li key={comment.id}>
              <p className="comment-meta">
                <strong>{comment.author}</strong> · {ago(comment.createdAt, now)}
              </p>
              <p className="issue-excerpt">{comment.excerpt || "(empty comment)"}</p>
            </li>
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
