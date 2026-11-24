# Poltergeist Commits

A compact, read-only workspace for public GitHub repository activity, quiet branches, and unfinished work. Every finding links to evidence at its observed revision.

## Run

Requires Node.js 22.22.2+, 24.15+, or 26+ and npm, matching current test-tool requirements.

```sh
npm ci
npm run dev
```

Open the printed local URL. The bundled demo findings work without contacting GitHub; its open issues and pull requests load live (one request) when internet is available. Live scans require internet access.

```sh
npm test
npm run build
npm run preview
```

## Included

- Public GitHub URL validation; no authentication or tokens.
- Three-pane app shell sized with `dvh`/`dvw`: a fixed sidebar (scan field accepting `owner/repo` or a URL, demo, view navigation with counts, Report and Settings menus, API quota meter), a scrolling main pane with a pinned header (repository, snapshot origin, branch/revision, observation date, sampled-data notice, coverage notes), and a docked evidence pane. On narrow screens the sidebar stacks on top and evidence opens full-screen.
- Findings appear as a three-lane board (one lane per group) or an analyst table. Category, status, and sort controls stay behind **Filters**; search remains visible.
- Evidence opens in a pane beside the list, so the list stays usable. Escape or the close button dismisses it. Metadata, source link, and next step are always visible; review tools are expandable.
- Six themes under **Settings → Theme**: Halloween (default; pumpkin orange on midnight plum, slime-green activity, ghost-violet branches), Light, Dark, Midnight, High contrast, and Match system (follows the OS light/dark preference and updates live). The choice is saved in this browser; unknown saved values fall back to Halloween. System UI font plus locally hosted IBM Plex Mono (OFL) for paths and labels; no runtime font CDN requests.
- Subtle evidence transitions; manual and system reduced-motion support. Theme, audio, and storage controls stay behind **Settings**.
- Opt-in synthesized ambience, trace chimes, completion tones, volume, and mute. Audio starts only after clicking **Enable ambience**, suspends in background tabs, and closes when the app unmounts. No audio downloads, licenses, accounts, or paid services.
- Previous/next navigation through currently filtered traces, preserving each finding's source evidence.
- Revision-specific reviewed markers and investigation notes, autosaved in this browser. Reviewed/unreviewed filters help track progress.
- Offline JSON report import and export, including notes for the report's exact evidence versions. Existing local notes take priority during import. Invalid and oversized reports leave current results intact.
- Optional snapshot comparison inside **Report**, with new/changed/missing sampled observations and links to both evidence versions. Comparing does not replace the current snapshot or merge baseline notes.
- **Print full report** provides a clean print/PDF layout with all findings, source URLs, scope warnings, local review notes, and comparison counts when present.
- Commit activity, non-default branch-tip age, explicit TODO/FIXME markers, root dependency declarations, README observations, a no-recognized-tests observation (complete trees only), and tracked file names commonly used for secrets (`.env`, `*.pem`, `id_rsa`; contents are never read and no secret is claimed). These two structure checks use the already-fetched file tree and add no API calls.
- One locally saved live snapshot, JSON report export, and explicit cache deletion.
- Recorded public-repository demo; clearly separated from live and cached scans.
- Cancellation, request timeouts, explicit errors, partial coverage, and rate-limit handling.

