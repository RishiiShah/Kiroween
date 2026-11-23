import { describe, it, expect, vi, afterEach } from "vitest";
import fc from "fast-check";
import demoData from "../public/demo-snapshot.json";
import {
  ago,
  clip,
  COMMUNITY_LIMITS,
  fetchComments,
  fetchDetails,
  fetchIssues,
  isQuiet,
  parseContributors,
  parseIssues,
  parseLanguages,
} from "../src/community";
import { toMarkdown, mdEscape } from "../src/markdown";
import { getQuota, resetQuotaForTests } from "../src/quota";
import type { Snapshot } from "../src/scan";

const repo = "owner/manor";
const raw = (over: Record<string, unknown> = {}) => ({
  number: 7,
  title: "Door sticks",
  html_url: "https://evil.example/phish",
  user: { login: "ghostly" },
  comments: 2,
  labels: [{ name: "bug", color: "red; background:url(x)" }, "help wanted"],
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-02-01T00:00:00Z",
  body: "It <script>alert(1)</script> sticks",
  ...over,
});
afterEach(() => {
  vi.unstubAllGlobals();
  resetQuotaForTests();
});

describe("issue parsing", () => {
  it("builds links itself, ignores API urls and label colors, and detects PRs", () => {
    const [issue, pull] = parseIssues(
      [raw(), raw({ number: 8, pull_request: {}, draft: true })],
      repo,
    );
    expect(issue.url).toBe("https://github.com/owner/manor/issues/7");
    expect(pull.url).toBe("https://github.com/owner/manor/pull/8");
    expect(pull.kind).toBe("pull");
    expect(pull.draft).toBe(true);
    expect(issue.labels).toEqual(["bug", "help wanted"]);
    expect(JSON.stringify(issue)).not.toContain("evil.example");
  });
  it("skips malformed items and rejects non-lists", () => {
    expect(
      parseIssues(
        [null, 3, raw({ number: -1 }), raw({ title: 4 }), raw({ updated_at: "x" }), raw()],
        repo,
      ),
    ).toHaveLength(1);
    expect(() => parseIssues({}, repo)).toThrow();
  });
  it("bounds counts and text, and tolerates deleted users", () => {
    const many = Array.from({ length: 150 }, (_, i) =>
      raw({ number: i + 1, body: "x".repeat(5000), user: null }),
    );
    const result = parseIssues(many, repo);
    expect(result).toHaveLength(COMMUNITY_LIMITS.issues);
    expect(result[0].excerpt.length).toBeLessThanOrEqual(COMMUNITY_LIMITS.excerpt + 1);
    expect(result[0].author).toBe("ghost");
  });
  it("clips any text to its bound", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 3000 }), (text) => {
        expect(clip(text, 100).length).toBeLessThanOrEqual(101);
      }),
    );
  });
});

describe("relative dates", () => {
  const now = "2026-11-20T00:00:00Z";
  it("describes age and flags quiet items", () => {
    expect(ago(now, now)).toBe("today");
    expect(ago("2026-11-19T00:00:00Z", now)).toBe("1 day ago");
    expect(ago("2026-01-20T00:00:00Z", now)).toBe("10 months ago");
    expect(isQuiet(parseIssues([raw({ updated_at: "2026-01-01T00:00:00Z" })], repo)[0], now)).toBe(true);
    expect(isQuiet(parseIssues([raw({ updated_at: "2026-11-01T00:00:00Z" })], repo)[0], now)).toBe(false);
  });
});

