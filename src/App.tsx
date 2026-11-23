import { Overview } from "./Overview";
import { Issues } from "./Issues";
import { useCommunity } from "./useCommunity";
import { getQuota, subscribeQuota } from "./quota";
import { toMarkdown } from "./markdown";
import {
  THEMES,
  getPrefersDark,
  isDarkTheme,
  loadTheme,
  resolveTheme,
  saveTheme,
  subscribeScheme,
  themeCanvas,
  type ThemeId,
} from "./theme";
import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  isSnapshot,
  parseRepository,
  scanRepository,
  ZONES,
  type Snapshot,
  type Zone,
} from "./scan";
import "./style.css";
import { useSoundscape } from "./useSoundscape";
import { parseReport, reportReviews, reviewKey, useReviews } from "./reviews";
import { compareSnapshots, type Comparison } from "./compare";
function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    ghost: (
      <>
        <path d="M5 21V10a7 7 0 0 1 14 0v11l-3-2-4 2-4-2-3 2Z" />
        <path d="M9 10v2m6-2v2" />
      </>
    ),
    branch: (
      <>
        <circle cx="6" cy="5" r="2" />
        <circle cx="18" cy="5" r="2" />
        <circle cx="6" cy="19" r="2" />
        <path d="M6 7v10m12-10v2a6 6 0 0 1-6 6H6" />
      </>
    ),
    pulse: <path d="M2 12h5l3-8 4 16 3-8h5" />,
    search: (
      <>
        <circle cx="10" cy="10" r="6" />
        <path d="m15 15 6 6" />
      </>
    ),
    link: (
      <>
        <path d="M14 3h7v7m0-7L10 14" />
        <path d="M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5" />
      </>
    ),
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 1v2m0 18v2M1 12h2m18 0h2M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2" />
      </>
    ),
    check: <path d="m5 12 4 4L20 5" />,
    sound: (
      <>
        <path d="m11 4-6 5H2v6h3l6 5Z" />
        <path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" />
      </>
    ),
    home: <path d="M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z" />,
    issue: (
      <>
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="1.5" />
      </>
    ),
    board: (
      <>
        <rect x="3" y="4" width="5" height="16" rx="1" />
        <rect x="10" y="4" width="5" height="11" rx="1" />
        <rect x="17" y="4" width="4" height="7" rx="1" />
      </>
    ),
    table: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="1" />
        <path d="M3 10h18M3 15h18M9 10v10" />
      </>
    ),
    report: <path d="M6 3h9l4 4v14H6Z M14 3v5h5 M9 13h7M9 17h5" />,
    gear: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2m10-10 2-2" />
      </>
    ),
    close: <path d="M6 6l12 12M18 6 6 18" />,
    motion: (
      <>
        <path d="M3 7h11a3 3 0 1 0-3-3M3 12h16M3 17h9a3 3 0 1 1-3 3" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.ghost}
    </svg>
  );
}
const CACHE = "poltergeist.snapshot.v1";
const date = (value: string) =>
  new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

