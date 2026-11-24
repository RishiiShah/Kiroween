# Repository analysis requirements

## Intake and trust boundary
- Given a public GitHub repository (`owner/repo` or `https://github.com/owner/repo`), obtain a read-only, bounded snapshot. Reject unsafe protocols, credentials, extra paths, and unsupported hosts before any request. Refuse private repositories even when an optional token could read them.
- Every finding retains a unique identifier, category, source URL pinned to the inspected revision, confidence, observation time, explanation, and suggested action. Deterministic parsing preserves file and line ownership.
- Branch tips at least 90 days old invite review with medium confidence; never assert abandonment. TODO/FIXME markers are text observations; dependency declarations are manifest observations, never confirmed vulnerabilities. Sensitive file names are flagged without reading contents or claiming secrets.
- Preserve previous results on failure or cancellation. Label demo, cached, imported, and live data distinctly. Expose partial coverage; no findings never implies a healthy repository.

## Quota and caching
- Spend as little of GitHub's 60 requests/hour as possible: at most 8 REST calls per scan; source files from raw.githubusercontent.com; identical URLs for scan and commit graph so they share cache entries.
- Reuse successful GitHub responses for 45 minutes; never cache errors, rate limits, or "still computing" replies. Count only network requests as API requests and disclose reuse.
- Once GitHub reports the quota spent, send no further API requests until reset (remembered across reloads). Read the free `/rate_limit` endpoint for the meter. Background loads keep 10 requests in reserve and explain any pause.
- An optional personal token may be used for the current tab only: memory-only, never stored or exported, sent only to `api.github.com`.

## Experience
- A home page precedes the dashboard. The dashboard offers Overview, People, Commits (lane graph), Issues, Pull requests, Findings board, Analyst table, House map (file-tree floor plan), and Compare (two repositories side by side). Deep links (`#/dashboard?repo=…&view=…`) reopen a repository and view.
- Numbers that read better as plots are plotted (heatmap, timelines, histograms, donuts, ranked bars, treemap, butterfly comparison). Every chart has a text alternative.
- Thread bodies and comments render GitHub-flavored Markdown as React elements: no raw HTML, http(s) links only, images shown as links.
- Six themes with Halloween as default; theme-specific icon sets keep meaning constant. Motion is subtle, paced centrally, and disabled by system or manual reduced motion. Audio is opt-in only.
- Keyboard access throughout (command palette, J/K, Esc, focusable map rooms); WCAG 2.1 AA contrast in every theme, verified with axe.
- Revision-specific review notes, offline report import/export, same-repository snapshot comparison, Markdown summary, and print.
- Free tools only; no paid runtime, assets, database, analytics, or model service. Static hosting.