function stub(routes: Record<string, () => Response>) {
  const fn = vi.fn(async (input: string) => {
    const path = input.replace(`https://api.github.com/repos/${repo}`, "");
    const route = Object.entries(routes).find(([key]) => path.startsWith(key));
    return route ? route[1]() : new Response("{}", { status: 404 });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("GitHub reads", () => {
  it("fetches one page of issues, records quota, and sends no credentials", async () => {
    const fn = stub({
      "/issues?": () =>
        new Response(JSON.stringify([raw()]), {
          headers: { "x-ratelimit-remaining": "41", "x-ratelimit-limit": "60", link: '<x>; rel="next"' },
        }),
    });
    const result = await fetchIssues(repo);
    expect(result.items).toHaveLength(1);
    expect(result.more).toBe(true);
    expect(getQuota()).toMatchObject({ remaining: 41, limit: 60 });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0][1]).toMatchObject({ credentials: "omit" });
  });
  it("explains rate limits and rejects invalid comment targets before any request", async () => {
    const fn = stub({ "/issues?": () => new Response("{}", { status: 403, headers: { "x-ratelimit-reset": "1893456000" } }) });
    await expect(fetchIssues(repo)).rejects.toThrow(/limited this request/);
    await expect(fetchComments(repo, 0)).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it("loads comments with a bounded request", async () => {
    const fn = stub({
      "/issues/7/comments": () =>
        new Response(JSON.stringify([{ id: 1, user: { login: "a" }, created_at: "2026-01-02T00:00:00Z", body: "hi" }])),
    });
    const result = await fetchComments(repo, 7);
    expect(result.items[0].excerpt).toBe("hi");
    expect(String(fn.mock.calls[0][0])).toContain(`per_page=${COMMUNITY_LIMITS.comments}`);
  });
  it("keeps partial details and treats a missing release as normal", async () => {
    stub({
      "/languages": () => new Response(JSON.stringify({ TypeScript: 900, CSS: 100 })),
      "/contributors": () => new Response("{}", { status: 500 }),
      "/releases/latest": () => new Response("{}", { status: 404 }),
    });
    const details = await fetchDetails(repo);
    expect(details.languages.map((l) => l.name)).toEqual(["TypeScript", "CSS"]);
    expect(details.release).toBeNull();
    expect(details.warnings).toHaveLength(1);
    expect(details.warnings[0]).toMatch(/^Contributors/);
  });
  it("fails when every detail read fails", async () => {
    stub({});
    stub({ "/languages": () => new Response("{}", { status: 500 }), "/contributors": () => new Response("{}", { status: 500 }), "/releases": () => new Response("{}", { status: 500 }), "/stats": () => new Response("{}", { status: 500 }) });
    await expect(fetchDetails(repo)).rejects.toThrow();
  });
  it("groups small languages and builds contributor links itself", () => {
    const many = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`L${i}`, 100 - i]));
    const langs = parseLanguages(many);
    expect(langs).toHaveLength(COMMUNITY_LIMITS.languages + 1);
    expect(langs.at(-1)?.name).toBe("Other");
    const [person] = parseContributors([
      { login: "octo", contributions: 5, html_url: "https://evil.example" },
      { login: "../bad", contributions: 1 },
    ]);
    expect(person.url).toBe("https://github.com/octo");
    expect(parseContributors([{ login: "../bad", contributions: 1 }])).toEqual([]);
  });
});

describe("markdown summary", () => {
  it("escapes repository text so it cannot inject links or headings", () => {
    expect(mdEscape("[click](http://x) <b>\n# hi")).not.toMatch(/(?<!\\)[\[\]<>]/);
    const demo = demoData as Snapshot;
    const tricky: Snapshot = {
      ...demo,
      findings: [{ ...demo.findings[0], title: "[pwn](javascript:alert(1))" }],
    };
    const text = toMarkdown(tricky);
    expect(text).toContain("\\[pwn\\]\\(javascript:alert\\(1\\)\\)");
    expect(text).toContain(`(<${demo.findings[0].source}>)`);
    expect(text).toContain("not a full code or security audit");
  });
  it("lists every finding", () => {
    const demo = demoData as Snapshot;
    const text = toMarkdown(demo);
    for (const finding of demo.findings) expect(text).toContain(finding.source);
  });
});

