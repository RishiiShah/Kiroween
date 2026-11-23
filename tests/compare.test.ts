import { describe, expect, it } from "vitest";
import fc from "fast-check";
import demoData from "../public/demo-snapshot.json";
import type { Snapshot } from "../src/scan";
import { compareSnapshots } from "../src/compare";
const demo = demoData as Snapshot;
describe("sampled snapshot comparison", () => {
  it("keeps identical evidence unchanged despite different capture timestamps", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2000000000 }), (seconds) => {
        const later = structuredClone(demo);
        later.observedAt = new Date(seconds * 1000).toISOString();
        later.findings = later.findings.map((finding) => ({
          ...finding,
          observedAt: later.observedAt,
        }));
        expect(compareSnapshots(later, demo)).toEqual({
          added: [],
          changed: [],
          missing: [],
          unchanged: demo.findings.length,
        });
      }),
    );
  });
  it("separates new, changed, and missing observations without implying resolution", () => {
    const baseline = structuredClone(demo);
    baseline.findings[0].title = "Previous observation";
    baseline.findings.pop();
    const old = {
      ...baseline.findings[0],
      id: "baseline-only",
      title: "Only in baseline",
    };
    baseline.findings.push(old);
    const result = compareSnapshots(demo, baseline);
    expect(result.added.map((finding) => finding.id)).toEqual([
      demo.findings.at(-1)!.id,
    ]);
    expect(result.changed).toEqual([
      { before: baseline.findings[0], after: demo.findings[0] },
    ]);
    expect(result.missing).toEqual([old]);
    expect(result.unchanged).toBe(demo.findings.length - 2);
  });
  it("detects changed source revisions and confidence", () => {
    const baseline = structuredClone(demo);
    baseline.findings[0].source += "#previous";
    baseline.findings[1].confidence = "Medium";
    expect(compareSnapshots(demo, baseline).changed).toHaveLength(2);
  });
  it("rejects unrelated repositories and different default branches", () => {
    expect(() =>
      compareSnapshots(demo, { ...demo, repository: "other/repository" }),
    ).toThrow("same repository");
    expect(() =>
      compareSnapshots(demo, { ...demo, defaultBranch: "different" }),
    ).toThrow("same default branch");
    expect(
      compareSnapshots(demo, {
        ...demo,
        repository: demo.repository.toUpperCase(),
      }).unchanged,
    ).toBe(demo.findings.length);
  });
  it("preserves missing evidence for empty partial samples", () => {
    const empty = { ...demo, findings: [], warnings: ["Source reads failed"] };
    const result = compareSnapshots(empty, demo);
    expect(result.missing).toEqual(demo.findings);
    expect(result.changed).toEqual([]);
  });
});