- **Overview** (default view), in priority order: a one-line verdict; **Needs attention** beside a **findings-by-group donut**; **branch tip age** bars against the 90-day review line (click a bar to open its evidence) beside an **open-thread age histogram** (issues vs pull requests, quiet 90+ days faded); a **commit timeline** (one dot per inspected commit with a density curve and the scan date marked); newest open threads; then languages/people/releases, at-a-glance facts, and coverage notes. Charts are SVG built with d3-scale/d3-shape/d3-array, themed by CSS, labelled for screen readers, and animated subtly. Everything except threads and details comes from the saved snapshot; no extra API calls. Issues and Pull requests views also show their own age histogram.
- **Issues** and **Pull requests** views: as soon as a live, cached, or demo snapshot is shown, one request reads the 100 most recently updated open items and splits them by type. Sidebar counts update live; the Overview shows the newest of each under **Open threads**. Imported reports stay offline until you click Load. If GitHub already reported an exhausted quota, nothing is fetched automatically. Search, sort by recent/most discussed/quietest, flag items not updated in 90+ days, and load up to 10 comments per thread (1 request each). All text renders as plain text; links are built from validated numbers, never copied from API responses.
- **Languages, people and releases** panel on Overview: language mix, top 8 contributors, and the latest release (3 requests, on request).
- **Copy Markdown summary** in the Report menu, with repository text escaped. Includes loaded issues.
- **Quota readout** in the top bar from GitHub's rate-limit headers.
- **Command palette** (⌘K / Ctrl+K, built on `cmdk`): jump to any view, group, or finding; load issues or details; export, compare, print, copy Markdown; switch theme, motion, and sound. **J / K** step through visible findings; **Esc** closes evidence.
- Motion (via `motion`, honoring both the system reduced-motion setting and **Reduce motion**): sliding nav indicator, staggered board cards with layout-aware filtering, evidence pane slide-in, animated activity bars and counters, toast entrances, and loading skeletons. No flashing or looping effects except loading indicators.
- Icons from Phosphor (duotone in Halloween/Light/Dark, light strokes in Midnight, bold in High contrast) plus a custom logo (a ghost whose eyes are two commits joined by a merge curve), drawn per theme with the same meaning: Halloween uses a castle, footprints, doors, skull, eye, tombstone, and flashlight; Midnight uses telescope, orbit, satellite, and radar; High contrast uses heavier strokes; Light and Dark use standard product icons. Theme switches cross-fade using the browser View Transitions API when available. Colors, buttons, menus, and links animate subtly; all motion respects system and manual reduced-motion settings.
- Fonts: Inter Variable for interface text, Bricolage Grotesque Variable for headings, IBM Plex Mono for paths. All fonts are bundled locally by Vite (Fontsource); no runtime font CDN.
- **Home page** (`#/`): hero with a large scan field, demo entry, **Pick up where you left off** (saved/imported scan opens instantly; up to 8 recent repositories can be re-scanned), feature overview, and a plain "what it reads / never does" section. The dashboard lives at `#/dashboard`; browser Back returns home. Nothing contacts GitHub until you open a dashboard.
- **People** view: all-time top contributors (with avatars), who authored the latest inspected commits, open work per author with their relationship to the project (owner, member, contributor, first-time contributor), assignee workload with the unassigned count, a donut of who opens pull requests, and first-time contributors' pull requests waiting longest. Activity counts describe activity, not performance.
- **Richer threads**: author avatar and relationship, assignees, reactions, and for pull requests an on-demand **review details** read (2 requests): additions/deletions bar, files changed, commits, mergeable state, requested reviewers, and each reviewer's latest verdict.
- **More visualizations**: 52-week commit heatmap, release cadence timeline (median gap), language donut, ranked bars with avatars, and hover tooltips on all charts.
- **Repository facts** captured by the scan without extra requests: forks, watchers, license, topics, created and last-push dates, archived state, https-only homepage, and commit authors.
- **Commits** view (GitHub-style commit graph): the last 40 commits on the default branch plus up to 15 on each sampled branch (1 + up to 4 requests), drawn as colored lanes with curved merge and branch joins, hollow merge nodes, glowing branch-tip nodes, branch labels (default branch highlighted), author avatars, commit-type dots, and dashed edges where older history was not loaded. Search highlights matching commits without breaking the graph. Selecting a commit loads its detail (1 request): full message, verified badge, parents (click to jump), additions/deletions bar, and every changed file with status icon, per-file change bar, and a link pinned to that commit. Below: a **commit-type donut** (features, fixes, dependencies, docs, tests, refactors, chores, merges), a **punch card** of commits by weekday and hour, and **code frequency** (lines added/removed per week on a symmetric log scale with a hover guide) from GitHub's statistics endpoints (2 requests; "still computing" replies are shown as pending). Lane layout is deterministic and property-tested.
- **Quota protection**: the quota meter reads GitHub's free `/rate_limit` endpoint. Once GitHub reports the hourly quota spent, the app stops sending API requests until the reset time (remembered across reloads) and says when to retry. Automatic background loads only run if they leave 10 requests for scans, counting only responses not already cached; otherwise the panel explains the pause and offers a manual load.
- **Response cache (45 minutes)**: every GitHub API read (scan, threads, details, commit graph, statistics, comments, reviews, commit files) goes through a local cache. Asking for the same repository again within 45 minutes is answered from this browser instead of GitHub, so revisits cost no quota. Only successful (200) responses are stored, in IndexedDB (memory fallback); errors, rate limits, and "still computing" replies never are. Cached reads are not counted as API requests, the scan adds a coverage note saying how many responses were reused, the header shows **FROM CACHE**, and "updated … ago" times reflect when data was actually fetched. **Rescan live** (header or ⌘K) and every **Refresh** button skip the cache for what they reload; **Settings → Clear cached GitHub data** empties it.
## Scan contract

