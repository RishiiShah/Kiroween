import { Overview } from "./Overview";
import { Issues } from "./Issues";
import { People } from "./People";
import { Commits } from "./Commits";
import { branchRefs } from "./history";
import { API_CACHE_TTL, clearApiCache, purge } from "./apiCache";
import { Home, type HistoryEntry } from "./Home";
import { useCommunity } from "./useCommunity";
import { getQuota, refreshQuota, subscribeQuota } from "./quota";
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
  iconSetFor,
  type ThemeId,
} from "./theme";
import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import {
  isSnapshot,
  parseRepository,
  scanRepository,
  ZONES,
  type Snapshot,
  type Zone,
} from "./scan";
import "./style.css";
import { EASE_OUT, Icon, IconSetContext, Kbd, Logo, isMac, t } from "./ui";
import { MotionConfig, motion } from "motion/react";
import { CommandPalette, type PaletteGroup } from "./CommandPalette";
import { useSoundscape } from "./useSoundscape";
import { parseReport, reportReviews, reviewKey, useReviews } from "./reviews";
import { compareSnapshots, type Comparison } from "./compare";
const CACHE = "poltergeist.snapshot.v1";
const HISTORY = "poltergeist.history.v1";
type Route = "home" | "dashboard";
const readRoute = (): Route =>
  typeof window !== "undefined" && window.location.hash.startsWith("#/dashboard")
    ? "dashboard"
    : "home";
