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