`src/scan.ts` owns the snapshot/finding types, URL trust boundary, API reads, and evidence mapping. `src/App.tsx` renders those records without executing source content. `src/useSoundscape.ts` owns opt-in Web Audio lifecycle, volume envelopes, background suspension, and throttled cues. `src/reviews.ts` validates reports and notes and manages local autosave. `src/compare.ts` compares validated snapshots by finding ID and substantive evidence fields. React escapes repository text. Cached, bundled, and imported records pass structural and source-URL validation before display.

When a dashboard opens for a non-imported snapshot, open threads (1 request) and repository details (4 requests: languages, top 30 contributors, last 10 releases, 52-week activity) load once per repository; GitHub may answer weekly stats with 202 while computing, shown as pending. Comments and pull-request review details load only on request. Avatars load from avatars.githubusercontent.com using validated numeric ids, with no referrer. All are separate from the scan budget below. A scan reads metadata, the default branch's latest commits (analysis uses 20), the first page of five branch names, up to four non-default branch histories (for tip dates), and a recursive tree: at most 8 REST API calls. Up to six source files are then read from raw.githubusercontent.com pinned to the inspected revision, which does not use the REST API quota. History and branch reads use the same URLs as the commit graph, so opening Commits after a scan reuses them. No automatic retries. Once GitHub reports a rate limit, remaining reads stop without further network requests. Files are pinned to the latest inspected default-branch commit; branch evidence is pinned to each observed branch tip. API responses are not an atomic snapshot across endpoints.

The tree is capped at 2,000 non-symlink blobs. Source sampling prioritizes root `package.json`, then paths under `src/`, `lib/`, and `app/`, then other text paths. Paths within each group sort alphabetically. At most six files are sampled, each at most 64 KiB. Each sampled source contributes at most three TODO/FIXME findings. The root manifest reports dependency declarations, flagging broad or remote version strings without claiming vulnerabilities. Commit rooms show up to six of the 20 inspected commits. Scan size is intentionally bounded for free API use; no full-history, repository-wide TODO, dependency-vulnerability, missing-test, or secret audit is claimed.

Branch tip commits at least 90 days old receive a medium-confidence review suggestion. Age does not establish abandonment, branch creation date, or merge status. TODO markers are high-confidence observations of text, not confirmed bugs. An absent README is a medium-confidence observation limited to the available tree. Failure to read a tree never produces a missing-README finding. No findings does not imply a healthy repository.

Nonessential API failures become snapshot warnings. Metadata failure preserves the preceding UI snapshot. Cancellation preserves previous results. No private repositories, code execution, writes to GitHub, paid AI, or server-side processing.

## $0 tools and hosting

- React, Vite, Vitest, fast-check, jsdom, motion, cmdk (with Radix UI Dialog), Phosphor Icons: MIT; Playwright (dev only): Apache-2.0; d3-scale, d3-shape, d3-array: ISC; TypeScript: Apache-2.0; Inter and Bricolage Grotesque (Fontsource): SIL OFL 1.1. Retain dependency license notices when distributing.
- Fraunces, Space Grotesk, and IBM Plex Mono: SIL Open Font License 1.1; bundled locally with notices and source URLs in `public/fonts/SOURCES.json`. Files total about 177 KiB; browser font swapping and two preloads keep text usable while downloading. Latin glyph assets use system fallbacks for other scripts.
- CSS, SVG, browser storage; no paid assets, font subscriptions, database, analytics, or API keys.
- GitHub public REST API: 60 unauthenticated requests/hour per originating IP; shared networks share quota. Browser scans call GitHub directly. Cached and demo records remain available when quota runs out.
- Cloudflare Pages Free: build command `npm run build`, output directory `dist`. Use the supplied `pages.dev` address. No Pages Functions or paid plan required. Static requests are free; free build quota is 500/month.
- Kiro Free is optional for development, limited to 50 credits/month. No development assistant or subscription is needed to run the app.