import { avatarUrl, fetchPullDetails, parseReleases, parseWeeks } from "../src/community";
describe("people and project history", () => {
  it("reads associations, assignees, and reactions from the same issues request", () => {
    const [issue] = parseIssues(
      [
        raw({
          author_association: "FIRST_TIME_CONTRIBUTOR",
          assignees: [{ login: "a", id: 1 }, { login: "../x", id: 2 }],
          reactions: { total_count: 5 },
          user: { login: "new", id: 42 },
        }),
      ],
      repo,
    );
    expect(issue.association).toBe("FIRST_TIME_CONTRIBUTOR");
    expect(issue.assignees).toEqual([{ login: "a", id: 1 }]);
    expect(issue.reactions).toBe(5);
    expect(issue.authorId).toBe(42);
    expect(parseIssues([raw({ author_association: "<script>" })], repo)[0].association).toBe("NONE");
  });
  it("builds avatar URLs only from positive integer ids", () => {
    expect(avatarUrl(42)).toBe("https://avatars.githubusercontent.com/u/42?s=64&v=4");
    expect(avatarUrl(null)).toBeNull();
    expect(avatarUrl(-1)).toBeNull();
    expect(avatarUrl(1.5)).toBeNull();
  });
  it("keeps published releases and 52 weeks of activity", () => {
    const releases = parseReleases(
      [
        { tag_name: "v2", published_at: "2026-10-01T00:00:00Z" },
        { tag_name: "v2-rc", published_at: "2026-09-01T00:00:00Z", prerelease: true },
        { tag_name: "draft", draft: true, published_at: "2026-08-01T00:00:00Z" },
        { tag_name: "undated" },
      ],
      repo,
    );
    expect(releases.map((r) => r.tag)).toEqual(["v2", "v2-rc"]);
    expect(releases[1].prerelease).toBe(true);
    const weeks = parseWeeks(
      Array.from({ length: 60 }, (_, i) => ({ week: 1700000000 + i * 604800, days: [1, 0, 0, 0, 0, 0, 2], total: 3 })),
    );
    expect(weeks).toHaveLength(52);
    expect(weeks[0].total).toBe(3);
    expect(parseWeeks([{ week: 1, days: [1] }])).toEqual([]);
  });
  it("treats GitHub's 202 'computing' reply as pending weekly stats", async () => {
    stub({
      "/languages": () => new Response("{}"),
      "/contributors": () => new Response("[]"),
      "/releases": () => new Response("[]"),
      "/stats/commit_activity": () => new Response(null, { status: 202 }),
    });
    const details = await fetchDetails(repo);
    expect(details.weeks).toBeNull();
    expect(details.weeksPending).toBe(true);
  });
  it("loads pull request size and reviews in two requests", async () => {
    const fn = stub({
      "/pulls/8/reviews": () =>
        new Response(
          JSON.stringify([
            { user: { login: "rev", id: 3 }, state: "APPROVED", submitted_at: "2026-11-01T00:00:00Z" },
            { user: { login: "x" }, state: "<b>", submitted_at: "2026-11-01T00:00:00Z" },
          ]),
        ),
      "/pulls/8": () =>
        new Response(
          JSON.stringify({ additions: 10, deletions: 2, changed_files: 3, commits: 1, requested_reviewers: [{ login: "lead", id: 9 }], mergeable_state: "clean" }),
        ),
    });
    const pull = await fetchPullDetails(repo, 8);
    expect(pull).toMatchObject({ additions: 10, deletions: 2, changedFiles: 3, mergeableState: "clean" });
    expect(pull.requestedReviewers).toEqual([{ login: "lead", id: 9 }]);
    expect(pull.reviews.map((r) => r.state)).toEqual(["APPROVED"]);
    expect(fn).toHaveBeenCalledTimes(2);
    await expect(fetchPullDetails(repo, 0)).rejects.toThrow();
  });
});

