import { commitDates, summarizeActivity, zoneCounts } from "./activity";
import { ago, type Details } from "./community";
import type { Snapshot, Zone } from "./scan";
import type { Loadable } from "./useCommunity";

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
};

export function Overview({ snapshot, onOpen, onBrowse, details, onLoadDetails }: Props) {
  const attention = snapshot.findings.filter((finding) => finding.severity === "review");
  const activity = summarizeActivity(commitDates(snapshot), snapshot.observedAt);
  const peak = Math.max(1, ...activity.buckets);
  const zones = zoneCounts(snapshot);
  const total = Math.max(1, snapshot.findings.length);
  const revisionUrl = snapshot.revision
    ? `https://github.com/${snapshot.repository}/commit/${snapshot.revision}`
    : "";

  return (
    <div className="overview">
      <p className="ov-lede">
        <strong>{attention.length}</strong> of {snapshot.findings.length} traces
        need review.{" "}
        {activity.total > 0 && activity.latestAgeDays !== null && (
          <>
            The latest inspected commit landed{" "}
            <strong>
              {activity.latestAgeDays === 0
                ? "the day of this scan"
                : `${activity.latestAgeDays} days before this scan`}
            </strong>
            .{" "}
          </>
        )}
        {snapshot.branchesInspected} branch tips and {snapshot.sampledFiles} source
        files were sampled.
      </p>

      <div className="ov-grid">
        <section className="block span-8" aria-labelledby="activity-title">
          <header className="block-head">
            <h3 id="activity-title">Commit activity</h3>
            <span className="block-note">latest {activity.total} commits</span>
          </header>
          {activity.total ? (
            <div className="spark">
              <div className="spark-bars" aria-hidden="true">
                {activity.buckets.map((count, index) => (
                  <span
                    key={index}
                    className={count ? "spark-bar" : "spark-bar is-empty"}
                    style={{ height: `${Math.max(count ? 8 : 2, (count / peak) * 100)}%` }}
                    title={`${count} commit${count === 1 ? "" : "s"}`}
                  />
                ))}
              </div>
              <div className="spark-axis">
                <span>{day(activity.first!)}</span>
                <span>{day(activity.last!)}</span>
              </div>
              <p className="fine">
                {activity.total} commits across{" "}
                {activity.spanDays ? `${activity.spanDays} days` : "a single day"}.
                Activity alone does not establish repository health.
              </p>
            </div>
          ) : (
            <p className="block-empty">No commit dates were captured in this snapshot.</p>
          )}
        </section>

        <section className="block span-4" aria-labelledby="facts-title">
          <header className="block-head">
            <h3 id="facts-title">At a glance</h3>
          </header>
          <p className="facts-desc">{snapshot.description}</p>
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
            <div>
              <dt>Files in tree</dt>
              <dd>{snapshot.files.length.toLocaleString()}</dd>
            </div>
            <div>
              <dt>Commits read</dt>
              <dd>{snapshot.commitsInspected}</dd>
            </div>
            <div>
              <dt>API requests</dt>
              <dd>{snapshot.requests}</dd>
            </div>
          </dl>
        </section>

        <section className="block span-8" aria-labelledby="attention-title">
          <header className="block-head">
            <h3 id="attention-title">Needs attention</h3>
            <span className="block-count">{attention.length}</span>
          </header>
          {attention.length ? (
            <ul className="attention-list">
              {attention.slice(0, 6).map((finding) => (
                <li key={finding.id}>
                  <button onClick={() => onOpen(finding.id)}>
                    <span className={`zone-dot z-${finding.zone}`} aria-hidden="true" />
                    <span className="att-main">
                      <span className="att-title">{finding.title}</span>
                      <span className="att-path">{finding.path}</span>
                    </span>
                    <span className="att-conf">{finding.confidence}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="block-empty">
              Nothing in the sampled data was marked for review. That does not mean
              the repository has no problems.
            </p>
          )}
          {attention.length > 6 && (
            <footer className="block-foot">
              <button className="link-btn" onClick={() => onBrowse("all")}>
                See all {attention.length} on the board
              </button>
            </footer>
          )}
        </section>

        <section className="block span-4" aria-labelledby="groups-title">
          <header className="block-head">
            <h3 id="groups-title">Where findings live</h3>
          </header>
          <div className="stack-bar" aria-hidden="true">
            {zones.map((zone) =>
              zone.total ? (
                <span
                  key={zone.id}
                  className={`z-${zone.id}`}
                  style={{ width: `${(zone.total / total) * 100}%` }}
                />
              ) : null,
            )}
          </div>
          <ul className="group-list">
            {zones.map((zone) => (
              <li key={zone.id}>
                <button onClick={() => onBrowse(zone.id)}>
                  <span className={`zone-dot z-${zone.id}`} aria-hidden="true" />
                  <span className="group-name">{zone.name}</span>
                  <span className="group-count">
                    {zone.total}
                    {zone.review ? <em> · {zone.review} review</em> : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="block span-12" aria-labelledby="details-title">
          <header className="block-head">
            <h3 id="details-title">Languages, people and releases</h3>
            {details.status === "ready" && (
              <button className="link-btn" onClick={onLoadDetails}>
                Refresh
              </button>
            )}
          </header>
          {details.status !== "ready" ? (
            <div className="load-inline">
              <p>
                Reads the language mix, top contributors, and latest release from
                GitHub, only when you ask.
              </p>
              <button
                className="btn btn-plain"
                onClick={onLoadDetails}
                disabled={details.status === "loading"}
              >
                {details.status === "loading" ? "Loading…" : "Load details · 3 requests"}
              </button>
              {details.status === "error" && (
                <span className="inline-error" role="alert">
                  {details.error}
                </span>
              )}
            </div>
          ) : (
            <DetailsBody details={details.data!} />
          )}
        </section>

        {snapshot.warnings.length > 0 && (
          <section className="block span-12 block-muted" aria-labelledby="coverage-title">
            <header className="block-head">
              <h3 id="coverage-title">Coverage notes</h3>
            </header>
            <ul className="coverage-list">
              {snapshot.warnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

function DetailsBody({ details }: { details: Details }) {
  const total = details.languages.reduce((sum, language) => sum + language.bytes, 0);
  const now = details.fetchedAt;
  return (
    <div className="details">
      <div>
        <h4>Languages</h4>
        {details.languages.length ? (
          <>
            <div className="lang-bar" aria-hidden="true">
              {details.languages.map((language, index) => (
                <span
                  key={language.name}
                  className={`lang-${index}`}
                  style={{ width: `${(language.bytes / total) * 100}%` }}
                />
              ))}
            </div>
            <ul className="lang-legend">
              {details.languages.map((language, index) => (
                <li key={language.name}>
                  <span className={`swatch lang-${index}`} aria-hidden="true" />
                  {language.name}
                  <span className="muted">
                    {((language.bytes / total) * 100).toFixed(1)}%
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="muted">No language data.</p>
        )}
      </div>
      <div>
        <h4>Latest release</h4>
        {details.release ? (
          <p>
            <a href={details.release.url} target="_blank" rel="noreferrer">
              {details.release.name}
            </a>
            <span className="muted">
              {" "}
              {details.release.tag}
              {details.release.publishedAt ? ` · ${ago(details.release.publishedAt, now)}` : ""}
            </span>
          </p>
        ) : (
          <p className="muted">No published release.</p>
        )}
      </div>
      <div>
        <h4>Top contributors</h4>
        {details.contributors.length ? (
          <ol className="people">
            {details.contributors.map((person) => (
              <li key={person.login}>
                <a href={person.url} target="_blank" rel="noreferrer">
                  {person.login}
                </a>
                <span className="muted">{person.contributions.toLocaleString()}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted">No contributor data.</p>
        )}
      </div>
      {details.warnings.map((warning, index) => (
        <p key={index} className="inline-error">
          {warning}
        </p>
      ))}
    </div>
  );
}