Pricing checked November 20, 2026: [GitHub quotas](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api), [Cloudflare static pricing](https://developers.cloudflare.com/pages/functions/pricing/), [Cloudflare build limits](https://developers.cloudflare.com/pages/platform/limits/), [Kiro pricing](https://kiro.dev/pricing/).

Stay on free plans; do not enable paid add-ons. Existing device, electricity, and internet connection assumed. Third-party terms may change. This task does not publish, commit, or push.

## Verification

`npm test` covers unsafe URLs, deterministic source references and line numbers, bounded scans, dependency declarations, stale-branch confidence, symlink exclusion, corrupted cache, truncation, rate limits, unavailable repositories, and cancellation. Property-based checks exercise source mapping and trust boundaries. DOM interaction tests verify demo loading, source selection, filters, table switching, cache deletion, failed scans, theme changes, and safe text rendering. `npm run build` type-checks the app and generates static output.

Soundscape tests mock Web Audio to verify no autoplay, volume clamping, cue throttling, mute, background suspension, context disposal, and graceful failure. Explorer tests cover filtered trace navigation and motion controls. Visual smoothness and audible levels require verification in a real browser; browser access was unavailable during this task.

Review/report tests cover revision ownership, debounced persistence, restoration, conflict preservation, malformed saved data, offline imports, and size limits. DOM tests cover Escape dismissal and owner/repo shorthand; responsive appearance needs real-browser QA.

Comparison tests cover changed source revisions, ignored observation timestamps, missing partial data, and incompatible repositories/branches. UI tests verify baseline comparisons preserve current data, reject stale file reads, and invoke native printing with a source-linked report and escaped notes. Font rendering and actual printed pagination remain unverified without browser preview.

## Local notes and offline reports

Select a finding, then expand **Review & notes**. Notes save after 300 ms, when the page hides, or on app unmount. Up to 200 evidence records and 2,000 characters per note are supported. Clearing a note and unchecking its review marker removes that empty record. Notes apply to repository + finding ID + source revision; a changed source is not silently treated as already reviewed.

Storage failures preserve notes in memory and show an export reminder. Unreadable existing review data is never overwritten automatically. **Report → Export report** includes notes for findings in the current snapshot, excluding unrelated investigations. Export before changing browsers or clearing browser data.

**Report → Import report** accepts Poltergeist JSON files up to 2 MiB, including older exports without notes. Imports make no GitHub requests. Invalid sources, foreign note ownership, and excess local review capacity are rejected before replacing current results. Imported notes merge underneath existing local notes. **Clear saved scan** removes only the scan cache, preserving review notes.

## Comparison and printing

**Report → Compare snapshot** loads a saved report as the baseline for the currently displayed snapshot. Repository and default branch must match. Comparison is session-only, performs no GitHub requests, and does not import baseline notes. Loading another current snapshot clears it. If the current snapshot changes while a file is being read, the stale file is rejected.

Finding IDs identify matching observations. Title, path, category, explanation, action, confidence, severity, or source changes count as changed; capture timestamps alone do not. Missing observations are labeled **Not seen in current sample**, never resolved: tree/source sampling and partial failures can hide evidence. Both current and baseline source links remain available.

**Report → Print full report** invokes browser printing. Save as PDF using the browser's destination control if desired. The print layout includes all current findings rather than only filtered rows, plus their source URLs, local notes, scope warnings, and comparison counts. Settings, input controls, and evidence drawers are excluded from printing. No PDF library, server, or paid export service is required.

## Motion and sound

Use **Enable ambience** to start a quiet three-tone drone. Selecting a finding plays a brief synthesized chime; successful live scans play a two-note cue. Volume defaults to 20%; zero volume remains silent. **Mute ambience** fades output before suspending audio. No preference automatically starts sound on a later visit.

**Settings → Reduce motion** stops entry animations and interaction transitions. System `prefers-reduced-motion` remains respected independently. The remaining evidence transition uses opacity and a small transform. No render loop, Three.js dependency, flashing effects, or automatic walkthroughs.

Native platform references: [Web Audio resume](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/resume), [background suspension](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/suspend), [gain envelopes](https://developer.mozilla.org/en-US/docs/Web/API/AudioParam/setTargetAtTime).

## Kiro workflow
How Kiro was used: the spec in `.kiro/specs/repository-analysis/` drove the scan contract and finding thresholds; steering in `.kiro/steering/product.md` kept every finding tied to evidence, confidence, and a next step; two save hooks run `npm test` and `npm run build`; property-based tests (fast-check) guard URL validation, source mapping, and determinism.


Open this repository as the Kiro project root. The original concept spec is in `docs/concept-spec.md`. `.kiro/specs/repository-analysis/` contains requirements, design, and task status; `.kiro/steering/product.md` preserves evidence, accessibility, and cost constraints. `.kiro/hooks/check-evidence.json` runs `npm test` after relevant saves using the [current shell-hook format](https://kiro.dev/docs/hooks/) for IDE 1.x / CLI V3. Hook activation inside Kiro and browser visual QA remain unverified; see the task checklist. Shell test execution does not require model credits.
