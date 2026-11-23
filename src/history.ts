import { api, clip } from "./community";
import { encodedPath, type Snapshot } from "./scan";

const SHA = /^[a-f0-9]{40,64}$/;
const LOGIN = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}(\[bot\])?$/;
export const GRAPH_LIMITS = { main: 40, branch: 15, branches: 4, files: 60 };

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
const validDate = (value: unknown): value is string =>
  typeof value === "string" && Number.isFinite(Date.parse(value));

export type GraphCommit = {
  sha: string;
  parents: string[];
  message: string;
  author: string;
  login: string | null;
  avatarId: number | null;
  date: string;
  refs: string[];
};

/** Parses one item of GET /commits. Returns null for anything malformed. */
export function parseGraphCommit(raw: unknown): GraphCommit | null {
  const item = record(raw);
  const data = record(item?.commit);
  if (!item || !data || typeof item.sha !== "string" || !SHA.test(item.sha)) return null;
  const date = record(data.committer)?.date;
  if (!validDate(date)) return null;
  const user = record(item.author);
  const login = typeof user?.login === "string" && LOGIN.test(user.login) ? user.login : null;
  const id = typeof user?.id === "number" && Number.isInteger(user.id) && user.id > 0 ? user.id : null;
  const parents = (Array.isArray(item.parents) ? item.parents : [])
    .map((parent) => record(parent)?.sha)
    .filter((sha): sha is string => typeof sha === "string" && SHA.test(sha))
    .slice(0, 8);
  const name = clip(record(data.author)?.name, 80);
  return {
    sha: item.sha,
    parents,
    message: clip(typeof data.message === "string" ? data.message.split("\n")[0] : "", 160) || "(no message)",
    author: login ?? (name || "unknown"),
    login,
    avatarId: id,
    date,
    refs: [],
  };
}

export type BranchRef = { name: string; tip: string };

/** Branch names and tips come from the scan's own branch findings. */
export function branchRefs(snapshot: Snapshot): BranchRef[] {
  return snapshot.findings
    .filter((finding) => finding.zone === "branches")
    .map((finding) => {
      const tip = finding.source.match(/\/commit\/([a-f0-9]{40,64})$/)?.[1];
      return tip ? { name: finding.path, tip } : null;
    })
    .filter((ref): ref is BranchRef => ref !== null)
    .slice(0, GRAPH_LIMITS.branches);
}

export type Graph = {
  commits: GraphCommit[];
  branches: string[];
  truncated: boolean;
  fetchedAt: string;
};

/** Default branch history plus a short history for each sampled branch. */
export async function fetchGraph(
  repository: string,
  defaultBranch: string,
  branches: BranchRef[],
  signal?: AbortSignal,
): Promise<Graph> {
  const requests = [
    api(repository, `/commits?sha=${encodeURIComponent(defaultBranch)}&per_page=${GRAPH_LIMITS.main}`, signal),
    ...branches.map((branch) =>
      api(repository, `/commits?sha=${branch.tip}&per_page=${GRAPH_LIMITS.branch}`, signal),
    ),
  ];
  const results = await Promise.allSettled(requests);
  signal?.throwIfAborted();
  if (results[0].status === "rejected") throw results[0].reason;
  const map = new Map<string, GraphCommit>();
  let truncated = false;
  results.forEach((result) => {
    if (result.status !== "fulfilled") return;
    if (result.value.more) truncated = true;
    for (const raw of Array.isArray(result.value.data) ? result.value.data : []) {
      const commit = parseGraphCommit(raw);
      if (commit && !map.has(commit.sha)) map.set(commit.sha, commit);
    }
  });
  const commits = orderCommits([...map.values()]);
  const mainData = results[0].value.data;
  const firstMain = parseGraphCommit(Array.isArray(mainData) ? mainData[0] : null);
  for (const commit of commits) {
    if (firstMain && commit.sha === firstMain.sha) commit.refs.push(defaultBranch);
    for (const branch of branches) if (branch.tip === commit.sha) commit.refs.push(branch.name);
  }
  return {
    commits,
    branches: [defaultBranch, ...branches.map((branch) => branch.name)],
    truncated,
    fetchedAt: new Date().toISOString(),
  };
}

