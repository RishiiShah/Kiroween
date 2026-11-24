import { describe, it, expect, vi, afterEach } from "vitest";
import fc from "fast-check";
import {
  BRANCH_PAGE,
  HISTORY_PAGE,
  dependencyFinding,
  isSnapshot,
  LIMITS,
  parseRepository,
  scanRepository,
  structureFindings,
  todoFindings,
} from "../src/scan";
const revision = "a".repeat(40);
const observedAt = "2026-11-20T12:00:00.000Z";
const commit = {
  sha: revision,
  commit: { message: "Maintain the manor", committer: { date: observedAt } },
};
function mockGitHub(overrides: Record<string, unknown> = {}) {
  const data: Record<string, unknown> = {
    "": {
      private: false,
      default_branch: "main",
      description: "<script>never executed</script>",
      stargazers_count: 7,
    },
    [`/commits?sha=main&per_page=${HISTORY_PAGE}`]: [commit],
    [`/branches?per_page=${LIMITS.branches + 1}`]: [
      { name: "main", commit: { sha: revision } },
      { name: "forgotten", commit: { sha: revision } },
    ],
    [`/commits?sha=${revision}&per_page=${BRANCH_PAGE}`]: [
      {
        ...commit,
        commit: { ...commit.commit, committer: { date: "2020-01-01T00:00:00Z" } },
      },
    ],
    [`/git/trees/${revision}?recursive=1`]: {
      truncated: false,
      tree: [
        {
          type: "blob",
          mode: "100644",
          path: "README.md",
          sha: revision,
          size: 20,
        },
        {
          type: "blob",
          mode: "100644",
          path: "src/haunt.ts",
          sha: revision,
          size: 20,
        },
        {
          type: "blob",
          mode: "120000",
          path: "external.ts",
          sha: revision,
          size: 20,
        },
      ],
    },
    raw: "// TODO: finish this\n",
    ...overrides,
  };
  const fetcher = vi.fn(async (input: string) => {
    if (input.startsWith("https://raw.githubusercontent.com/owner/manor/")) {
      const raw = data[`raw:${input.split(`/${revision}/`)[1]}`] ?? data.raw;
      return raw instanceof Response ? raw : new Response(String(raw), { status: 200 });
    }
    const path = input.replace("https://api.github.com/repos/owner/manor", "");
    const result = data[path];
    return result instanceof Response
      ? result
      : new Response(JSON.stringify(result), {
          status: result === undefined ? 404 : 200,
        });
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
afterEach(() => vi.unstubAllGlobals());
describe("repository trust boundary", () => {
  it("normalizes supported URLs", () => {
    expect(parseRepository(" https://github.com/owner/manor.git/ ")).toBe(
      "owner/manor",
    );
    expect(parseRepository("https://github.com/owner/manor")).toBe(
      "owner/manor",
    );
  });
  it.each([
    "http://github.com/owner/manor",
    "javascript:alert(1)",
    "https://github.com.evil.org/owner/manor",
    "https://user:pass@github.com/owner/manor",
    "https://github.com/owner/manor/tree/main",
    "https://github.com/owner/manor?q=x",
    "https://github.com/owner/manor#x",
    "file:///owner/manor",
  ])("rejects %s", (input) => expect(() => parseRepository(input)).toThrow());
  it("rejects arbitrary non-HTTPS protocols", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("http", "ftp", "file", "javascript", "data"),
        (protocol) => {
          expect(() =>
            parseRepository(`${protocol}://github.com/owner/manor`),
          ).toThrow();
        },
      ),
    );
  });
});
describe("evidence mapping", () => {
  it("reports dependency declarations without inventing vulnerabilities", () => {
    const regular = dependencyFinding(
      "owner/manor",
      revision,
      JSON.stringify({ dependencies: { react: "^19.0.0" } }),
      observedAt,
    );
    expect(regular.severity).toBe("info");
    expect(regular.explanation).toContain(
      "security advisories were not checked",
    );
    expect(regular.source).toContain(`/blob/${revision}/package.json`);
    const broad = dependencyFinding(
      "owner/manor",
      revision,
      JSON.stringify({
        dependencies: { ghost: "*", remote: "https://example.com/a.tgz" },
      }),
      observedAt,
    );
    expect(broad.severity).toBe("review");
    expect(broad.title).toContain("2 broad or remote");
    expect(() =>
      dependencyFinding("owner/manor", revision, "{broken", observedAt),
    ).toThrow();
    expect(() =>
      dependencyFinding(
        "owner/manor",
        revision,
        '{"dependencies":{"a":1}}',
        observedAt,
      ),
    ).toThrow();
  });
  it("preserves line numbers, bounds findings, and maps deterministically", () => {
    fc.assert(
      fc.property(fc.array(fc.boolean(), { maxLength: 100 }), (lines) => {
        const source = lines
          .map((marked) =>
            marked ? "// TODO: unfinished" : "const done = true;",
          )
          .join("\n");
        const first = todoFindings(
          "owner/manor",
          revision,
          "src/a b.ts",
          source,
          observedAt,
        );
        expect(first).toEqual(
          todoFindings(
            "owner/manor",
            revision,
            "src/a b.ts",
            source,
            observedAt,
          ),
        );
        expect(first.length).toBe(Math.min(lines.filter(Boolean).length, 3));
        for (const finding of first) {
          const line = Number(finding.source.split("#L")[1]);
          expect(lines[line - 1]).toBe(true);
          expect(finding.source).toContain(`/blob/${revision}/src/a%20b.ts`);
        }
        expect(new Set(first.map((f) => f.id)).size).toBe(first.length);
      }),
    );
  });
});
describe("bounded public scan", () => {
  it("caps file reads and isolates malformed manifests", async () => {
    const files = Array.from({ length: LIMITS.files + 20 }, (_, index) => ({
      type: "blob",
      mode: "100644",
      path: `src/file-${index}.ts`,
      sha: revision,
      size: 20,
    }));
    const fetcher = mockGitHub({
      [`/git/trees/${revision}?recursive=1`]: {
        truncated: false,
        tree: [
          {
            type: "blob",
            mode: "100644",
            path: "package.json",
            sha: revision,
            size: 20,
          },
          ...files,
        ],
      },
    });
    const result = await scanRepository("https://github.com/owner/manor");
    expect(result.files).toHaveLength(LIMITS.files);
    const raw = fetcher.mock.calls.filter(([path]) => path.includes("raw.githubusercontent.com"));
    expect(raw).toHaveLength(LIMITS.sourceFiles);
    for (const [url] of raw) expect(url).toContain(`/owner/manor/${revision}/`);
    expect(result.warnings.join(" ")).toContain("does not use the API quota");
    expect(result.sampledFiles).toBe(LIMITS.sourceFiles - 1);
    expect(result.warnings.join(" ")).toContain(
      "Source package.json: malformed",
    );
    expect(
      result.findings.some((f) => f.id === "dependencies:package.json"),
    ).toBe(false);
    expect(result.findings.some((f) => f.zone === "activity")).toBe(true);
  });
  it("links every finding, labels stale branches, ignores symlinks, and records coverage", async () => {
    const fetcher = mockGitHub();
    const result = await scanRepository("https://github.com/owner/manor");
    expect(result.branchesInspected).toBe(1);
    expect(result.sampledFiles).toBe(2);
    expect(result.findings.find((f) => f.zone === "branches")?.confidence).toBe(
      "Medium",
    );
    expect(result.findings.filter((f) => f.zone === "unfinished")).toHaveLength(
      3,
    );
    expect(result.findings.some((f) => f.id === "tests:none-found")).toBe(true);
    expect(result.files).not.toContain("external.ts");
    const api = fetcher.mock.calls.filter(([path]) => path.startsWith("https://api.github.com/"));
    expect(result.requests).toBe(api.length);
    expect(result.requests).toBeLessThanOrEqual(
      4 + LIMITS.branches,
    );
    expect(isSnapshot(result)).toBe(true);
    expect(result.warnings.join(" ")).toContain(
      "not a full code or security audit",
    );
    for (const [, options] of fetcher.mock.calls as unknown as [
      string,
      RequestInit,
    ][])
      expect(options.credentials).toBe("omit");
  });
  it("stops network requests after a rate limit and preserves partial results", async () => {
    const fetcher = mockGitHub({
      [`/branches?per_page=${LIMITS.branches + 1}`]: new Response("{}", {
        status: 403,
        headers: { "x-ratelimit-reset": "1800000000" },
      }),
    });
    const result = await scanRepository("https://github.com/owner/manor");
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(result.findings).toHaveLength(1);
    expect(result.warnings.join(" ")).toContain("GitHub limited this request");
    expect(result.findings.some((f) => f.id === "docs:readme")).toBe(false);
  });
  it("discloses truncated trees", async () => {
    mockGitHub({
      [`/git/trees/${revision}?recursive=1`]: { truncated: true, tree: [] },
    });
    const result = await scanRepository("https://github.com/owner/manor");
    expect(result.warnings.join(" ")).toContain("File listing is incomplete");
    expect(
      result.findings.find((f) => f.id === "docs:readme")?.confidence,
    ).toBe("Medium");
  });
  it("fails explicitly for unavailable repositories", async () => {
    mockGitHub({ "": new Response("{}", { status: 404 }) });
    await expect(
      scanRepository("https://github.com/owner/manor"),
    ).rejects.toThrow("Only accessible public");
  });
  it("does not fetch after cancellation", async () => {
    const fetcher = mockGitHub();
    const controller = new AbortController();
    controller.abort();
    await expect(
      scanRepository("https://github.com/owner/manor", controller.signal),
    ).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects corrupted cache and unsafe evidence URLs", async () => {
    mockGitHub();
    const snapshot = await scanRepository("https://github.com/owner/manor");
    fc.assert(
      fc.property(
        fc.constantFrom(
          "javascript:alert(1)",
          "https://evil.org/source",
          "https://github.com/other/repo/blob/main/a",
        ),
        (source) => {
          const corrupted = structuredClone(snapshot);
          corrupted.findings[0].source = source;
          expect(isSnapshot(corrupted)).toBe(false);
        },
      ),
    );
    const duplicate = structuredClone(snapshot);
    duplicate.findings.push(duplicate.findings[0]);
    expect(isSnapshot(duplicate)).toBe(false);
    expect(isSnapshot({ ...snapshot, observedAt: "invalid" })).toBe(false);
    expect(isSnapshot({ ...snapshot, files: null })).toBe(false);
  });
});