export function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [origin, setOrigin] = useState<"demo" | "live" | "cached" | "imported">(
    "demo",
  );
  const [url, setUrl] = useState("https://github.com/expressjs/express");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [view, setView] = useState<"overview" | "issues" | "map" | "table">("overview");
  const [zone, setZone] = useState<Zone | "all">("all");
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("review");
  const [selected, setSelected] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeId>(loadTheme);
  const prefersDark = useSyncExternalStore(
    subscribeScheme,
    getPrefersDark,
    () => false,
  );
  const resolvedTheme = resolveTheme(theme, prefersDark);
  useEffect(() => {
    saveTheme(theme);
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", themeCanvas(resolvedTheme));
  }, [theme, resolvedTheme]);
  const [motionPaused, setMotionPaused] = useState(false);
  const [comparison, setComparison] = useState<{
    baseline: Snapshot;
    changes: Comparison;
  } | null>(null);
  const sound = useSoundscape();
  const review = useReviews();
  const community = useCommunity(snapshot?.repository);
  const quota = useSyncExternalStore(subscribeQuota, getQuota);
  const controller = useRef<AbortController | null>(null);
  const demo = useRef<Snapshot | null>(null);
  const current = useRef<Snapshot | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const filePurpose = useRef<"import" | "compare">("import");
  const evidence = useRef<HTMLElement>(null);

  function resetFilters() {
    setZone("all");
    setStatus("all");
    setQuery("");
    setSort("review");
  }
  function show(data: Snapshot, mode: typeof origin) {
    current.current = data;
    setSnapshot(data);
    setOrigin(mode);
    setSelected(null);
    setComparison(null);
    resetFilters();
  }
  useEffect(() => {
    const loading = new AbortController();
    let restored = false;
    try {
      const cached: unknown = JSON.parse(localStorage.getItem(CACHE) || "null");
      if (isSnapshot(cached)) {
        show(cached, "cached");
        setUrl(`https://github.com/${cached.repository}`);
        restored = true;
      }
    } catch {
      setNotice(
        "Local storage is unavailable. Scans still work for this session.",
      );
    }
    fetch("/demo-snapshot.json", { signal: loading.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Bundled demo could not be loaded.");
        return response.json();
      })
      .then((data) => {
        if (!isSnapshot(data)) throw new Error("Bundled demo data is invalid.");
        demo.current = data;
        if (!restored && !current.current && !controller.current)
          show(data, "demo");
      })
      .catch((err) => {
        if (!loading.signal.aborted) setNotice(err.message);
      });
    return () => {
      loading.abort();
      controller.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (!selected) return;
    evidence.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelected(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selected]);

  async function scan(event: React.FormEvent) {
    event.preventDefault();
    const target = /^[A-Za-z0-9][\w.-]*\/[\w.-]+$/.test(url.trim())
      ? `https://github.com/${url.trim()}`
      : url;
    try {
      parseRepository(target);
    } catch (err) {
      setError((err as Error).message);
      return;
    }
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const data = await scanRepository(target, abort.signal, setProgress);
      show(data, "live");
      sound.cue(true);
      try {
        localStorage.setItem(CACHE, JSON.stringify(data));
      } catch {
        setNotice("Scan completed; local cache could not be saved.");
      }
    } catch (err) {
      if (abort.signal.aborted)
        setNotice("Scan cancelled. Previous results are preserved.");
      else
        setError(
          err instanceof Error
            ? err.message
            : "Scan failed. Check your connection and try again.",
        );
    } finally {
      controller.current = null;
      setBusy(false);
    }
  }
  function loadDemo() {
    if (!demo.current) {
      setNotice("Demo is loading. Try again shortly.");
      return;
    }
    show(demo.current, "demo");
    setError("");
    setNotice("");
  }
  function clearCache() {
    try {
      localStorage.removeItem(CACHE);
      setNotice("Saved scan deleted. Review notes are preserved.");
    } catch {
      setNotice("Browser storage could not be accessed.");
    }
  }
  function download() {
    if (!snapshot) return;
    const blob = new Blob(
      [
        JSON.stringify(
          {
            ...snapshot,
            localReviews: reportReviews(snapshot, review.reviews),
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `${snapshot.repository.replace("/", "-")}-field-report.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  }
  async function importReport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    const purpose = filePurpose.current;
    const snapshotAtStart = current.current;
    event.currentTarget.value = "";
    if (!file) return;
    setError("");
    try {
      if (file.size > 2 * 1024 * 1024)
        throw new Error("Report must be at most 2 MiB.");
      const report = parseReport(await file.text());
      if (current.current !== snapshotAtStart)
        throw new Error(
          "Snapshot changed while reading the file. Please choose the report again.",
        );
      if (purpose === "compare") {
        if (!snapshotAtStart)
          throw new Error("Load a snapshot before comparing reports.");
        const changes = compareSnapshots(snapshotAtStart, report.snapshot);
        setComparison({ baseline: report.snapshot, changes });
        setNotice(
          "Baseline loaded. Comparison uses sampled observations, not a complete repository audit.",
        );
        return;
      }
      review.merge(report.reviews);
      show(report.snapshot, "imported");
      setUrl(`https://github.com/${report.snapshot.repository}`);
      setNotice("Report imported offline. Existing local notes are preserved.");
      try {
        localStorage.setItem(CACHE, JSON.stringify(report.snapshot));
      } catch {
        setNotice(
          "Report imported for this session; local cache could not be saved.",
        );
      }
    } catch (err) {
      setError(
        err instanceof SyntaxError
          ? "Report contains invalid JSON."
          : err instanceof Error
            ? err.message
            : "Report could not be read.",
      );
    }
  }
  async function copyMarkdown() {
    if (!snapshot) return;
    try {
      await navigator.clipboard.writeText(
        toMarkdown(snapshot, community.issues.data?.items),
      );
      setNotice("Markdown summary copied to the clipboard.");
    } catch {
      setNotice("Clipboard access was blocked. Use Export report instead.");
    }
  }
  function chooseReport(purpose: "import" | "compare") {
    filePurpose.current = purpose;
    fileInput.current?.click();
  }
  const reviewed = (finding: Snapshot["findings"][number]) =>
    !!snapshot &&
    !!review.reviews[reviewKey(snapshot.repository, finding)]?.reviewed;
  const findings = (snapshot?.findings || [])
    .filter(
      (finding) =>
        (zone === "all" || finding.zone === zone) &&
        (status === "all" ||
          (status === "reviewed"
            ? reviewed(finding)
            : status === "unreviewed"
              ? !reviewed(finding)
              : finding.severity === status)) &&
        `${finding.title} ${finding.path} ${finding.explanation}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "name"
        ? a.title.localeCompare(b.title)
        : (a.severity === "review" ? 0 : 1) -
            (b.severity === "review" ? 0 : 1) || a.id.localeCompare(b.id),
    );
  const active = snapshot?.findings.find((finding) => finding.id === selected);
  const activeIndex = findings.findIndex((finding) => finding.id === selected);
  const activeKey =
    snapshot && active ? reviewKey(snapshot.repository, active) : "";
  const activeReview = review.reviews[activeKey] || {
    note: "",
    reviewed: false,
  };
  const filterCount =
    Number(zone !== "all") +
    Number(status !== "all") +
    Number(sort !== "review");
  const reviewCount =
    snapshot?.findings.filter((finding) => finding.severity === "review")
      .length || 0;
  function selectTrace(id: string) {
    setSelected(id);
    sound.cue();
  }

  const VIEW_TITLES = {
    overview: "Overview",
    issues: "Issues & pull requests",
    map: "Findings",
    table: "Analyst table",
  } as const;
  const originLabel =
    origin === "demo"
      ? "BUNDLED DEMO"
      : origin === "cached"
        ? "CACHED SNAPSHOT"
        : origin === "imported"
          ? "IMPORTED REPORT"
          : "LIVE SNAPSHOT";
  const zoneTotal = (id: Zone) =>
    snapshot?.findings.filter((finding) => finding.zone === id).length || 0;
  const go = (next: typeof view, nextZone: Zone | "all" = "all") => {
    setView(next);
    if (next === "map") setZone(nextZone);
  };
  const [owner, repoName] = snapshot ? snapshot.repository.split("/") : ["", ""];

  return (
    <div
      className={`app theme-${resolvedTheme} ${isDarkTheme(resolvedTheme) ? "is-dark" : ""} ${motionPaused ? "motion-paused" : ""} ${snapshot && active ? "has-inspector" : ""}`}
    >
      <a className="skip-link" href="#explorer">
        Skip to content
      </a>

      <aside className="sidebar" aria-label="Workspace">
        <a className="brand" href="/" aria-label="Poltergeist Commits home">
          <span className="brand-glyph">
            <Icon name="ghost" size={17} />
          </span>
          <span className="brand-name">Poltergeist</span>
          <span className="brand-sub">commits</span>
        </a>

        <form
          className="scan"
          onSubmit={scan}
          aria-label="Scan a public repository"
          aria-busy={busy}
        >
          <label className="scan-label" htmlFor="repo-url">
            Public GitHub repository
          </label>
          <input
            id="repo-url"
            type="text"
            inputMode="url"
            required
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="owner/repo or full URL"
            disabled={busy}
            spellCheck={false}
            autoComplete="off"
          />
          <div className="scan-actions">
            <button className="btn btn-primary" disabled={busy}>
              {busy ? "Investigating…" : "Investigate"}
            </button>
            <button
              type="button"
              onClick={loadDemo}
              disabled={busy}
              className="btn btn-plain"
            >
              Explore the demo
            </button>
          </div>
          {busy && (
            <p className="scan-progress">
              <span className="spinner" aria-hidden="true" />
              <span>{progress}</span>
              <button
                type="button"
                onClick={() => controller.current?.abort()}
                className="link-btn"
              >
                Cancel
              </button>
            </p>
          )}
        </form>

        {snapshot && (
          <nav className="nav" aria-label="Views">
            <p className="nav-heading">Repository</p>
            <button
              className="nav-item"
              aria-current={view === "overview" ? "page" : undefined}
              onClick={() => go("overview")}
            >
              <Icon name="home" size={16} />
              Overview
            </button>
            <button
              className="nav-item"
              aria-current={view === "issues" ? "page" : undefined}
              onClick={() => go("issues")}
              data-count={community.issues.data?.items.length ?? undefined}
            >
              <Icon name="issue" size={16} />
              Issues & PRs
            </button>
            <p className="nav-heading">Evidence</p>
            <button
              className="nav-item"
              aria-current={view === "map" && zone === "all" ? "page" : undefined}
              onClick={() => go("map")}
              data-count={snapshot.findings.length}
            >
              <Icon name="board" size={16} />
              Findings
            </button>
            {ZONES.map((item) => (
              <button
                key={item.id}
                className={`nav-item nav-sub z-${item.id}`}
                aria-current={view === "map" && zone === item.id ? "page" : undefined}
                onClick={() => go("map", item.id)}
                data-count={zoneTotal(item.id)}
              >
                <span className="zone-dot" aria-hidden="true" />
                {item.name}
              </button>
            ))}
            <button
              className="nav-item"
              aria-current={view === "table" ? "page" : undefined}
              onClick={() => go("table")}
            >
              <Icon name="table" size={16} />
              Analyst table
            </button>
          </nav>
        )}

        <div className="sidebar-foot">
          {quota && (
            <div
              className={`quota ${quota.remaining <= 10 ? "low" : ""}`}
              title="Unauthenticated GitHub API requests left this hour for your network"
            >
              <div className="quota-text">
                <span>GitHub API</span>
                <span>
                  {quota.remaining}/{quota.limit}
                </span>
              </div>
              <div className="quota-track" aria-hidden="true">
                <span
                  style={{
                    width: `${Math.min(100, (quota.remaining / Math.max(1, quota.limit)) * 100)}%`,
                  }}
                />
              </div>
            </div>
          )}
          <div className="foot-menus">
            <details className="menu menu-up report-menu">
              <summary>
                <Icon name="report" size={15} />
                Report
              </summary>
              <div className="menu-panel">
                <button
                  className="menu-item"
                  onClick={() => chooseReport("import")}
                  disabled={busy}
                >
                  Import report
                </button>
                <button
                  className="menu-item"
                  onClick={download}
                  disabled={!snapshot}
                >
                  Export report
                </button>
                <button
                  className="menu-item"
                  onClick={() => chooseReport("compare")}
                  disabled={!snapshot || busy}
                >
                  Compare snapshot
                </button>
                <button
                  className="menu-item"
                  onClick={copyMarkdown}
                  disabled={!snapshot}
                >
                  Copy Markdown summary
                </button>
                <button
                  className="menu-item"
                  onClick={() => window.print()}
                  disabled={!snapshot}
                >
                  Print full report
                </button>
                <p className="menu-note">
                  JSON export includes notes for this snapshot. Import works
                  offline; existing local notes take priority.
                </p>
              </div>
            </details>
            <details className="menu menu-up settings">
              <summary>
                <Icon name="gear" size={15} />
                {sound.enabled ? "Settings · sound on" : "Settings"}
              </summary>
              <div className="menu-panel">
                <p className="menu-heading" id="theme-heading">
                  Theme
                </p>
                <div
                  className="theme-list"
                  role="group"
                  aria-labelledby="theme-heading"
                >
                  {THEMES.map((item) => (
                    <button
                      key={item.id}
                      className="menu-item theme-option"
                      aria-pressed={theme === item.id}
                      onClick={() => setTheme(item.id)}
                      title={item.note}
                    >
                      <span
                        className="theme-swatch"
                        aria-hidden="true"
                        style={{
                          background: `linear-gradient(135deg, ${item.canvas} 0 55%, ${item.accent} 55% 100%)`,
                        }}
                      />
                      {item.label}
                    </button>
                  ))}
                </div>
                <p className="menu-heading">Motion</p>
                <button
                  className="menu-item"
                  onClick={() => setMotionPaused(!motionPaused)}
                  aria-pressed={motionPaused}
                >
                  <Icon name="motion" size={15} />
                  {motionPaused ? "Motion reduced" : "Reduce motion"}
                </button>
                <p className="menu-heading">Sound</p>
                <button
                  className="menu-item"
                  onClick={sound.toggle}
                  aria-pressed={sound.enabled}
                  disabled={sound.pending}
                >
                  <Icon name="sound" size={15} />
                  {sound.enabled ? "Mute ambience" : "Enable ambience"}
                </button>
                {sound.enabled && (
                  <label className="volume">
                    <span>Volume</span>
                    <input
                      aria-label="Ambience volume"
                      type="range"
                      min="0"
                      max="100"
                      value={sound.volume}
                      onChange={(event) =>
                        sound.changeVolume(Number(event.target.value))
                      }
                    />
                    <output>{sound.volume}%</output>
                  </label>
                )}
                <p className="menu-heading">Data</p>
                <button className="menu-item danger" onClick={clearCache}>
                  Clear saved scan
                </button>
                <p className="menu-note">
                  Review notes stay in this browser. Clearing a scan keeps your
                  notes.
                </p>
              </div>
            </details>
          </div>
          <p className="foot-line">Read-only · no tokens · every finding sourced</p>
        </div>
        <input
          ref={fileInput}
          hidden
          type="file"
          accept=".json,application/json"
          aria-label="Import investigation report"
          onChange={importReport}
          disabled={busy}
        />
      </aside>

      <main className="main" id="explorer" tabIndex={-1}>
        {snapshot ? (
          <>
            <h1 className="sr-only">Poltergeist Commits</h1>
            <header className="topline">
              <div className="crumbs">
                <a
                  href={`https://github.com/${snapshot.repository}`}
                  target="_blank"
                  rel="noreferrer"
                  className="crumb-repo"
                >
                  <span className="crumb-owner">{owner}</span>
                  <span className="crumb-sep">/</span>
                  <strong>{repoName}</strong>
                </a>
                <span className={`origin origin-${origin}`}>{originLabel}</span>
              </div>
              <div className="topline-meta">
                <span>
                  {snapshot.defaultBranch}
                  {snapshot.revision ? ` @ ${snapshot.revision.slice(0, 7)}` : ""}
                </span>
                <span>Observed {date(snapshot.observedAt)}</span>
                <span className="sample">Sampled data, not a full audit</span>
                {snapshot.warnings.length > 0 && (
                  <details className="menu coverage-menu">
                    <summary>
                      {snapshot.warnings.length} coverage{" "}
                      {snapshot.warnings.length === 1 ? "note" : "notes"}
                    </summary>
                    <div className="menu-panel wide">
                      <ul className="coverage-list">
                        {snapshot.warnings.map((warning, index) => (
                          <li key={index}>{warning}</li>
                        ))}
                      </ul>
                      <p className="menu-note">
                        Branch age threshold: 90 days. No security assessment,
                        secret detection, or repository code execution. No
                        findings does not mean no problems.
                        {origin === "demo"
                          ? " Recorded public-repository demo; not a current scan."
                          : ""}
                      </p>
                    </div>
                  </details>
                )}
              </div>
            </header>

            <div className="view-head">
              <h2>
                {view === "map" && zone !== "all"
                  ? ZONES.find((item) => item.id === zone)?.name
                  : VIEW_TITLES[view]}
              </h2>
              {(view === "map" || view === "table") && (
                <div className="toolbar">
                  <label className="search">
                    <Icon name="search" size={15} />
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      aria-label="Filter findings"
                      placeholder="Search findings"
                    />
                  </label>
                  <details className="menu filters">
                    <summary>
                      Filters{filterCount ? ` (${filterCount})` : ""}
                    </summary>
                    <div className="menu-panel">
                      <label className="field">
                        Category
                        <select
                          aria-label="Finding category"
                          value={zone}
                          onChange={(event) =>
                            setZone(event.target.value as Zone | "all")
                          }
                        >
                          <option value="all">All traces</option>
                          {ZONES.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        Status
                        <select
                          aria-label="Filter finding status"
                          value={status}
                          onChange={(event) => setStatus(event.target.value)}
                        >
                          <option value="all">All statuses</option>
                          <option value="review">Needs review</option>
                          <option value="info">Activity only</option>
                          <option value="unreviewed">Not yet reviewed</option>
                          <option value="reviewed">Reviewed by me</option>
                        </select>
                      </label>
                      <label className="field">
                        Sort
                        <select
                          aria-label="Sort findings"
                          value={sort}
                          onChange={(event) => setSort(event.target.value)}
                        >
                          <option value="review">Review first</option>
                          <option value="name">Name A–Z</option>
                        </select>
                      </label>
                      <button className="link-btn" onClick={resetFilters}>
                        Reset filters
                      </button>
                    </div>
                  </details>
                </div>
              )}
            </div>

            {comparison && (
              <section className="compare" aria-label="Snapshot comparison">
                <div className="compare-head">
                  <div>
                    <h3>What changed?</h3>
                    <p>
                      Current snapshot vs. {date(comparison.baseline.observedAt)}{" "}
                      · {comparison.changes.unchanged} unchanged observations.
                      Both are bounded samples; a missing observation does not
                      establish that a problem was fixed.
                    </p>
                  </div>
                  <button className="btn btn-plain" onClick={() => setComparison(null)}>
                    Close comparison
                  </button>
                </div>
                <div className="compare-cols">
                  <div>
                    <h4>New in sample ({comparison.changes.added.length})</h4>
                    <ul>
                      {comparison.changes.added.map((finding) => (
                        <li key={finding.id}>
                          <button className="link-btn" onClick={() => selectTrace(finding.id)}>
                            {finding.title}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h4>Changed observations ({comparison.changes.changed.length})</h4>
                    <ul>
                      {comparison.changes.changed.map(({ before, after }) => (
                        <li key={after.id}>
                          <button className="link-btn" onClick={() => selectTrace(after.id)}>
                            {after.title}
                          </button>
                          <span className="compare-links">
                            <a href={before.source} target="_blank" rel="noreferrer">
                              Baseline source
                            </a>
                            <a href={after.source} target="_blank" rel="noreferrer">
                              Current source
                            </a>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h4>
                      Not seen in current sample ({comparison.changes.missing.length})
                    </h4>
                    <ul>
                      {comparison.changes.missing.map((finding) => (
                        <li key={finding.id}>
                          <span>{finding.title}</span>
                          <span className="compare-links">
                            <a href={finding.source} target="_blank" rel="noreferrer">
                              Baseline source
                            </a>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </section>
            )}

            <div className="view-body">
              {view === "issues" ? (
                <Issues
                  repository={snapshot.repository}
                  issues={community.issues}
                  comments={community.comments}
                  onLoad={community.loadIssues}
                  onLoadComments={community.loadComments}
                />
              ) : view === "overview" ? (
                <Overview
                  details={community.details}
                  onLoadDetails={community.loadDetails}
                  snapshot={snapshot}
                  onOpen={selectTrace}
                  onBrowse={(next) => {
                    setZone(next);
                    setStatus("all");
                    setView("map");
                  }}
                />
              ) : view === "map" ? (
                <div className="board" aria-label="Finding groups">
                  {ZONES.filter(
                    (item) =>
                      (zone === "all" || zone === item.id) &&
                      findings.some((finding) => finding.zone === item.id),
                  ).map((item) => (
                    <section
                      key={item.id}
                      className={`lane z-${item.id}`}
                      aria-label={item.name}
                    >
                      <header className="lane-head">
                        <span className="zone-dot" aria-hidden="true" />
                        <h3>{item.name}</h3>
                        <span className="lane-count">
                          {findings.filter((finding) => finding.zone === item.id).length}
                        </span>
                      </header>
                      <p className="lane-sub">{item.subtitle}</p>
                      <div className="lane-cards">
                        {findings
                          .filter((finding) => finding.zone === item.id)
                          .map((finding) => (
                            <button
                              key={finding.id}
                              className={`trace ${finding.severity} ${selected === finding.id ? "selected" : ""}`}
                              onClick={() => selectTrace(finding.id)}
                              aria-pressed={selected === finding.id}
                            >
                              <span className="trace-tags">
                                <span className={`tag tag-${finding.severity}`}>
                                  {finding.severity === "review"
                                    ? "Needs review"
                                    : "Observed"}
                                </span>
                                {reviewed(finding) && (
                                  <span className="tag tag-done">
                                    <Icon name="check" size={12} />
                                    Reviewed
                                  </span>
                                )}
                              </span>
                              <strong className="trace-title">{finding.title}</strong>
                              <span className="trace-path">{finding.path}</span>
                              <span className="trace-conf">
                                {finding.confidence} confidence
                              </span>
                            </button>
                          ))}
                      </div>
                    </section>
                  ))}
                </div>
              ) : (
                <div className="sheet">
                  <table>
                    <thead>
                      <tr>
                        <th>Finding / source</th>
                        <th>Group</th>
                        <th>Status</th>
                        <th>Confidence</th>
                        <th>Review</th>
                      </tr>
                    </thead>
                    <tbody>
                      {findings.map((finding) => (
                        <tr
                          key={finding.id}
                          className={selected === finding.id ? "selected" : ""}
                        >
                          <td>
                            <button
                              className="table-finding"
                              onClick={() => selectTrace(finding.id)}
                            >
                              {finding.title}
                            </button>
                            <a href={finding.source} target="_blank" rel="noreferrer">
                              {finding.path}
                              <Icon name="link" size={11} />
                            </a>
                          </td>
                          <td>
                            {ZONES.find((item) => item.id === finding.zone)?.name}
                          </td>
                          <td>
                            <span className={`tag tag-${finding.severity}`}>
                              {finding.severity === "review" ? "Needs review" : "Observed"}
                            </span>
                          </td>
                          <td>{finding.confidence}</td>
                          <td>{reviewed(finding) ? "Reviewed" : "Not reviewed"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {(view === "map" || view === "table") && !findings.length && (
                <div className="empty">
                  <Icon name="ghost" size={28} />
                  <p>No matching findings. Try another filter.</p>
                  <button className="btn btn-plain" onClick={resetFilters}>
                    Clear filters
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <section className="landing" aria-labelledby="landing-title">
            <p className="eyebrow">Kiroween repository field guide</p>
            <h1 id="landing-title">
              Find your repository’s <em>ghosts</em>.
            </h1>
            <p className="lede">
              Paste a public GitHub repository in the sidebar. Poltergeist reads
              a bounded sample in your browser and links every finding to its
              source.
            </p>
            <ol className="steps">
              <li>
                <strong>Scan</strong>
                <span>Up to 14 read-only API calls. No tokens, no server.</span>
              </li>
              <li>
                <strong>Triage</strong>
                <span>Findings sort into living quarters, corridors, and the attic.</span>
              </li>
              <li>
                <strong>Inspect</strong>
                <span>Open evidence beside the list, follow the source, keep notes.</span>
              </li>
            </ol>
            <p className="lede-small">
              Or import a saved report from the Report menu.
            </p>
          </section>
        )}

        {snapshot && (
          <article className="print-report">
            <header>
              <span className="small-label">
                POLTERGEIST COMMITS · FIELD REPORT
              </span>
              <h1>{snapshot.repository}</h1>
              <p>
                {origin === "demo"
                  ? "Recorded demo"
                  : origin === "imported"
                    ? "Imported report"
                    : origin === "cached"
                      ? "Cached snapshot"
                      : "Live snapshot"}{" "}
                · observed {date(snapshot.observedAt)}
              </p>
              <p>
                Branch: {snapshot.defaultBranch} · revision:{" "}
                {snapshot.revision || "Unavailable"}
              </p>
            </header>
            <section>
              <h2>Scope</h2>
              <p>{snapshot.description}</p>
              <p>
                {snapshot.findings.length} findings · {snapshot.sampledFiles}{" "}
                source files sampled · {snapshot.commitsInspected} commits
                inspected · {snapshot.branchesInspected} branch tips inspected.
              </p>
              <ul>
                {snapshot.warnings.map((warning, index) => (
                  <li key={index}>{warning}</li>
                ))}
              </ul>
              <p>
                This sampled report is not a complete code or security audit. No
                findings does not mean no problems.
              </p>
            </section>
            <section>
              <h2>Findings & investigation notes</h2>
              {snapshot.findings.map((finding) => {
                const annotation =
                  review.reviews[reviewKey(snapshot.repository, finding)];
                return (
                  <section className="print-finding" key={finding.id}>
                    <h3>{finding.title}</h3>
                    <p>
                      {finding.zone} · {finding.confidence} confidence ·{" "}
                      {annotation?.reviewed
                        ? "Reviewed locally"
                        : "Not yet reviewed"}
                    </p>
                    <p>{finding.explanation}</p>
                    <p>
                      <strong>Next step:</strong> {finding.action}
                    </p>
                    <a href={finding.source}>{finding.source}</a>
                    {annotation?.note && (
                      <p className="print-note">
                        <strong>Investigation note:</strong>
                        {"\n"}
                        {annotation.note}
                      </p>
                    )}
                  </section>
                );
              })}
            </section>
            {comparison && (
              <section>
                <h2>Snapshot comparison</h2>
                <p>
                  Baseline observed {date(comparison.baseline.observedAt)}:{" "}
                  {comparison.changes.added.length} new in sample,{" "}
                  {comparison.changes.changed.length} changed,{" "}
                  {comparison.changes.missing.length} not seen in current
                  sample, {comparison.changes.unchanged} unchanged. Missing
                  observations are not confirmed resolutions.
                </p>
              </section>
            )}
          </article>
        )}
      </main>

      {snapshot && active && (
        <aside
          ref={evidence}
          className="inspector"
          aria-labelledby="evidence-title"
          tabIndex={-1}
        >
          <header className="inspector-head">
            <span className="eyebrow">Source evidence</span>
            <span className="inspector-pos">
              {activeIndex >= 0 ? `${activeIndex + 1} of ${findings.length}` : ""}
            </span>
            <button
              className="icon-btn"
              onClick={() => setSelected(null)}
              title="Close (Esc)"
            >
              <Icon name="close" size={16} />
              <span className="sr-only">Close evidence</span>
            </button>
          </header>
          <div key={active.id} className="evidence-detail">
            <div className="trace-tags">
              <span className={`tag tag-${active.severity}`}>
                {active.severity === "review" ? "Needs review" : "Observed activity"}
              </span>
              <span className="tag">{active.confidence} confidence</span>
              <span className={`tag z-${active.zone} tag-zone`}>
                {ZONES.find((item) => item.id === active.zone)?.name}
              </span>
            </div>
            <h3 id="evidence-title">{active.title}</h3>
            <p className="evidence-explanation">{active.explanation}</p>
            <a
              className="source-button"
              href={active.source}
              target="_blank"
              rel="noreferrer"
            >
              Inspect source
              <Icon name="link" size={14} />
            </a>
            <div className="next-step">
              <p className="eyebrow">Suggested next step</p>
              <p>{active.action}</p>
            </div>
            <dl className="evidence-facts">
              <div>
                <dt>Source</dt>
                <dd>{active.path}</dd>
              </div>
              <div>
                <dt>Observed</dt>
                <dd>{date(active.observedAt)}</dd>
              </div>
            </dl>
            <p className="fine">
              Source pinned to the inspected revision. Review notes apply to this
              evidence version.
            </p>
          </div>
          <details className="review-notes">
            <summary>
              Review & notes{activeReview.reviewed ? " · reviewed" : ""}
            </summary>
            <label className="review-checkbox">
              <input
                type="checkbox"
                checked={activeReview.reviewed}
                onChange={(event) =>
                  review.update(activeKey, { reviewed: event.target.checked })
                }
              />
              Mark reviewed
            </label>
            <label className="note-label">
              Investigation note
              <textarea
                aria-label="Investigation note"
                maxLength={2000}
                value={activeReview.note}
                onChange={(event) =>
                  review.update(activeKey, { note: event.target.value })
                }
                placeholder="Context, next steps, or why this is intentional…"
              />
            </label>
            <p role="status" className="fine">
              {review.message}
            </p>
          </details>
          <nav className="trace-navigation" aria-label="Trace navigation">
            <button
              className="btn btn-plain"
              disabled={activeIndex <= 0}
              onClick={() => selectTrace(findings[activeIndex - 1].id)}
            >
              Previous trace
            </button>
            <span>
              {activeIndex >= 0
                ? `Trace ${activeIndex + 1} of ${findings.length}`
                : "Selection outside current filters"}
            </span>
            <button
              className="btn btn-plain"
              disabled={!findings.length || activeIndex >= findings.length - 1}
              onClick={() => selectTrace(findings[activeIndex + 1].id)}
            >
              Next trace
            </button>
          </nav>
        </aside>
      )}

      <div className="toast-stack">
      <div className="toasts" role="status" aria-live="polite">
        {notice && <p className="toast">{notice}</p>}
        {sound.error && <p className="toast">{sound.error}</p>}
      </div>
      {error && (
        <div className="toast toast-error" role="alert">
          <span>{error}</span>
          <button onClick={loadDemo} disabled={busy} className="link-btn">
            Use demo
          </button>
          <button onClick={() => setError("")} className="link-btn">
            Dismiss
          </button>
        </div>
      )}
      </div>
    </div>
  );
}

