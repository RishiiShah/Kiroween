# Repository analysis design

`src/scan.ts` defines the snapshot model, validation, bounded GitHub pipeline, and evidence mapping. `src/App.tsx` renders the snapshot; local state controls category, query, sort order, selected evidence, theme, and view. Settings and advanced filters use collapsed native disclosures. Source evidence opens in a native modal drawer instead of occupying permanent page space.

`src/reviews.ts` keys annotations by repository, finding ID, and source URL. Writes are debounced and flushed on page hide/unmount. Corrupt stored data remains untouched. Offline report validation reuses snapshot validation, checks note ownership, and enforces size limits. Existing local notes win merge conflicts; import capacity errors preserve the current investigation.

`src/compare.ts` compares finding IDs and substantive observation fields; observation timestamps do not create changes. Baselines reuse validated report intake and must match repository and default branch. Added, changed, and missing sample observations remain separate; absence never proves resolution. Selecting another current snapshot clears comparison state. Stale asynchronous file reads are rejected.

Typography uses locally hosted Fraunces display faces, Space Grotesk interface text, and IBM Plex Mono technical labels. WOFF2 assets, license notices, and provenance are delivered in `public/fonts`. Print CSS reveals a dedicated source-linked report and hides screen tools; native browser printing handles PDF output without another dependency.

Pipeline: validated URL → public metadata → recent commits → branch tips → revision-pinned tree → sampled text blobs → typed findings. At most 14 reads; each request has a 15-second timeout and cancellation signal. Optional failures become coverage warnings; essential metadata failures leave the prior snapshot intact. No code execution or remote writes.

Sampling and visible thresholds are documented in README. Records carry the data behind each visual node; the analyst table preserves source links independently of presentation. Activity findings refer to commit SHAs; source findings refer to the inspected default-branch revision; branch findings refer to observed tip commits. The same input text and revision yield the same TODO identifiers and source lines.

Local storage contains one validated live snapshot. Bundled recorded data passes the same validation and loads without GitHub access. Demo and live snapshots are never silently substituted. React renders untrusted strings as text. The browser connects directly to GitHub without credentials.

Property-based tests cover URL boundaries and deterministic evidence mapping. Mocked API tests cover limits, partial data, truncation, malformed source, cancellation, and rate limiting. DOM tests exercise explorer actions and unsafe text. The Kiro shell hook runs local tests after relevant file changes without invoking a model.
