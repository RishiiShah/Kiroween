import { describe, it, expect } from "vitest";
import fc from "fast-check";
import demoData from "../public/demo-snapshot.json";
import { commitDates, summarizeActivity, zoneCounts } from "../src/activity";
import { isSnapshot, type Snapshot } from "../src/scan";

const demo = demoData as Snapshot;
const now = "2026-11-20T00:00:00Z";

describe("activity summary", () => {
  it("handles no commits and a single instant", () => {
    expect(summarizeActivity([], now).total).toBe(0);
    const single = summarizeActivity(["2026-11-10T00:00:00Z"], now);
    expect(single.buckets).toEqual([1]);
    expect(single.latestAgeDays).toBe(10);
  });
  it("places every commit in exactly one bucket", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 2_000_000_000 }), {
          minLength: 1,
          maxLength: 20,
        }),
        (seconds) => {
          const dates = seconds.map((s) => new Date(s * 1000).toISOString());
          const result = summarizeActivity(dates, now);
          expect(result.buckets.reduce((a, b) => a + b, 0)).toBe(dates.length);
          expect(result.total).toBe(dates.length);
        },
      ),
    );
  });
  it("falls back to dates in commit findings for older snapshots", () => {
    expect(demo.commitDates).toBeUndefined();
    const dates = commitDates(demo);
    expect(dates.length).toBe(
      demo.findings.filter((f) => f.zone === "activity").length,
    );
    expect(Date.parse(dates[0])).toBeGreaterThanOrEqual(Date.parse(dates[dates.length - 1]));
  });
  it("counts findings per zone without losing any", () => {
    expect(zoneCounts(demo).reduce((sum, zone) => sum + zone.total, 0)).toBe(
      demo.findings.length,
    );
  });
  it("validates optional commit dates in snapshots", () => {
    expect(isSnapshot({ ...demo, commitDates: [demo.observedAt] })).toBe(true);
    expect(isSnapshot({ ...demo, commitDates: ["not a date"] })).toBe(false);
    expect(isSnapshot({ ...demo, commitDates: "x" })).toBe(false);
    expect(
      isSnapshot({ ...demo, commitDates: Array(21).fill(demo.observedAt) }),
    ).toBe(false);
  });
});
