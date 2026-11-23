import { ZONES, type Snapshot, type Zone } from "./scan";

const DAY = 86400000;

/** Commit timestamps, newest first. Older snapshots only keep the dates inside the commit findings. */
export function commitDates(snapshot: Snapshot): string[] {
  const dates =
    snapshot.commitDates ??
    snapshot.findings
      .filter((finding) => finding.zone === "activity")
      .map((finding) => finding.explanation.match(/^Commit recorded (\S+?)\./)?.[1])
      .filter((value): value is string => !!value);
  return dates
    .filter((value) => Number.isFinite(Date.parse(value)))
    .sort((a, b) => Date.parse(b) - Date.parse(a));
}

export type ActivitySummary = {
  total: number;
  buckets: number[];
  first: string | null;
  last: string | null;
  spanDays: number;
  latestAgeDays: number | null;
};

export function summarizeActivity(
  dates: string[],
  now: string,
  bucketCount = 12,
): ActivitySummary {
  const times = dates.map((value) => Date.parse(value)).sort((a, b) => a - b);
  if (!times.length)
    return {
      total: 0,
      buckets: [],
      first: null,
      last: null,
      spanDays: 0,
      latestAgeDays: null,
    };
  const start = times[0];
  const end = times[times.length - 1];
  const span = end - start;
  const buckets = new Array(span === 0 ? 1 : bucketCount).fill(0);
  for (const time of times) {
    const index =
      span === 0
        ? 0
        : Math.min(buckets.length - 1, Math.floor(((time - start) / span) * buckets.length));
    buckets[index]++;
  }
  return {
    total: times.length,
    buckets,
    first: new Date(start).toISOString(),
    last: new Date(end).toISOString(),
    spanDays: Math.round(span / DAY),
    latestAgeDays: Math.max(0, Math.floor((Date.parse(now) - end) / DAY)),
  };
}

export function zoneCounts(snapshot: Snapshot) {
  return ZONES.map((zone) => {
    const items = snapshot.findings.filter((finding) => finding.zone === zone.id);
    return {
      id: zone.id as Zone,
      name: zone.name,
      subtitle: zone.subtitle,
      total: items.length,
      review: items.filter((finding) => finding.severity === "review").length,
    };
  });
}

export type BranchAge = { id: string; name: string; days: number };

/** Branch tip ages come from the scan's own explanation text ("Tip commit is N days old"). */
export function branchAges(snapshot: Snapshot): BranchAge[] {
  return snapshot.findings
    .filter((finding) => finding.zone === "branches")
    .map((finding) => {
      const match = finding.explanation.match(/Tip commit is (\d+) days? old/);
      return match ? { id: finding.id, name: finding.path, days: Number(match[1]) } : null;
    })
    .filter((item): item is BranchAge => item !== null)
    .sort((a, b) => b.days - a.days || a.name.localeCompare(b.name));
}

export const AGE_BUCKETS = [
  { label: "< 1 wk", max: 7 },
  { label: "1–4 wk", max: 30 },
  { label: "1–3 mo", max: 90 },
  { label: "3–12 mo", max: 365 },
  { label: "1 yr +", max: Infinity },
] as const;

export type AgeBucket = { label: string; issue: number; pull: number; quiet: boolean };

/** Counts open threads by time since their last update. Buckets at or past 90 days are "quiet". */
export function threadAgeBuckets(
  items: { kind: "issue" | "pull"; updatedAt: string }[],
  now: string,
): AgeBucket[] {
  const buckets = AGE_BUCKETS.map((bucket, index) => ({
    label: bucket.label,
    issue: 0,
    pull: 0,
    quiet: index >= 3,
  }));
  for (const item of items) {
    const days = Math.max(0, (Date.parse(now) - Date.parse(item.updatedAt)) / DAY);
    if (!Number.isFinite(days)) continue;
    const index = AGE_BUCKETS.findIndex((bucket) => days < bucket.max);
    buckets[index === -1 ? buckets.length - 1 : index][item.kind]++;
  }
  return buckets;
}
