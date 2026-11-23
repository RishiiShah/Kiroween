import { describe, it, expect, vi, afterEach } from "vitest";
import fc from "fast-check";
import demoData from "../public/demo-snapshot.json";
import type { Snapshot } from "../src/scan";
import {
  branchRefs,
  commitType,
  commitTypeBreakdown,
  fetchGraph,
  layoutGraph,
  orderCommits,
  parseCodeFrequency,
  parseCommitDetail,
  parseGraphCommit,
  parsePunchCard,
  type GraphCommit,
} from "../src/history";

const demo = demoData as Snapshot;
const sha = (n: number) => n.toString(16).padStart(40, "0");
const node = (n: number, parents: number[], day: number, message = `c${n}`): GraphCommit => ({
  sha: sha(n),
  parents: parents.map(sha),
  message,
  author: "a",
  login: "a",
  avatarId: 1,
  date: new Date(Date.UTC(2026, 0, 1) + day * 86400000).toISOString(),
  refs: [],
});
const raw = (n: number, parents: number[] = []) => ({
  sha: sha(n),
  parents: parents.map((p) => ({ sha: sha(p) })),
  author: { login: "ann", id: 3 },
  commit: { message: `msg ${n}\nbody`, author: { name: "Ann" }, committer: { date: "2026-11-01T00:00:00Z" } },
});

/** Random DAG: each commit's parents are older commits. */
const dag = fc
  .array(fc.tuple(fc.nat(6), fc.boolean(), fc.nat(6)), { minLength: 1, maxLength: 40 })
  .map((spec) =>
    spec.map(([back, merge, back2], i) => {
      const parents: number[] = [];
      if (i > 0) parents.push(i - 1 - Math.min(back, i - 1));
      if (merge && i > 1) {
        const second = i - 1 - Math.min(back2, i - 1);
        if (!parents.includes(second)) parents.push(second);
      }
      return node(i, parents, i);
    }),
  );

afterEach(() => vi.unstubAllGlobals());

describe("commit graph", () => {
  it("parses commits, keeping only validated shas and the first message line", () => {
    const commit = parseGraphCommit(raw(5, [4, 3]))!;
    expect(commit.parents).toEqual([sha(4), sha(3)]);
    expect(commit.message).toBe("msg 5");
    expect(commit.author).toBe("ann");
    expect(parseGraphCommit({ ...raw(1), sha: "nope" })).toBeNull();
    expect(parseGraphCommit({ ...raw(1), parents: [{ sha: "<x>" }] })!.parents).toEqual([]);
  });

  it("orders children before parents, and lays out every commit exactly once", () => {
    fc.assert(
      fc.property(dag, (commits) => {
        const ordered = orderCommits(commits);
        expect(new Set(ordered.map((c) => c.sha)).size).toBe(commits.length);
        const index = new Map(ordered.map((c, i) => [c.sha, i]));
        for (const c of ordered) for (const p of c.parents) if (index.has(p)) expect(index.get(p)!).toBeGreaterThan(index.get(c.sha)!);
        const { rows, width } = layoutGraph(ordered);
        expect(rows).toHaveLength(ordered.length);
        for (const row of rows) {
          expect(row.lane).toBeGreaterThanOrEqual(0);
          expect(row.lane).toBeLessThan(width);
          expect(row.parentLanes).toHaveLength(Math.max(1, row.commit.parents.length));
          row.parentLanes.forEach((lane, i) => {
            if (row.commit.parents[i]) expect(row.after[lane]).toBe(row.commit.parents[i]);
          });
        }
        expect(layoutGraph(ordered)).toEqual({ rows, width });
      }),
    );
  });

  it("draws a branch-and-merge history on two lanes", () => {
    // 0 <- 1 <- 3 (merge of 1 and 2), 0 <- 2
    const commits = orderCommits([node(0, [], 0), node(1, [0], 1), node(2, [0], 2), node(3, [1, 2], 3, "Merge branch")]);
    const { rows, width } = layoutGraph(commits);
    expect(width).toBe(2);
    expect(rows[0].commit.sha).toBe(sha(3));
    expect(rows[0].parentLanes).toEqual([0, 1]);
    const root = rows.find((r) => r.commit.sha === sha(0))!;
    expect(root.joins.length).toBe(1);
  });

  it("reads branch tips from the scan's evidence links", () => {
    const refs = branchRefs(demo);
    expect(refs.length).toBe(demo.findings.filter((f) => f.zone === "branches").length);
    for (const ref of refs) expect(ref.tip).toMatch(/^[a-f0-9]{40}$/);
  });

  it("fetches the default branch plus each branch tip and labels refs", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) => {
        calls.push(input);
        if (input.includes(`sha=${sha(9)}`)) return new Response(JSON.stringify([raw(9, [1]), raw(1)]));
        return new Response(JSON.stringify([raw(2, [1]), raw(1)]), { headers: { link: '<x>; rel="next"' } });
      }),
    );
    const graph = await fetchGraph("o/r", "main", [{ name: "feature/x", tip: sha(9) }]);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain("sha=main&per_page=40");
    expect(graph.commits.map((c) => c.sha).sort()).toEqual([sha(1), sha(2), sha(9)].sort());
    expect(graph.commits.find((c) => c.sha === sha(2))!.refs).toEqual(["main"]);
    expect(graph.commits.find((c) => c.sha === sha(9))!.refs).toEqual(["feature/x"]);
    expect(graph.truncated).toBe(true);
  });
});

