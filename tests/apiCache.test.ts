// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  API_CACHE_TTL,
  cachedFetch,
  clearApiCache,
  isCacheHit,
  purge,
  savedAt,
  setCacheClock,
} from "../src/apiCache";
import { scanRepository, LIMITS } from "../src/scan";
import { getQuota, resetQuotaForTests } from "../src/quota";

afterEach(() => {
  vi.unstubAllGlobals();
  resetQuotaForTests();
});
const url = "https://api.github.com/repos/o/r/issues?state=open";
function stub(status = 200, body = "[1]", headers: Record<string, string> = {}) {
  const fn = vi.fn(async () => new Response(body, { status, headers }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("GitHub response cache", () => {
  it("answers repeat requests locally within the TTL, then refetches", async () => {
    let clock = 1_000_000;
    setCacheClock(() => clock);
    const fn = stub(200, "[1]", { link: '<x>; rel="next"', "x-ratelimit-remaining": "50", "x-ratelimit-limit": "60" });
    const first = await cachedFetch(url);
    expect(isCacheHit(first)).toBe(false);
    await new Promise((r) => setTimeout(r));
    clock += API_CACHE_TTL - 1;
    const second = await cachedFetch(url);
    expect(isCacheHit(second)).toBe(true);
    expect(await second.json()).toEqual([1]);
    expect(second.headers.get("link")).toContain('rel="next"');
    expect(second.headers.get("x-ratelimit-remaining")).toBeNull();
    expect(savedAt(second)).toBe(1_000_000);
    expect(fn).toHaveBeenCalledTimes(1);
    clock += 2;
    expect(isCacheHit(await cachedFetch(url))).toBe(false);
    expect(fn).toHaveBeenCalledTimes(2);
  });
  it("never stores errors, rate limits, or 'still computing' replies", async () => {
    for (const status of [202, 403, 404, 429, 500]) {
      await clearApiCache();
      const fn = stub(status, "{}");
      await cachedFetch(url);
      await new Promise((r) => setTimeout(r));
      await cachedFetch(url);
      expect(fn).toHaveBeenCalledTimes(2);
    }
  });
  it("purges by prefix for explicit refreshes", async () => {
    const fn = stub();
    await cachedFetch(url);
    await cachedFetch("https://api.github.com/repos/o/r/languages");
    await new Promise((r) => setTimeout(r));
    await purge(["https://api.github.com/repos/o/r/issues?"]);
    await cachedFetch(url);
    await cachedFetch("https://api.github.com/repos/o/r/languages");
    expect(fn).toHaveBeenCalledTimes(3);
  });
  it("re-scanning the same repository within the TTL makes no network requests", async () => {
    const revision = "a".repeat(40);
    const data: Record<string, unknown> = {
      "": { private: false, default_branch: "main", stargazers_count: 1 },
      [`/commits?sha=main&per_page=40`]: [
        { sha: revision, commit: { message: "m", committer: { date: "2026-11-01T00:00:00Z" } } },
      ],
      [`/branches?per_page=${LIMITS.branches + 1}`]: [{ name: "main", commit: { sha: revision } }],
      [`/git/trees/${revision}?recursive=1`]: { truncated: false, tree: [] },
    };
    const fn = vi.fn(async (input: string) => {
      const value = data[input.replace("https://api.github.com/repos/o/r", "")];
      return new Response(JSON.stringify(value ?? {}), {
        status: value === undefined ? 404 : 200,
        headers: { "x-ratelimit-remaining": "40", "x-ratelimit-limit": "60" },
      });
    });
    vi.stubGlobal("fetch", fn);
    const first = await scanRepository("https://github.com/o/r");
    const calls = fn.mock.calls.length;
    expect(first.requests).toBe(calls);
    await new Promise((r) => setTimeout(r));
    resetQuotaForTests();
    const second = await scanRepository("https://github.com/o/r");
    expect(fn.mock.calls.length).toBe(calls);
    expect(second.requests).toBe(0);
    expect(second.warnings.join(" ")).toContain(`${calls} of ${calls} GitHub responses were reused`);
    expect(getQuota()).toBeNull();
  });
});

import { fetchGraph } from "../src/history";
import { recordQuota } from "../src/quota";

describe("quota protection", () => {
  it("stops calling the API once GitHub reports the quota spent, until reset", async () => {
    const reset = Math.floor(Date.now() / 1000) + 600;
    const fn = stub(403, "{}", { "x-ratelimit-remaining": "0", "x-ratelimit-limit": "60", "x-ratelimit-reset": String(reset) });
    const first = await cachedFetch(url);
    recordQuota(first.headers);
    expect(fn).toHaveBeenCalledTimes(1);
    const second = await cachedFetch("https://api.github.com/repos/o/r/languages");
    expect(second.status).toBe(403);
    expect(second.headers.get("x-ratelimit-reset")).toBe(String(reset));
    expect(fn).toHaveBeenCalledTimes(1);
    await cachedFetch("https://raw.githubusercontent.com/o/r/abc/README.md");
    expect(fn).toHaveBeenCalledTimes(2);
    expect(JSON.parse(localStorage.getItem("poltergeist.quota.v1")!).remaining).toBe(0);
  });
  it("restores a spent quota after reload, and forgets it once the reset time passes", async () => {
    localStorage.setItem("poltergeist.quota.v1", JSON.stringify({ remaining: 0, limit: 60, reset: Math.floor(Date.now() / 1000) + 300 }));
    vi.resetModules();
    const quota = await import("../src/quota");
    expect(quota.quotaBlocked()?.remaining).toBe(0);
    localStorage.setItem("poltergeist.quota.v1", JSON.stringify({ remaining: 0, limit: 60, reset: Math.floor(Date.now() / 1000) - 5 }));
    vi.resetModules();
    const later = await import("../src/quota");
    expect(later.quotaBlocked()).toBeNull();
  });
  it("lets the commit graph reuse the scan's history and branch reads", async () => {
    const revision = "b".repeat(40);
    const side = "c".repeat(40);
    const commit = (sha: string, date: string) => ({ sha, parents: [], commit: { message: "m", committer: { date } } });
    const data: Record<string, unknown> = {
      "": { private: false, default_branch: "main", stargazers_count: 1 },
      [`/commits?sha=main&per_page=40`]: [commit(revision, "2026-11-01T00:00:00Z")],
      [`/branches?per_page=${LIMITS.branches + 1}`]: [
        { name: "main", commit: { sha: revision } },
        { name: "side", commit: { sha: side } },
      ],
      [`/commits?sha=${side}&per_page=15`]: [commit(side, "2026-01-01T00:00:00Z")],
      [`/git/trees/${revision}?recursive=1`]: { truncated: false, tree: [] },
    };
    const fn = vi.fn(async (input: string) => {
      const value = data[input.replace("https://api.github.com/repos/o/r", "")];
      return new Response(JSON.stringify(value ?? {}), { status: value === undefined ? 404 : 200 });
    });
    vi.stubGlobal("fetch", fn);
    await scanRepository("https://github.com/o/r");
    await new Promise((r) => setTimeout(r));
    const before = fn.mock.calls.length;
    const graph = await fetchGraph("o/r", "main", [{ name: "side", tip: side }]);
    expect(fn.mock.calls.length).toBe(before);
    expect(graph.commits.map((c) => c.sha).sort()).toEqual([revision, side].sort());
  });
});