describe("structure findings", () => {
  const find = (files: string[], complete = true) =>
    structureFindings("octo/manor", revision, files, complete, observedAt);
  it("flags a complete tree with source but no recognizable tests", () => {
    const result = find(["README.md", "src/index.ts"]);
    expect(result.map((f) => f.id)).toEqual(["tests:none-found"]);
    expect(result[0].confidence).toBe("Medium");
  });
  it("does not claim missing tests for partial trees, test files, or no source", () => {
    expect(find(["src/index.ts"], false)).toEqual([]);
    expect(find(["src/index.ts", "src/index.test.ts"])).toEqual([]);
    expect(find(["tests/a.py", "app.py"])).toEqual([]);
    expect(find(["README.md"])).toEqual([]);
  });
  it("flags sensitive file names without claiming secrets, ignoring examples", () => {
    const result = find([".env", ".env.example", "keys/server.pem", "src/a.test.ts", "src/a.ts"]);
    expect(result.map((f) => f.path)).toEqual([".env", "keys/server.pem"]);
    expect(result[0].explanation).toMatch(/not read/);
    expect(result[0].source).toBe(
      `https://github.com/octo/manor/blob/${revision}/.env`,
    );
  });
  it("is deterministic and every finding has a validated source", () => {
    fc.assert(
      fc.property(fc.array(fc.string({ maxLength: 20 }), { maxLength: 30 }), (files) => {
        const a = find(files);
        expect(a).toEqual(find(files));
        a.forEach((f) => {
          expect(f.source.startsWith("https://github.com/octo/manor/")).toBe(true);
          expect(f.action.length).toBeGreaterThan(0);
        });
      }),
    );
  });
});
