---
inclusion: always
---
# Poltergeist Commits
- Keep runtime browser-only and free of paid APIs, assets, or services. Static hosting only.
- Never execute repository code or modify remote repositories. Never request a token by default; an optional personal token may be accepted only for the current tab, held in memory, never persisted or exported, and sent only to `https://api.github.com/`. Private repositories stay refused.
- Every finding must retain its source, observation date, confidence, and next step.
- Preserve bounded sampling and disclose partial coverage. Never imply a complete health or security assessment, and never present activity counts as judgements of people.
- Protect the shared 60 requests/hour quota: route GitHub reads through the response cache, keep scan and graph URLs identical, stop after a spent quota, and keep a reserve for scans in background loads.
- Render repository text as text; Markdown only through `RichText` (no raw HTML, http(s) links only, images as links). Build GitHub links from validated parts.
- Preserve keyboard access, text/table alternatives for every chart, reduced motion, and WCAG AA contrast in every theme (`npm run a11y`).
- Start audio only after explicit user interaction; preserve mute, volume, background suspension, and disposal. Avoid flashing effects.
- After changes to analysis, caching, or evidence mapping, run `npm test` and `npm run build`; for visual changes also run `npm run screenshots` and review the images.
- Do not commit, push, publish, or add paid dependencies without explicit user authorization.
