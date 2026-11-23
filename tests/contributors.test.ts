import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { parseIssues } from "../src/community";
import {
  assigneeLoad,
  associationBreakdown,
  newcomersWaiting,
  openAuthors,
  recentCommitters,
} from "../src/contributors";

const sha = (n: number) => n.toString(16).padStart(40, "0");
const issue = (n: number, extra: Record<string, unknown> = {}) => ({
  number: n,
  title: `t${n}`,
  user: { login: `u${n % 3}`, id: (n % 3) + 1 },
  comments: 0,
  labels: [],
  created_at: "2026-01-01T00:00:00Z",
  updated_at: `2026-0${(n % 9) + 1}-01T00:00:00Z`,
  ...extra,
});

describe("people", () => {
  it("groups commits by login, falling back to the git name", () => {
    const people = recentCommitters([
      { sha: sha(1), date: "2026-11-01T00:00:00Z", author: "ann", login: "ann", avatarId: 1 },
      { sha: sha(2), date: "2026-11-03T00:00:00Z", author: "ann", login: "ann", avatarId: 1 },
      { sha: sha(3), date: "2026-11-02T00:00:00Z", author: "Bob Builder", login: null, avatarId: null },
    ]);
    expect(people.map((p) => [p.name, p.commits])).toEqual([["ann", 2], ["Bob Builder", 1]]);
    expect(people[0].last).toBe("2026-11-03T00:00:00Z");
    expect(recentCommitters()).toEqual([]);
  });
  it("counts open work per author and per assignee without losing threads", () => {
    fc.assert(
      fc.property(fc.array(fc.boolean(), { maxLength: 40 }), (pulls) => {
        const items = parseIssues(
          pulls.map((pull, i) =>
            issue(i + 1, {
              ...(pull ? { pull_request: {} } : {}),
              assignees: i % 2 ? [{ login: "keeper", id: 7 }] : [],
            }),
          ),
          "o/r",
        );
        const authors = openAuthors(items);
        expect(authors.reduce((s, a) => s + a.pulls + a.issues, 0)).toBe(items.length);
        const load = assigneeLoad(items);
        expect(load.unassigned + (load.people[0]?.pulls ?? 0) + (load.people[0]?.issues ?? 0)).toBe(items.length);
      }),
    );
  });
  it("lists first-time contributors' pull requests, longest waiting first", () => {
    const items = parseIssues(
      [
        issue(1, { pull_request: {}, author_association: "FIRST_TIME_CONTRIBUTOR", updated_at: "2026-05-01T00:00:00Z" }),
        issue(2, { pull_request: {}, author_association: "FIRST_TIMER", updated_at: "2026-02-01T00:00:00Z" }),
        issue(3, { author_association: "FIRST_TIME_CONTRIBUTOR" }),
        issue(4, { pull_request: {}, author_association: "MEMBER" }),
      ],
      "o/r",
    );
    expect(newcomersWaiting(items).map((i) => i.number)).toEqual([2, 1]);
    const groups = associationBreakdown(items);
    expect(groups.reduce((s, g) => s + g.value, 0)).toBe(items.length);
    expect(groups.find((g) => g.key === "newcomers")?.value).toBe(3);
  });
});
