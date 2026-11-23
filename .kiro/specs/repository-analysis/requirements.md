# Repository analysis requirements

- Given a public HTTPS GitHub repository URL, obtain a read-only, bounded snapshot without authentication.
- Reject unsafe protocols, credentials, extra paths, and unsupported hosts before any request.
- Show three themed zones and a neutral table with category filters, text filtering, and sorting.
- Every finding must retain a unique identifier, category, source URL, confidence, observation time, explanation, and suggested action.
- Source evidence must reference the inspected revision; deterministic source parsing must preserve file and line ownership.
- Branch tip commits at least 90 days old invite review with medium confidence; never assert abandonment.
- TODO/FIXME markers identify unfinished text; dependency declarations identify manifest observations, never confirmed vulnerabilities.
- Preserve previous results on scan failure or cancellation. Label recorded demo and cached results distinctly.
- Stop subsequent network reads after rate limiting, and expose incomplete coverage.
- Retain one live snapshot locally, support explicit deletion, and export JSON without server storage.
- Support keyboard interaction, reduced motion, text alternatives, responsive layout, and safe text rendering.
- Keep default page focused on intake and findings; collapse secondary controls and open evidence on selection. Preserve subtle motion with a reduction toggle. Start audio only after opt-in, provide volume/mute, suspend background audio, and dispose its context on exit.
- Persist revision-specific review notes locally without silently replacing unreadable saved data. Support reviewed filters and validated offline reports; preserve existing notes during import conflicts.
- Use distinct, free, locally hosted display/interface/technical fonts with license notices and usable fallbacks.
- Compare only snapshots from the same repository/default branch. Label missing evidence as absent from the sample, not fixed. Preserve both versions' source links and keep baseline notes separate.
- Print the full current report with sources and local notes; omit screen controls and retain sampling caveats.
- Previous/next trace navigation must honor active filters and retain source ownership.
- Use free tools; require no paid runtime, assets, tokens, domain, database, or model service.
