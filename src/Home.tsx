import { motion } from "motion/react";
import { Icon, Kbd, isMac } from "./ui";

export type HistoryEntry = {
  repository: string;
  observedAt: string;
  findings: number;
  review: number;
};

type Props = {
  url: string;
  setUrl: (value: string) => void;
  onScan: (event: React.FormEvent) => void;
  busy: boolean;
  progress: string;
  onCancel: () => void;
  onDemo: () => void;
  onImport: () => void;
  onPalette: () => void;
  resume: { repository: string; label: string; observedAt: string } | null;
  onResume: () => void;
  history: HistoryEntry[];
  onPick: (repository: string) => void;
};

const FEATURES = [
  {
    icon: "board",
    title: "Findings board",
    body: "Recent commits, quiet branches, TODOs, loose dependencies, missing docs and tests, each linked to the exact line or commit.",
  },
  {
    icon: "pull",
    title: "Issues and pull requests",
    body: "Open threads load automatically and split by type. See who is waiting, what went quiet, sizes, and review verdicts.",
  },
  {
    icon: "users",
    title: "People",
    body: "Top contributors, who is committing now, assignee workload, and first-time contributors waiting on a reply.",
  },
  {
    icon: "activity",
    title: "Charts that explain",
    body: "52-week heatmap, commit timeline, branch ages against a 90-day line, thread ages, release cadence, languages.",
  },
  {
    icon: "report",
    title: "Notes and reports",
    body: "Mark findings reviewed, keep notes, export or import JSON, compare snapshots, copy Markdown, or print.",
  },
  {
    icon: "command",
    title: "Keyboard first",
    body: "Command palette for every view, finding, thread, and theme. J and K step through findings.",
  },
];

const fade = (delay: number) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { delay, duration: 0.5, ease: [0.16, 1, 0.3, 1] as const },
});

