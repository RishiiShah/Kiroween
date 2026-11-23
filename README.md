# Poltergeist Commits

A compact, read-only workspace for public GitHub repository activity, quiet branches, and unfinished work. Every finding links to evidence at its observed revision.

## Run

Requires Node.js 22.22.2+, 24.15+, or 26+ and npm, matching current test-tool requirements.

```sh
npm ci
npm run dev
```

Open the printed local URL. The bundled demo works without contacting GitHub. Live scans require internet access.

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
- Warm light theme by default with a violet accent, green/violet/orange group colors, and orange review markers; dark theme under Settings. System UI font plus locally hosted IBM Plex Mono (OFL) for paths and labels; no runtime font CDN requests.
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

- **Overview** tab (the default view): findings that need review, commit activity over the latest 20 inspected commits, findings by group, and an About panel with revision, coverage, and warnings. Everything shown comes from the saved snapshot; no extra API calls. Snapshots saved before this tab existed show activity for the six commits they kept.
- **Issues & PRs** tab: loads the 30 most recently updated open issues and pull requests on request (1 request). Filter by type, search, sort by recent/most discussed/quietest, and flag items not updated in 90+ days. Expand an item for its description and load up to 10 comments (1 request each). All text renders as plain text; links are built from validated numbers, never copied from API responses.
- **Languages, people and releases** panel on Overview: language mix, top 8 contributors, and the latest release (3 requests, on request).
- **Copy Markdown summary** in the Report menu, with repository text escaped. Includes loaded issues.
- **Quota readout** in the top bar from GitHub's rate-limit headers.
## Scan contract

`src/scan.ts` owns the snapshot/finding types, URL trust boundary, API reads, and evidence mapping. `src/App.tsx` renders those records without executing source content. `src/useSoundscape.ts` owns opt-in Web Audio lifecycle, volume envelopes, background suspension, and throttled cues. `src/reviews.ts` validates reports and notes and manages local autosave. `src/compare.ts` compares validated snapshots by finding ID and substantive evidence fields. React escapes repository text. Cached, bundled, and imported records pass structural and source-URL validation before display.

These on-demand reads are separate from the scan and never run automatically. A scan reads metadata, up to 20 recent commits, the first page of five branch names, up to four non-default tip commits, a recursive tree, and up to six source blobs. At most 14 API calls; no automatic retries. Once GitHub reports a rate limit, remaining reads stop without further network requests. Files are pinned to the latest inspected default-branch commit; branch evidence is pinned to each observed branch tip. API responses are not an atomic snapshot across endpoints.

The tree is capped at 2,000 non-symlink blobs. Source sampling prioritizes root `package.json`, then paths under `src/`, `lib/`, and `app/`, then other text paths. Paths within each group sort alphabetically. At most six files are sampled, each at most 64 KiB. Each sampled source contributes at most three TODO/FIXME findings. The root manifest reports dependency declarations, flagging broad or remote version strings without claiming vulnerabilities. Commit rooms show up to six of the 20 inspected commits. Scan size is intentionally bounded for free API use; no full-history, repository-wide TODO, dependency-vulnerability, missing-test, or secret audit is claimed.

Branch tip commits at least 90 days old receive a medium-confidence review suggestion. Age does not establish abandonment, branch creation date, or merge status. TODO markers are high-confidence observations of text, not confirmed bugs. An absent README is a medium-confidence observation limited to the available tree. Failure to read a tree never produces a missing-README finding. No findings does not imply a healthy repository.

Nonessential API failures become snapshot warnings. Metadata failure preserves the preceding UI snapshot. Cancellation preserves previous results. No private repositories, code execution, writes to GitHub, paid AI, or server-side processing.

## $0 tools and hosting

- React, Vite, Vitest, fast-check, and jsdom: MIT; TypeScript: Apache-2.0. Retain dependency license notices when distributing.
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
