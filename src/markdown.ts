import type { Issue } from "./community";
import { ZONES, type Snapshot } from "./scan";

/** Neutralize text from repositories so it cannot form links, HTML, or headings. */
export const mdEscape = (value: string) =>
  value
    .replace(/\s+/g, " ")
    .trim()
    .replace(/([\\`*_{}\[\]()<>#+!|~])/g, "\\$1");

export function toMarkdown(snapshot: Snapshot, issues: Issue[] = []): string {
  const lines: string[] = [
    `# ${mdEscape(snapshot.repository)}: Poltergeist Commits summary`,
    "",
    `Observed ${snapshot.observedAt.slice(0, 10)} on branch ${mdEscape(snapshot.defaultBranch)}` +
      (snapshot.revision ? ` at ${snapshot.revision.slice(0, 7)}.` : "."),
    "This is a sampled read of public data, not a full code or security audit.",
    "",
  ];
  for (const zone of ZONES) {
    const items = snapshot.findings.filter((finding) => finding.zone === zone.id);
    if (!items.length) continue;
    lines.push(`## ${zone.name} (${items.length})`, "");
    for (const finding of items)
      lines.push(
        `- [${mdEscape(finding.title)}](<${finding.source}>) (${finding.confidence} confidence). ${mdEscape(finding.action)}`,
      );
    lines.push("");
  }
  if (issues.length) {
    lines.push(`## Open issues and pull requests (${issues.length} most recently updated)`, "");
    for (const issue of issues)
      lines.push(
        `- [#${issue.number} ${mdEscape(issue.title)}](<${issue.url}>) ${issue.kind === "pull" ? "pull request" : "issue"}, ${issue.comments} comments`,
      );
    lines.push("");
  }
  return lines.join("\n").trimEnd() + "\n";
}
