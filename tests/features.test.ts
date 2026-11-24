import { describe, it, expect, vi, afterEach } from "vitest";
import demoData from "../public/demo-snapshot.json";
import type { Snapshot } from "../src/scan";
import { buildRooms, findingPath } from "../src/House";
import { metricsFor } from "../src/RepoCompare";
import { isValidToken, setToken, authFor, hasToken } from "../src/token";
import { fetchIssues } from "../src/community";

const demo = demoData as Snapshot;
afterEach(() => {
  vi.unstubAllGlobals();
  setToken(null);
});

describe("house map rooms", () => {
  it("counts every file exactly once and places file findings in their room", () => {
    const rooms = buildRooms(demo.files, demo.findings);
    const count = (room: ReturnType<typeof buildRooms>): number =>
      room.files + room.children.reduce((sum, child) => sum + count(child), 0);
    expect(count(rooms)).toBe(demo.files.length);
    const placed = (room: ReturnType<typeof buildRooms>): number =>
      room.findings.length + room.children.reduce((sum, child) => sum + placed(child), 0);
    expect(placed(rooms)).toBe(demo.findings.filter((f) => findingPath(f) !== null).length);
  });
  it("keeps commits and branches outside the house", () => {
    for (const finding of demo.findings.filter((f) => f.zone !== "unfinished")) expect(findingPath(finding)).toBeNull();
    expect(findingPath({ ...demo.findings[0], zone: "unfinished", path: "lib/a.js:12" })).toBe("lib/a.js");
  });
});

describe("repository comparison", () => {
  it("reports plain numbers and unknowns without inventing values", () => {
    const metrics = metricsFor({ ...demo, meta: undefined });
    expect(metrics.findings).toBe(demo.findings.length);
    expect(metrics.forks).toBeNull();
    expect(metrics.quietBranches).toBeGreaterThanOrEqual(0);
  });
});

describe("optional token", () => {
  it("accepts only GitHub token formats and scopes the header to the REST API", () => {
    expect(isValidToken("hello")).toBe(false);
    expect(isValidToken("ghp_" + "x".repeat(36))).toBe(true);
    expect(isValidToken("github_pat_" + "x".repeat(40))).toBe(true);
    setToken("ghp_" + "x".repeat(36));
    expect(hasToken()).toBe(true);
    expect(authFor("https://api.github.com/repos/o/r")).toEqual({ Authorization: "Bearer ghp_" + "x".repeat(36) });
    expect(authFor("https://raw.githubusercontent.com/o/r/x")).toEqual({});
    expect(authFor("https://evil.example/api.github.com/")).toEqual({});
    setToken(null);
    expect(authFor("https://api.github.com/repos/o/r")).toEqual({});
  });
});

describe("thread pagination", () => {
  it("keeps page 1 on the cacheable URL and adds page numbers after", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string) => (urls.push(input), new Response("[]"))));
    await fetchIssues("o/r", undefined, 1);
    await fetchIssues("o/r", undefined, 2);
    expect(urls[0]).toMatch(/per_page=100$/);
    expect(urls[1]).toMatch(/per_page=100&page=2$/);
  });
});
