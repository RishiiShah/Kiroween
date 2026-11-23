import { describe, expect, it } from "vitest";
import demoData from "../public/demo-snapshot.json";
import type { Snapshot } from "../src/scan";
import {
  isReviews,
  parseReport,
  reportReviews,
  reviewKey,
  REVIEW_LIMIT,
} from "../src/reviews";
const demo = demoData as Snapshot;
const key = reviewKey(demo.repository, demo.findings[0]);
describe("local investigation data", () => {
  it("pins reviews to repository and evidence version", () => {
    expect(reviewKey("other/repo", demo.findings[0])).not.toBe(key);
    expect(
      reviewKey(demo.repository, {
        ...demo.findings[0],
        source: `${demo.findings[0].source}#different`,
      }),
    ).not.toBe(key);
    expect(
      isReviews({ [key]: { note: "Review with maintainer", reviewed: true } }),
    ).toBe(true);
  });
  it("rejects malformed, oversized, and unsafe notes without coercion", () => {
    expect(isReviews([])).toBe(false);
    expect(
      isReviews({ [key]: { note: "a".repeat(2001), reviewed: true } }),
    ).toBe(false);
    expect(isReviews({ [key]: { note: "context", reviewed: "true" } })).toBe(
      false,
    );
    expect(isReviews({ __proto__: { note: "", reviewed: false } })).toBe(false);
    expect(
      isReviews(JSON.parse('{"__proto__":{"note":"x","reviewed":true}}')),
    ).toBe(false);
    const badKey = reviewKey(demo.repository, {
      ...demo.findings[0],
      source: "javascript:alert(1)",
    });
    expect(isReviews({ [badKey]: { note: "", reviewed: false } })).toBe(false);
    const tooMany = Object.fromEntries(
      Array.from({ length: REVIEW_LIMIT + 1 }, (_, i) => [
        reviewKey(demo.repository, { ...demo.findings[0], id: `${i}` }),
        { note: "", reviewed: false },
      ]),
    );
    expect(isReviews(tooMany)).toBe(false);
  });
  it("round trips compatible reports and exports only current evidence notes", () => {
    const reviews = {
      [key]: { note: "Checked upstream", reviewed: true },
      [reviewKey("other/repo", demo.findings[0])]: {
        note: "Unrelated",
        reviewed: false,
      },
    };
    const saved = reportReviews(demo, reviews);
    expect(Object.keys(saved)).toEqual([key]);
    expect(
      parseReport(JSON.stringify({ ...demo, localReviews: saved })).reviews,
    ).toEqual(saved);
    expect(parseReport(JSON.stringify(demo)).reviews).toEqual({});
  });
  it("rejects invalid snapshots, foreign review ownership, and oversized input", () => {
    expect(() => parseReport("{broken")).toThrow();
    expect(() => parseReport(JSON.stringify({ ...demo, version: 99 }))).toThrow(
      "valid Poltergeist snapshot",
    );
    expect(() => parseReport(" ".repeat(2 * 1024 * 1024 + 1))).toThrow("2 MiB");
    expect(() =>
      parseReport(JSON.stringify({ ...demo, localReviews: { invalid: true } })),
    ).toThrow("invalid review notes");
    const foreign = reviewKey("other/repo", {
      ...demo.findings[0],
      source: "https://github.com/other/repo/commit/abc",
    });
    expect(() =>
      parseReport(
        JSON.stringify({
          ...demo,
          localReviews: { [foreign]: { note: "", reviewed: true } },
        }),
      ),
    ).toThrow("do not belong");
  });
});