/** Newest first; a commit never appears after one of its loaded parents. */
export function orderCommits(commits: GraphCommit[]): GraphCommit[] {
  const byDate = [...commits].sort(
    (a, b) => Date.parse(b.date) - Date.parse(a.date) || a.sha.localeCompare(b.sha),
  );
  const known = new Set(byDate.map((commit) => commit.sha));
  const children = new Map<string, number>();
  for (const commit of byDate)
    for (const parent of commit.parents)
      if (known.has(parent)) children.set(parent, (children.get(parent) ?? 0) + 1);
  const ready = byDate.filter((commit) => !children.get(commit.sha));
  const bySha = new Map(byDate.map((commit) => [commit.sha, commit]));
  const out: GraphCommit[] = [];
  const remaining = new Map(children);
  while (ready.length) {
    ready.sort((a, b) => Date.parse(b.date) - Date.parse(a.date) || a.sha.localeCompare(b.sha));
    const next = ready.shift()!;
    out.push(next);
    for (const parent of next.parents) {
      if (!remaining.has(parent)) continue;
      const left = remaining.get(parent)! - 1;
      remaining.set(parent, left);
      if (left === 0) ready.push(bySha.get(parent)!);
    }
  }
  return out.length === byDate.length ? out : byDate;
}

export type GraphRow = {
  commit: GraphCommit;
  lane: number;
  /** Lanes entering this row from above (sha each lane is waiting for). */
  before: (string | null)[];
  /** Lanes leaving this row downward. */
  after: (string | null)[];
  /** Lanes from above that end at this commit (branches joining). */
  joins: number[];
  /** Lanes the commit's parents continue in (first parent first). */
  parentLanes: number[];
  isTip: boolean;
};

/** Assigns every commit to a lane, GitHub-network style. Deterministic for the same input. */
export function layoutGraph(commits: GraphCommit[]): { rows: GraphRow[]; width: number } {
  let active: (string | null)[] = [];
  let width = 1;
  const rows: GraphRow[] = [];
  for (const commit of commits) {
    let lane = active.indexOf(commit.sha);
    const isTip = lane === -1;
    if (isTip) {
      lane = active.indexOf(null);
      if (lane === -1) {
        lane = active.length;
        active.push(null);
      }
    }
    const before = active.slice();
    before[lane] = isTip ? null : commit.sha;
    const joins = active
      .map((sha, index) => (sha === commit.sha && index !== lane ? index : -1))
      .filter((index) => index >= 0);
    const after = active.slice();
    for (const index of joins) after[index] = null;
    after[lane] = commit.parents[0] ?? null;
    const parentLanes = [lane];
    for (const parent of commit.parents.slice(1)) {
      let target = after.indexOf(parent);
      if (target === -1) {
        target = after.indexOf(null);
        if (target === -1) {
          target = after.length;
          after.push(null);
        }
        after[target] = parent;
      }
      parentLanes.push(target);
    }
    while (after.length && after[after.length - 1] === null) after.pop();
    width = Math.max(width, before.length, after.length, lane + 1);
    rows.push({ commit, lane, before, after, joins, parentLanes, isTip });
    active = after;
  }
  return { rows, width };
}