export function Home(props: Props) {
  const { url, setUrl, onScan, busy, progress, onCancel, onDemo, onImport, onPalette, resume, onResume, history, onPick } = props;
  return (
    <div className="home">
      <header className="home-bar">
        <a className="brand" href="#/" aria-label="Poltergeist Commits home">
          <span className="brand-glyph">
            <Icon name="ghost" size={17} />
          </span>
          <span className="brand-name">Poltergeist</span>
          <span className="brand-sub">commits</span>
        </a>
        <nav className="home-links" aria-label="Home">
          <a href="#features">Features</a>
          <a href="#limits">What it reads</a>
          <button className="palette-trigger compact" onClick={onPalette}>
            <Icon name="command" size={14} />
            <Kbd>{isMac() ? "⌘K" : "Ctrl K"}</Kbd>
          </button>
          <button className="btn btn-plain" onClick={onImport}>
            <Icon name="upload" size={15} />
            Import report
          </button>
        </nav>
      </header>

      <main className="home-main" id="explorer" tabIndex={-1}>
        <section className="hero-block" aria-labelledby="home-title">
          <motion.p className="eyebrow hero-eyebrow" {...fade(0)}>
            <Icon name="ghost" size={13} /> Kiroween repository field guide
          </motion.p>
          <motion.h1 id="home-title" {...fade(0.06)}>
            Find your repository’s <em>ghosts</em>.
          </motion.h1>
          <motion.p className="lede" {...fade(0.12)}>
            Quiet branches, forgotten TODOs, pull requests nobody answered. Paste a public
            GitHub repository and walk through it in your browser, with every finding tied
            to its source.
          </motion.p>
          <motion.form className="hero-scan" onSubmit={onScan} aria-busy={busy} {...fade(0.18)}>
            <label className="sr-only" htmlFor="home-url">
              Public GitHub repository
            </label>
            <Icon name="search" size={18} />
            <input
              id="home-url"
              type="text"
              inputMode="url"
              required
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="owner/repo or https://github.com/owner/repo"
              disabled={busy}
              spellCheck={false}
              autoComplete="off"
            />
            <button className="btn btn-primary btn-lg" disabled={busy}>
              <Icon name={busy ? "loader" : "next"} size={16} className={busy ? "spin" : ""} />
              {busy ? "Investigating…" : "Investigate"}
            </button>
          </motion.form>
          {busy ? (
            <p className="hero-progress" role="status">
              {progress}{" "}
              <button className="link-btn" onClick={onCancel}>
                Cancel
              </button>
            </p>
          ) : (
            <motion.p className="hero-alt" {...fade(0.24)}>
              No repository in mind?{" "}
              <button className="link-btn" onClick={onDemo}>
                <Icon name="demo" size={14} /> Open the demo dashboard
              </button>{" "}
              <span className="muted">(a recorded scan of expressjs/express)</span>
            </motion.p>
          )}
        </section>

        {(resume || history.length > 0) && (
          <motion.section className="home-recent" aria-labelledby="recent-title" {...fade(0.3)}>
            <h2 id="recent-title" className="home-h2">
              Pick up where you left off
            </h2>
            <div className="recent-grid">
              {resume && (
                <button className="recent-card is-resume" onClick={onResume}>
                  <span className="eyebrow">{resume.label}</span>
                  <strong>{resume.repository}</strong>
                  <span className="muted">
                    Observed {new Date(resume.observedAt).toLocaleDateString()} · opens instantly,
                    no new scan
                  </span>
                  <span className="recent-go">
                    Open dashboard <Icon name="next" size={14} />
                  </span>
                </button>
              )}
              {history
                .filter((entry) => entry.repository !== resume?.repository)
                .slice(0, 5)
                .map((entry) => (
                  <button key={entry.repository} className="recent-card" onClick={() => onPick(entry.repository)}>
                    <span className="eyebrow">Scanned {new Date(entry.observedAt).toLocaleDateString()}</span>
                    <strong>{entry.repository}</strong>
                    <span className="muted">
                      {entry.findings} traces · {entry.review} needed review
                    </span>
                    <span className="recent-go">
                      Scan again · up to 14 requests <Icon name="next" size={14} />
                    </span>
                  </button>
                ))}
            </div>
          </motion.section>
        )}

        <section id="features" className="home-features" aria-labelledby="features-title">
          <h2 id="features-title" className="home-h2">
            Everything on one dashboard
          </h2>
          <div className="feature-grid">
            {FEATURES.map((feature, index) => (
              <motion.article
                key={feature.title}
                className="feature"
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + index * 0.05, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              >
                <span className="feature-icon" aria-hidden="true">
                  <Icon name={feature.icon} size={18} />
                </span>
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
              </motion.article>
            ))}
          </div>
        </section>

        <section id="limits" className="home-limits" aria-labelledby="limits-title">
          <h2 id="limits-title" className="home-h2">
            What it reads, and what it doesn’t
          </h2>
          <div className="limits-grid">
            <div>
              <h3>
                <Icon name="check" size={15} /> Reads
              </h3>
              <ul>
                <li>Public GitHub data only, with no token or account.</li>
                <li>A bounded scan: at most 14 API calls, 20 commits, 6 source files.</li>
                <li>Open threads (1 call) and repository details (4 calls) after the scan.</li>
                <li>Your notes and the last scan stay in this browser.</li>
              </ul>
            </div>
            <div>
              <h3>
                <Icon name="close" size={15} /> Never
              </h3>
              <ul>
                <li>Runs repository code, writes to GitHub, or uses a server.</li>
                <li>Claims a full audit. No findings does not mean no problems.</li>
                <li>Says a secret exists. Sensitive file names are flagged, contents unread.</li>
                <li>Judges people. Activity counts are just counts.</li>
              </ul>
            </div>
          </div>
        </section>
      </main>
      <footer className="home-foot">
        <span>
          <Icon name="ghost" size={14} /> Poltergeist Commits · built for Kiroween
        </span>
        <span className="muted">Free tools · read-only · real evidence</span>
      </footer>
    </div>
  );
}