function loadHistory(): HistoryEntry[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(HISTORY) || "[]");
    if (!Array.isArray(value)) return [];
    return value
      .filter(
        (item): item is HistoryEntry =>
          !!item &&
          typeof item.repository === "string" &&
          /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_.-]{1,100}$/.test(item.repository) &&
          typeof item.observedAt === "string" &&
          Number.isFinite(Date.parse(item.observedAt)) &&
          typeof item.findings === "number" &&
          typeof item.review === "number",
      )
      .slice(0, 8);
  } catch {
    return [];
  }
}
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
  const [url, setUrl] = useState("expressjs/express");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [view, setView] = useState<"overview" | "commits" | "people" | "issues" | "pulls" | "map" | "table">("overview");
  const [zone, setZone] = useState<Zone | "all">("all");
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("review");
  const [selected, setSelected] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeId>(loadTheme);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [route, setRoute] = useState<Route>(readRoute);
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory);
  useEffect(() => {
    const onHash = () => setRoute(readRoute());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  // The quota meter reads GitHub's free /rate_limit endpoint when the dashboard opens.
  useEffect(() => {
    if (route === "dashboard") void refreshQuota();
  }, [route]);
  function navigate(next: Route) {
    const hash = next === "dashboard" ? "#/dashboard" : "#/";
    if (window.location.hash !== hash) window.location.hash = hash;
    setRoute(next);
    if (next === "dashboard") requestAnimationFrame(() => document.getElementById("explorer")?.focus({ preventScroll: true }));
  }
  function remember(data: Snapshot) {
    const entry: HistoryEntry = {
      repository: data.repository,
      observedAt: data.observedAt,
      findings: data.findings.length,
      review: data.findings.filter((finding) => finding.severity === "review").length,
    };
    setHistory((all) => {
      const next = [entry, ...all.filter((item) => item.repository !== entry.repository)].slice(0, 8);
      try {
        localStorage.setItem(HISTORY, JSON.stringify(next));
      } catch {
        /* history is a convenience; ignore storage failures */
      }
      return next;
    });
  }
  const appRef = useRef<HTMLDivElement>(null);
  const keyHandler = useRef<(event: KeyboardEvent) => void>(() => {});
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
  const community = useCommunity(
    snapshot?.repository,
    origin !== "imported" && route === "dashboard",
  );
  const [threadFocus, setThreadFocus] = useState<number | null>(null);
  const threadCount = (kind: "issue" | "pull") =>
    community.issues.status === "loading"
      ? "…"
      : community.issues.data
        ? community.issues.data.items.filter((item) => item.kind === kind).length
        : undefined;
  function changeTheme(next: ThemeId) {
    const doc = document as Document & {
      startViewTransition?: (update: () => void) => unknown;
    };
    const calm =
      motionPaused ||
      (typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    if (doc.startViewTransition && !calm)
      doc.startViewTransition(() => flushSync(() => setTheme(next)));
    else setTheme(next);
  }
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
        setUrl(cached.repository);
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
    if (selected) evidence.current?.focus({ preventScroll: true });
  }, [selected]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => keyHandler.current(event);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  // Popover menus are native <details>; give them standard menu dismissal.
  useEffect(() => {
    const root = appRef.current;
    if (!root) return;
    const openMenus = () => [...root.querySelectorAll<HTMLDetailsElement>("details.menu[open]")];
    const onPointerDown = (event: PointerEvent) => {
      for (const menu of openMenus())
        if (!menu.contains(event.target as Node)) menu.open = false;
    };
    const onToggle = (event: Event) => {
      const menu = event.target as HTMLDetailsElement;
      if (!menu.matches?.("details.menu") || !menu.open) return;
      for (const other of openMenus()) if (other !== menu) other.open = false;
    };
    const onClick = (event: MouseEvent) => {
      const item = (event.target as Element | null)?.closest?.(".report-menu .menu-item");
      const menu = item?.closest("details");
      if (menu) menu.open = false;
    };
    document.addEventListener("pointerdown", onPointerDown);
    root.addEventListener("toggle", onToggle, true);
    root.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      root.removeEventListener("toggle", onToggle, true);
      root.removeEventListener("click", onClick);
    };
  }, []);

  async function scan(event: React.FormEvent) {
    event.preventDefault();
    await scanFor(url);
  }
  async function scanFor(value: string) {
    const target = /^[A-Za-z0-9][\w.-]*\/[\w.-]+$/.test(value.trim())
      ? `https://github.com/${value.trim()}`
      : value;
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
      setUrl(data.repository);
      remember(data);
      navigate("dashboard");
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
    navigate("dashboard");
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
      navigate("dashboard");
      setUrl(report.snapshot.repository);
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
  async function rescanLive() {
    if (!snapshot) return;
    await purge([`https://api.github.com/repos/${snapshot.repository}`]);
    setUrl(snapshot.repository);
    await scanFor(snapshot.repository);
  }
  async function clearGitHubCache() {
    await clearApiCache();
    setNotice("Cached GitHub responses cleared. The next reads go to GitHub.");
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
    people: "People",
    commits: "Commits",
    issues: "Issues",
    pulls: "Pull requests",
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
    if (next !== "issues" && next !== "pulls") setThreadFocus(null);
    if (next === "map") setZone(nextZone);
  };
  const [owner, repoName] = snapshot ? snapshot.repository.split("/") : ["", ""];

  keyHandler.current = (event: KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      setPaletteOpen((open) => !open);
      return;
    }
    if (paletteOpen || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === "Escape") {
      const menus = [
        ...(appRef.current?.querySelectorAll<HTMLDetailsElement>("details.menu[open]") ?? []),
      ];
      if (menus.length) {
        event.preventDefault();
        for (const menu of menus) menu.open = false;
        menus[menus.length - 1].querySelector<HTMLElement>("summary")?.focus();
        return;
      }
    }
    const target = event.target as HTMLElement | null;
    const typing =
      !!target &&
      (target.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
    if (event.key === "Escape" && selected) {
      setSelected(null);
      return;
    }
    if (typing || route !== "dashboard" || !snapshot || !findings.length) return;
    if (event.key === "j" || event.key === "k") {
      const step = event.key === "j" ? 1 : -1;
      const next =
        activeIndex < 0
          ? step > 0
            ? 0
            : findings.length - 1
          : Math.min(findings.length - 1, Math.max(0, activeIndex + step));
      event.preventDefault();
      selectTrace(findings[next].id);
    }
  };

  const paletteGroups: PaletteGroup[] = [
    {
      heading: "Go to",
      items: snapshot
        ? [
            { id: "go-home", label: "Home page", icon: "ghost", onSelect: () => navigate("home") },
            { id: "go-overview", label: "Overview", icon: "home", onSelect: () => { navigate("dashboard"); go("overview"); } },
            { id: "go-people", label: "People", icon: "users", onSelect: () => { navigate("dashboard"); go("people"); } },
            { id: "go-commits", label: "Commit graph", icon: "graph", onSelect: () => { navigate("dashboard"); go("commits"); } },
            { id: "go-issues", label: "Issues", icon: "issue", onSelect: () => { navigate("dashboard"); go("issues"); } },
            { id: "go-pulls", label: "Pull requests", icon: "pull", onSelect: () => { navigate("dashboard"); go("pulls"); } },
            { id: "go-findings", label: "All findings", icon: "board", onSelect: () => { navigate("dashboard"); go("map"); } },
            ...ZONES.map((item) => ({
              id: `go-${item.id}`,
              label: item.name,
              hint: item.subtitle,
              icon: item.icon,
              onSelect: () => { navigate("dashboard"); go("map", item.id); },
            })),
            { id: "go-table", label: "Analyst table", icon: "table", onSelect: () => { navigate("dashboard"); go("table"); } },
          ]
        : [],
    },
    {
      heading: "Findings",
      items: (snapshot?.findings ?? []).map((finding) => ({
        id: `finding-${finding.id}`,
        label: finding.title,
        hint: finding.path,
        icon: finding.severity === "review" ? "alert" : "activity",
        keywords: [finding.path, finding.zone, finding.severity],
        onSelect: () => { navigate("dashboard"); selectTrace(finding.id); },
      })),
    },
    {
      heading: "Actions",
      items: [
        { id: "act-demo", label: "Explore the demo", icon: "demo", disabled: busy, onSelect: loadDemo },
        { id: "act-scan", label: "Scan another repository", icon: "search", onSelect: () => document.getElementById("repo-url")?.focus() },
        ...(snapshot
          ? [
              { id: "act-issues", label: "Refresh issues and pull requests", hint: "1 request", icon: "refresh", onSelect: () => void community.loadIssues(true) },
              { id: "act-rescan", label: "Rescan live (skip cache)", hint: "up to 8 requests", icon: "refresh", disabled: busy, onSelect: () => void rescanLive() },
              ...(community.issues.data?.items ?? []).map((item) => ({
                id: `thread-${item.number}`,
                label: `#${item.number} ${item.title}`,
                hint: item.kind === "pull" ? "pull request" : "issue",
                icon: item.kind === "pull" ? (item.draft ? "draft" : "pull") : "issue",
                keywords: [item.author, ...item.labels],
                onSelect: () => {
                  navigate("dashboard");
                  setThreadFocus(item.number);
                  setView(item.kind === "pull" ? "pulls" : "issues");
                },
              })),
              { id: "act-details", label: "Refresh languages, contributors, releases", hint: "4 requests", icon: "users", onSelect: () => { go("overview"); void community.loadDetails(true); } },
              { id: "act-md", label: "Copy Markdown summary", icon: "copy", onSelect: () => void copyMarkdown() },
              { id: "act-export", label: "Export report", icon: "download", onSelect: download },
              { id: "act-compare", label: "Compare with a saved snapshot", icon: "compare", disabled: busy, onSelect: () => chooseReport("compare") },
              { id: "act-print", label: "Print full report", icon: "print", onSelect: () => window.print() },
            ]
          : []),
        { id: "act-import", label: "Import report", icon: "upload", disabled: busy, onSelect: () => chooseReport("import") },
      ],
    },
    {
      heading: "Theme",
      items: THEMES.map((item) => ({
        id: `theme-${item.id}`,
        label: `${item.label} theme`,
        hint: theme === item.id ? "current" : item.note,
        icon: "palette",
        onSelect: () => changeTheme(item.id),
      })),
    },
    {
      heading: "Preferences",
      items: [
        { id: "pref-motion", label: motionPaused ? "Restore motion" : "Reduce motion", icon: "motion", onSelect: () => setMotionPaused(!motionPaused) },
        { id: "pref-sound", label: sound.enabled ? "Mute ambience" : "Enable ambience", icon: sound.enabled ? "mute" : "sound", disabled: sound.pending, onSelect: sound.toggle },
      ],
    },
  ];
  const activePill = (on: boolean) =>
    on ? (
      <motion.span
        layoutId="nav-active"
        className="nav-active"
        aria-hidden="true"
        transition={{ type: "spring", stiffness: 260, damping: 34 }}
      />
    ) : null;

  return (
    <MotionConfig
      reducedMotion={motionPaused ? "always" : "user"}
      transition={{ duration: t(0.4), ease: EASE_OUT }}
    >
    <IconSetContext.Provider value={iconSetFor(resolvedTheme)}>
    <div
      ref={appRef}
      className={`app theme-${resolvedTheme} ${isDarkTheme(resolvedTheme) ? "is-dark" : ""} ${motionPaused ? "motion-paused" : ""} ${route === "dashboard" && snapshot && active ? "has-inspector" : ""} ${route === "home" ? "is-home" : ""}`}
    >
      <a className="skip-link" href="#explorer">
        Skip to content
      </a>

      <input
        ref={fileInput}
        hidden
        type="file"
        accept=".json,application/json"
        aria-label="Import investigation report"
        onChange={importReport}
        disabled={busy}
      />
      {route === "home" ? (
        <Home
          url={url}
          setUrl={setUrl}
          onScan={scan}
          busy={busy}
          progress={progress}
          onCancel={() => controller.current?.abort()}
          onDemo={loadDemo}
          onImport={() => chooseReport("import")}
          onPalette={() => setPaletteOpen(true)}
          resume={
            snapshot && origin !== "demo"
              ? {
                  repository: snapshot.repository,
                  observedAt: snapshot.observedAt,
                  label:
                    origin === "cached"
                      ? "Saved scan"
                      : origin === "imported"
                        ? "Imported report"
                        : "Current scan",
                }
              : null
          }
          onResume={() => navigate("dashboard")}
          history={history}
          onPick={(repository) => {
            setUrl(repository);
            void scanFor(repository);
          }}
        />
      ) : (
      <>
      <aside className="sidebar" aria-label="Workspace">
        <a className="brand" href="#/" aria-label="Poltergeist Commits home">
          <span className="brand-glyph">
            <Logo size={20} />
          </span>
          <span className="brand-name">Poltergeist</span>
          <span className="brand-sub">commits</span>
        </a>
        <button
          type="button"
          className="palette-trigger"
          onClick={() => setPaletteOpen(true)}
          aria-keyshortcuts="Meta+K Control+K"
        >
          <Icon name="command" size={15} />
          <span>Search or jump to…</span>
          <Kbd>{isMac() ? "⌘K" : "Ctrl K"}</Kbd>
        </button>

        <form
          className="scan"
          onSubmit={scan}
          aria-label="Scan a public repository"
          aria-busy={busy}
        >
          <label className="scan-label" htmlFor="repo-url">
            Public GitHub repository
          </label>
          <div className="scan-field">
            <input
              id="repo-url"
              type="text"
              inputMode="url"
              required
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="owner/repo or URL"
              disabled={busy}
              spellCheck={false}
              autoComplete="off"
            />
            <button className="scan-go" disabled={busy} title="Investigate">
              <Icon
                name={busy ? "loader" : "go"}
                size={16}
                className={busy ? "spin" : ""}
              />
              <span className="sr-only">{busy ? "Investigating…" : "Investigate"}</span>
            </button>
          </div>
          <p className="scan-alt">
            or{" "}
            <button
              type="button"
              onClick={loadDemo}
              disabled={busy}
              className="link-btn"
              title="Load a recorded scan of expressjs/express"
            >
              Explore the demo
            </button>
          </p>
          {busy && (
            <p className="scan-progress">
              <Icon name="loader" size={14} className="spin" />
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
              {activePill(view === "overview")}
              <Icon name="home" size={16} />
              Overview
            </button>
            <button
              className="nav-item"
              aria-current={view === "people" ? "page" : undefined}
              onClick={() => go("people")}
            >
              {activePill(view === "people")}
              <Icon name="users" size={16} />
              People
            </button>
            <button
              className="nav-item"
              aria-current={view === "commits" ? "page" : undefined}
              onClick={() => go("commits")}
              data-count={community.graph.status === "loading" ? "…" : community.graph.data?.commits.length}
            >
              {activePill(view === "commits")}
              <Icon name="graph" size={16} />
              Commits
            </button>
            <button
              className="nav-item"
              aria-current={view === "issues" ? "page" : undefined}
              onClick={() => go("issues")}
              data-count={threadCount("issue")}
            >
              {activePill(view === "issues")}
              <Icon name="issue" size={16} />
              Issues
            </button>
            <button
              className="nav-item"
              aria-current={view === "pulls" ? "page" : undefined}
              onClick={() => go("pulls")}
              data-count={threadCount("pull")}
            >
              {activePill(view === "pulls")}
              <Icon name="pull" size={16} />
              Pull requests
            </button>
            <p className="nav-heading">Evidence</p>
            <button
              className="nav-item"
              aria-current={view === "map" && zone === "all" ? "page" : undefined}
              onClick={() => go("map")}
              data-count={snapshot.findings.length}
            >
              {activePill(view === "map" && zone === "all")}
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
                {activePill(view === "map" && zone === item.id)}
                <Icon name={item.icon} size={15} className="zone-icon" />
                {item.name}
              </button>
            ))}
            <button
              className="nav-item"
              aria-current={view === "table" ? "page" : undefined}
              onClick={() => go("table")}
            >
              {activePill(view === "table")}
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
                  <Icon name="upload" size={15} />
                  Import report
                </button>
                <button
                  className="menu-item"
                  onClick={download}
                  disabled={!snapshot}
                >
                  <Icon name="download" size={15} />
                  Export report
                </button>
                <button
                  className="menu-item"
                  onClick={() => chooseReport("compare")}
                  disabled={!snapshot || busy}
                >
                  <Icon name="compare" size={15} />
                  Compare snapshot
                </button>
                <button
                  className="menu-item"
                  onClick={copyMarkdown}
                  disabled={!snapshot}
                >
                  <Icon name="copy" size={15} />
                  Copy Markdown summary
                </button>
                <button
                  className="menu-item"
                  onClick={() => window.print()}
                  disabled={!snapshot}
                >
                  <Icon name="print" size={15} />
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
                      onClick={() => changeTheme(item.id)}
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
                  <Icon name={sound.enabled ? "mute" : "sound"} size={15} />
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
                <button className="menu-item" onClick={() => void clearGitHubCache()}>
                  <Icon name="refresh" size={15} />
                  Clear cached GitHub data
                </button>
                <button className="menu-item danger" onClick={clearCache}>
                  <Icon name="trash" size={15} />
                  Clear saved scan
                </button>
                <p className="menu-note">
                  GitHub responses are reused for {API_CACHE_TTL / 60000} minutes to
                  save quota. Review notes stay in this browser; clearing a scan
                  keeps your notes.
                </p>
              </div>
            </details>
          </div>
          <p className="foot-line">Read-only · no tokens · every finding sourced</p>
        </div>
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
                {snapshot.warnings.some((warning) => warning.includes("reused from this browser's cache")) && (
                  <span className="origin origin-cache" title="Some or all GitHub responses came from the 45-minute local cache">
                    FROM CACHE
                  </span>
                )}
                {origin !== "imported" && (
                  <button
                    className="rescan-btn"
                    onClick={() => void rescanLive()}
                    disabled={busy}
                    title="Rescan from GitHub, skipping the local cache (up to 8 requests)"
                  >
                    <Icon name={busy ? "loader" : "refresh"} size={13} className={busy ? "spin" : ""} />
                    {busy ? "Scanning…" : "Rescan live"}
                  </button>
                )}
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
              <div className="view-title">
                <h2>
                {view === "map" && zone !== "all"
                  ? ZONES.find((item) => item.id === zone)?.name
                  : VIEW_TITLES[view]}
              </h2>
                <p className="view-sub">
                  {view === "overview"
                    ? `A sampled read of ${snapshot.repository}: what needs attention, how it moves, and who works on it.`
                    : view === "people"
                      ? "Contributors, recent committers, open work, and newcomers waiting on a reply."
                      : view === "commits"
                        ? "History drawn as a graph, with what changed and when it happens."
                        : view === "issues"
                          ? "Open issues, most recently active first. Select one to read it."
                          : view === "pulls"
                            ? "Open pull requests, with size and review state on request."
                            : view === "map"
                              ? zone === "all"
                                ? "Every sampled finding, grouped by where it lives in the house."
                                : ZONES.find((item) => item.id === zone)?.subtitle
                              : "Every finding in one list, with confidence and source links."}
                </p>
              </div>
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

            <motion.div
              className="view-body"
              key={`${view}-${zone}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: t(0.24), ease: [0.16, 1, 0.3, 1] }}
            >
              {view === "commits" ? (
                <Commits
                  snapshot={snapshot}
                  auto={origin !== "imported"}
                  graph={community.graph}
                  insights={community.insights}
                  commits={community.commits}
                  onLoadGraph={() => void community.loadGraph(snapshot.defaultBranch, branchRefs(snapshot))}
                  onLoadInsights={() => void community.loadInsights(true)}
                  onLoadCommit={(sha) => void community.loadCommit(sha)}
                  onAuto={() => community.autoCommits(snapshot.defaultBranch, branchRefs(snapshot))}
                />
              ) : view === "people" ? (
                <People
                  snapshot={snapshot}
                  details={community.details}
                  threads={community.issues}
                  onLoadDetails={() => void community.loadDetails(true)}
                  onLoadThreads={() => void community.loadIssues(true)}
                  onOpenThread={(kind, number) => {
                    setThreadFocus(number);
                    setView(kind === "pull" ? "pulls" : "issues");
                  }}
                />
              ) : view === "issues" || view === "pulls" ? (
                <Issues
                  kind={view === "pulls" ? "pull" : "issue"}
                  focus={threadFocus}
                  repository={snapshot.repository}
                  issues={community.issues}
                  comments={community.comments}
                  onLoad={() => void community.loadIssues(true)}
                  onLoadComments={community.loadComments}
                  pulls={community.pulls}
                  onLoadPull={community.loadPull}
                />
              ) : view === "overview" ? (
                <Overview
                  onOpenPeople={() => go("people")}
                  onOpenCommits={() => go("commits")}
                  threads={community.issues}
                  onLoadThreads={() => void community.loadIssues(true)}
                  onOpenThread={(kind, number) => {
                    setThreadFocus(number);
                    setView(kind === "pull" ? "pulls" : "issues");
                  }}
                  details={community.details}
                  onLoadDetails={() => void community.loadDetails(true)}
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
                        <span className="lane-icon" aria-hidden="true">
                          <Icon name={item.icon} size={15} />
                        </span>
                        <h3>{item.name}</h3>
                        <span className="lane-count">
                          {findings.filter((finding) => finding.zone === item.id).length}
                        </span>
                      </header>
                      <p className="lane-sub">{item.subtitle}</p>
                      <div className="lane-cards">
                        {findings
                          .filter((finding) => finding.zone === item.id)
                          .map((finding, index) => (
                            <motion.button
                              key={finding.id}
                              layout="position"
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{
                                delay: t(Math.min(index, 10) * 0.035),
                                duration: t(0.28),
                                ease: [0.16, 1, 0.3, 1],
                              }}
                              whileHover={{ y: -3, transition: { duration: t(0.22), delay: 0, ease: EASE_OUT } }}
                              whileTap={{ scale: 0.985, transition: { duration: t(0.12), delay: 0 } }}
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
                              <span className="trace-foot">
                                <span className="trace-conf">
                                  {finding.confidence} confidence
                                </span>
                                <Icon name="next" size={14} className="trace-go" />
                              </span>
                            </motion.button>
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
            </motion.div>
          </>
        ) : (
          <section className="landing" aria-labelledby="landing-title">
            <p className="eyebrow">
              <Icon name="ghost" size={13} /> Kiroween repository field guide
            </p>
            <h1 id="landing-title">
              Find your repository’s <em>ghosts</em>.
            </h1>
            <p className="lede">
              Every codebase has rooms nobody visits: branches gone quiet, TODOs
              left behind, issues that went cold. Paste a public GitHub
              repository in the sidebar and Poltergeist walks the house for you,
              right in your browser, linking every finding to the exact line or
              commit it came from.
            </p>
            <ol className="steps">
              <li>
                <strong>Scan</strong>
                <span>Up to 8 read-only API calls. No tokens, no server.</span>
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
              Press <Kbd>{isMac() ? "⌘K" : "Ctrl K"}</Kbd> anytime to jump
              anywhere, or import a saved report from the Report menu.
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
        <motion.aside
          ref={evidence}
          initial={{ opacity: 0, x: 28 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ type: "spring", stiffness: 210, damping: 32 }}
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
          <motion.div
            key={active.id}
            className="evidence-detail"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: t(0.2)}}
          >
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
          </motion.div>
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
              <Icon name="prev" size={14} />
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
              <Icon name="next" size={14} />
            </button>
          </nav>
        </motion.aside>
      )}

      </>
      )}
      <div className="toast-stack">
      <div className="toasts" role="status" aria-live="polite">
        {notice && (
          <motion.p
            key={notice}
            className="toast"
            initial={{ opacity: 0, y: 14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
          >
            <Icon name="ghost" size={15} />
            {notice}
          </motion.p>
        )}
        {sound.error && <p className="toast">{sound.error}</p>}
      </div>
      {error && (
        <motion.div
          key={error}
          className="toast toast-error"
          role="alert"
          initial={{ opacity: 0, y: 14, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
        >
          <Icon name="alert" size={15} />
          <span>{error}</span>
          <button onClick={loadDemo} disabled={busy} className="link-btn">
            Use demo
          </button>
          <button onClick={() => setError("")} className="link-btn">
            Dismiss
          </button>
        </motion.div>
      )}
      </div>
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        groups={paletteGroups}
        container={appRef.current}
      />
    </div>
    </IconSetContext.Provider>
    </MotionConfig>
  );
}

