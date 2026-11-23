import type { Finding, Snapshot } from "./scan";

export type Comparison = {
  added: Finding[];
  missing: Finding[];
  changed: { before: Finding; after: Finding }[];
  unchanged: number;
};

export function compareSnapshots(
  current: Snapshot,
  baseline: Snapshot,
): Comparison {
  if (current.repository.toLowerCase() !== baseline.repository.toLowerCase())
    throw new Error("Choose a baseline from the same repository.");
  if (current.defaultBranch !== baseline.defaultBranch)
    throw new Error(
      "Baseline and current snapshot must inspect the same default branch.",
    );
  const previous = new Map(
    baseline.findings.map((finding) => [finding.id, finding]),
  );
  const present = new Set(current.findings.map((finding) => finding.id));
  const result: Comparison = {
    added: [],
    missing: [],
    changed: [],
    unchanged: 0,
  };
  const evidence = (finding: Finding) =>
    JSON.stringify([
      finding.zone,
      finding.title,
      finding.path,
      finding.explanation,
      finding.action,
      finding.confidence,
      finding.severity,
      finding.source,
    ]);
  for (const finding of current.findings) {
    const before = previous.get(finding.id);
    if (!before) result.added.push(finding);
    else if (evidence(before) !== evidence(finding))
      result.changed.push({ before, after: finding });
    else result.unchanged++;
  }
  result.missing = baseline.findings.filter(
    (finding) => !present.has(finding.id),
  );
  return result;
}