describe("commit insights", () => {
  it("classifies commit messages", () => {
    expect(commitType({ message: "feat(router): add x", parents: [] })).toBe("feat");
    expect(commitType({ message: "fix: crash", parents: [] })).toBe("fix");
    expect(commitType({ message: "deps: body-parser@^2.4.0 (#7563)", parents: [] })).toBe("deps");
    expect(commitType({ message: "anything", parents: ["a", "b"] })).toBe("merge");
    expect(commitType({ message: "Tidy things", parents: [] })).toBe("other");
    const breakdown = commitTypeBreakdown([node(1, [], 0, "feat: a"), node(2, [], 0, "feat: b"), node(3, [], 0, "misc")]);
    expect(breakdown).toEqual([
      { key: "feat", label: "Features", value: 2 },
      { key: "other", label: "Other", value: 1 },
    ]);
  });
  it("parses weekly code frequency and the punch card defensively", () => {
    expect(parseCodeFrequency([[1700000000, 120, -40], ["x", 1, 1], [1700604800, 5]])).toEqual([
      { week: new Date(1700000000 * 1000).toISOString(), additions: 120, deletions: 40 },
    ]);
    expect(parsePunchCard([[0, 13, 4], [7, 1, 1], [1, 24, 1], [2, 3, -1]])).toEqual([{ day: 0, hour: 13, count: 4 }]);
  });
  it("builds file links itself and drops unsafe file names", () => {
    const detail = parseCommitDetail(
      {
        commit: { message: "full\nmessage", verification: { verified: true } },
        stats: { additions: 3, deletions: 1 },
        files: [
          { filename: "lib/a b.js", status: "modified", additions: 3, deletions: 1, blob_url: "https://evil.example" },
          { filename: "bad\u0000name", status: "added" },
          { filename: "x.md", status: "<weird>" },
        ],
      },
      "o/r",
      sha(7),
    );
    expect(detail.verified).toBe(true);
    expect(detail.files.map((f) => f.path)).toEqual(["lib/a b.js", "x.md"]);
    expect(detail.files[0].url).toBe(`https://github.com/o/r/blob/${sha(7)}/lib/a%20b.js`);
    expect(detail.files[1].status).toBe("modified");
    expect(JSON.stringify(detail)).not.toContain("evil.example");
  });
});
