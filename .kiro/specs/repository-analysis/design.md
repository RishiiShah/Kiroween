# Repository analysis design

## Data flow
`src/scan.ts` validates input, then reads metadata → default-branch history (`/commits?sha=<branch>&per_page=40`, analysis uses 20) → branch list → up to four branch histories (`/commits?sha=<tip>&per_page=15`, tip date from the first item) → revision-pinned tree → up to six sampled files from raw.githubusercontent.com. At most 8 REST calls; 15 s timeouts; cancellation. Findings, repository facts (`meta`), and commit authors (`commits`) are optional, validated snapshot fields so older reports still load.

`src/apiCache.ts` sits in front of every GitHub read: 45-minute TTL, IndexedDB with a memory layer, 200-only storage, prefix purge for explicit refresh, and a local 403 answer while `src/quota.ts` reports the quota spent (persisted until reset; refreshed from the free `/rate_limit`). `src/token.ts` holds an optional token in memory and adds `Authorization` only for `https://api.github.com/` URLs.

`src/useCommunity.ts` owns per-repository community reads (threads with pagination, details, comments, PR reviews, commit graph, statistics, commit files). Background loads are budget-checked (`AUTO_RESERVE = 10`, counting only uncached URLs); paused loads carry an explanatory note.

## Presentation
`src/App.tsx` is the shell: hash routes (`#/` home, `#/dashboard?…` deep links), sidebar navigation, header, evidence pane, menus with outside-click/Escape dismissal, and the lazily loaded command palette. Views: `Overview`, `People`, `Commits` (lane layout from `src/history.ts`), `Issues` (also pull requests), findings board/table, `House` (d3-hierarchy treemap of the file tree; file findings placed in rooms), and `RepoCompare` (metrics + butterfly bars).

Charts in `src/charts.tsx` are SVG built with d3-scale/shape/array; colors come from CSS variables so every theme applies. `src/RichText.tsx` renders Markdown via react-markdown with HTML skipped and URLs restricted to http(s). `src/ui.tsx` maps semantic icon names to Phosphor glyphs per theme, defines the custom logo, and centralizes motion pace (`t()`); motion features load through `LazyMotion`.

## Safety
React renders all repository text as text. Links to GitHub objects are built from validated numbers, shas, and logins. Avatars use validated numeric ids with no referrer. No code execution, no writes to GitHub, no server.

## Verification
Vitest + fast-check cover URL boundaries, deterministic mapping, scan bounds, cache TTL/purge/blocking, quota persistence, graph layout properties (every commit once, children before parents, determinism), Markdown safety, token scoping, deep links, house-map placement, and UI flows. Playwright scripts capture screenshots (`npm run screenshots`) and run axe-core across five themes and ten screens (`npm run a11y`), replaying recorded GitHub responses so QA costs no quota.