/* ---------------- Commit types ---------------- */
export const COMMIT_TYPES = [
  { key: "feat", label: "Features", test: /^feat(\(|!|:)/i },
  { key: "fix", label: "Fixes", test: /^(fix|bugfix|hotfix)(\(|!|:)/i },
  { key: "deps", label: "Dependencies", test: /^(deps|build\(deps\)|chore\(deps\)|bump\b)|^(update|upgrade) .*(dependenc|to v?\d)/i },
  { key: "docs", label: "Docs", test: /^docs?(\(|!|:)|readme/i },
  { key: "test", label: "Tests", test: /^tests?(\(|!|:)/i },
  { key: "refactor", label: "Refactors", test: /^(refactor|perf|style)(\(|!|:)/i },
  { key: "chore", label: "Chores & CI", test: /^(chore|ci|build|release)(\(|!|:)/i },
  { key: "merge", label: "Merges", test: /^merge\b/i },
] as const;
export type CommitTypeKey = (typeof COMMIT_TYPES)[number]["key"] | "other";

export function commitType(commit: Pick<GraphCommit, "message" | "parents">): CommitTypeKey {
  if (commit.parents.length > 1) return "merge";
  return COMMIT_TYPES.find((type) => type.test.test(commit.message))?.key ?? "other";
}
export function commitTypeBreakdown(commits: GraphCommit[]) {
  const counts = new Map<CommitTypeKey, number>();
  for (const commit of commits) counts.set(commitType(commit), (counts.get(commitType(commit)) ?? 0) + 1);
  return [...COMMIT_TYPES.map((type) => ({ key: type.key as CommitTypeKey, label: type.label })), { key: "other" as CommitTypeKey, label: "Other" }]
    .map((type) => ({ ...type, value: counts.get(type.key) ?? 0 }))
    .filter((type) => type.value > 0);
}

/* ---------------- Statistics endpoints ---------------- */
export type CodeWeek = { week: string; additions: number; deletions: number };
export type Punch = { day: number; hour: number; count: number };
export type Insights = {
  frequency: CodeWeek[] | null;
  punch: Punch[] | null;
  pending: string[];
  warnings: string[];
};

const n = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : NaN);

export function parseCodeFrequency(data: unknown): CodeWeek[] {
  if (!Array.isArray(data)) return [];
  return data
    .filter((row): row is unknown[] => Array.isArray(row) && row.length >= 3)
    .map((row) => ({ week: n(row[0]), additions: n(row[1]), deletions: n(row[2]) }))
    .filter((row) => [row.week, row.additions, row.deletions].every(Number.isFinite))
    .slice(-104)
    .map((row) => ({
      week: new Date(row.week * 1000).toISOString(),
      additions: Math.max(0, row.additions),
      deletions: Math.max(0, Math.abs(row.deletions)),
    }));
}
export function parsePunchCard(data: unknown): Punch[] {
  if (!Array.isArray(data)) return [];
  return data
    .filter((row): row is unknown[] => Array.isArray(row) && row.length >= 3)
    .map((row) => ({ day: n(row[0]), hour: n(row[1]), count: n(row[2]) }))
    .filter(
      (row) =>
        Number.isInteger(row.day) && row.day >= 0 && row.day < 7 &&
        Number.isInteger(row.hour) && row.hour >= 0 && row.hour < 24 &&
        Number.isFinite(row.count) && row.count >= 0,
    )
    .slice(0, 168);
}

export async function fetchInsights(repository: string, signal?: AbortSignal): Promise<Insights> {
  const [frequency, punch] = await Promise.allSettled([
    api(repository, "/stats/code_frequency", signal),
    api(repository, "/stats/punch_card", signal),
  ]);
  signal?.throwIfAborted();
  const pending: string[] = [];
  const warnings: string[] = [];
  const read = <T,>(
    label: string,
    result: PromiseSettledResult<{ data: unknown; status?: number }>,
    parse: (data: unknown) => T[],
  ): T[] | null => {
    if (result.status === "rejected") {
      warnings.push(`${label}: ${result.reason instanceof Error ? result.reason.message : "unavailable"}`);
      return null;
    }
    if (result.value.status === 202) {
      pending.push(label);
      return null;
    }
    return parse(result.value.data);
  };
  const result = {
    frequency: read("Code frequency", frequency, parseCodeFrequency),
    punch: read("Commit hours", punch, parsePunchCard),
    pending,
    warnings,
  };
  if (warnings.length === 2) throw new Error(warnings[0].replace(/^Code frequency: /, ""));
  return result;
}

/* ---------------- Commit detail ---------------- */
export type CommitFile = {
  path: string;
  status: "added" | "removed" | "modified" | "renamed" | "copied" | "changed" | "unchanged";
  additions: number;
  deletions: number;
  url: string;
};
export type CommitDetail = {
  message: string;
  additions: number;
  deletions: number;
  verified: boolean;
  files: CommitFile[];
  moreFiles: boolean;
};
const STATUSES = ["added", "removed", "modified", "renamed", "copied", "changed", "unchanged"];

export function parseCommitDetail(data: unknown, repository: string, sha: string): CommitDetail {
  const item = record(data) ?? {};
  const commit = record(item.commit) ?? {};
  const stats = record(item.stats) ?? {};
  const count = (value: unknown) => (typeof value === "number" && value >= 0 ? Math.floor(value) : 0);
  const files = (Array.isArray(item.files) ? item.files : [])
    .map((raw) => record(raw))
    .filter(
      (file): file is Record<string, unknown> =>
        !!file &&
        typeof file.filename === "string" &&
        file.filename.length <= 500 &&
        // eslint-disable-next-line no-control-regex
        !/[\u0000-\u001f]/.test(file.filename),
    );
  return {
    message: clip(commit.message, 2000) || "(no message)",
    additions: count(stats.additions),
    deletions: count(stats.deletions),
    verified: record(commit.verification)?.verified === true,
    files: files.slice(0, GRAPH_LIMITS.files).map((file) => ({
      path: file.filename as string,
      status: (STATUSES.includes(file.status as string) ? file.status : "modified") as CommitFile["status"],
      additions: count(file.additions),
      deletions: count(file.deletions),
      url: `https://github.com/${repository}/blob/${sha}/${encodedPath(file.filename as string)}`,
    })),
    moreFiles: files.length > GRAPH_LIMITS.files,
  };
}

export async function fetchCommitDetail(repository: string, sha: string, signal?: AbortSignal) {
  if (!SHA.test(sha)) throw new Error("Invalid commit.");
  const { data } = await api(repository, `/commits/${sha}`, signal);
  return parseCommitDetail(data, repository, sha);
}
