# Poltergeist Commits

## Summary

**Category:** Costume Contest / Frankenstein  
**Concept:** Haunted-house visualization for repository history and engineering health.  
**Target:** Developers, maintainers, educators, open-source reviewers, hackathon judges.  
**MVP:** Scan a public repository, create a haunted map, and link findings to evidence.

## Problem

- Repository health metrics appear in disconnected dashboards.
- Large histories are difficult to explore quickly.
- Stale branches and security risks remain hidden in abstract tables.
- New maintainers cannot identify important areas quickly.
- Existing visualizations often sacrifice evidence for appearance.

## Primary User

Developer or reviewer needs quick repository understanding and actionable findings.

Example action:

> Enter a public repository URL and receive a visual map of stale work, recent activity, dependencies, and risks.

## Core Features

### Repository Intake
- Accept public GitHub repository URL.
- Verify repository URL format.
- Fetch accessible repository metadata.
- Cache a bounded analysis snapshot.
- Support bundled demo data.
- Clearly mark private or unavailable data.

### Haunted Map
- Map files and folders into rooms.
- Map commits into changing room states.
- Map stale branches into locked corridors.
- Map TODOs into minor spirits.
- Map security-related findings into major spirits.
- Map missing documentation into empty rooms.
- Connect visual nodes to underlying source.

### Repository Findings
- Recent activity.
- Stale branches.
- Large or frequent change areas.
- Missing tests.
- TODO and FIXME density.
- Dependency risk indicators.
- Documentation coverage.
- Secret-file or suspicious-config indicators.

### Evidence Panel
- Finding title.
- Plain-language explanation.
- Source file or configuration link.
- Confidence level.
- Last observed date.
- Recommended next step.

### Analyst View
- Data table.
- Filters.
- Sort controls.
- Source links.
- Toggle between themed and neutral display.

## Technical Requirements

### Repository Model

The model must define:

- Repository metadata.
- Commit summary.
- Branch summary.
- File nodes.
- Dependency nodes.
- Finding records.
- Evidence references.
- Confidence and source metadata.

### Mapping

- Every visual node has a source record.
- Mapping is deterministic for the same snapshot.
- Finding clusters preserve source ownership.
- Large repositories use bounded node counts.
- Uncertain findings use clear visual or text labels.

### GitHub API
- Handle rate limits.
- Show partial-result state.
- Retry only safe read operations.
- Do not request private repository scope beyond necessity.
- Never store GitHub tokens in source.

### Safety
- Read-only repository access.
- No automatic issue or pull-request creation.
- No claims about secrets unless validated.
- No execution of repository code.
- No display of private information.

### Accessibility
- Themed view provides a text alternative.
- Keyboard navigation for rooms and findings.
- Table view is available.
- Reduced-motion mode.
- Finding colors include text and icons.

## Kiro Usage

### Spec-Driven Development
- Document repository analysis pipeline.
- Document node and evidence mapping.
- Document GitHub API failure behavior.
- Document visible finding thresholds.

### Steering
- Require source links.
- Require confidence labels.
- Avoid unsupported security claims.
- Keep findings actionable.
- Prefer real evidence over invented metrics.

### Agent Hooks
- Refresh analysis after repository snapshot changes.
- Run evidence-link validation.
- Run node coverage checks.

### MCP
- Connect repository or GitHub resources during development.
- Keep runtime mapping independent when possible.

### Property-Based Testing
- Every visual node has at least one source reference.
- The same snapshot produces the same node mapping.
- Filtering cannot hide evidence links.
- Partial API responses cannot produce complete-health claims.
- Repository URL validation rejects unsafe protocols.
- No finding uses an unavailable source record.

## MVP Scope

### Included
- Public repository URL.
- Repository metadata.
- 2–3 haunted zones.
- Commit and branch findings.
- TODO or dependency findings.
- Source evidence panel.
- Analyst table.
- Demo repository fallback.

### Excluded
- Repository code execution.
- Secret verification.
- Automated fixes.
- Private repository support.
- Pull-request writing.
- Live event streaming.

## Demo

1. Enter a public repository URL.
2. Generate haunted-house map.
3. Open stale-branch corridor.
4. Select a spirit or suspicious room.
5. Inspect source evidence.
6. Toggle analyst view.
7. Explain a specific recommended action.

## Success Criteria

- Repository analysis completes within demo timeframe.
- Core visual nodes link to real sources.
- Findings remain understandable without theme styling.
- Partial failures remain explicit.
- Visitor identifies a real repository risk within 60 seconds.
