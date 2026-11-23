import { recordQuota } from "./quota";
export type Zone = "activity" | "branches" | "unfinished";
export type Finding = {
  id: string;
  zone: Zone;
  title: string;
  path: string;
  explanation: string;
  action: string;
  confidence: "High" | "Medium";
  severity: "review" | "info";
  source: string;
  observedAt: string;
};
export type Snapshot = {
  version: 1;
  repository: string;
  description: string;
  defaultBranch: string;
  stars: number;
  observedAt: string;
  revision: string;
  findings: Finding[];
  files: string[];
  sampledFiles: number;
  branchesInspected: number;
  commitsInspected: number;
  commitDates?: string[];
  warnings: string[];
  requests: number;
};
export const LIMITS = {
  files: 2000,
  branches: 4,
  sourceFiles: 6,
  commits: 20,
  sourceBytes: 65536,
};
export const ZONES: {
  id: Zone;
  name: string;
  subtitle: string;
  icon: string;
}[] = [
  {
    id: "activity",
    name: "The living quarters",
    subtitle: "Recent commit activity",
    icon: "pulse",
  },
  {
    id: "branches",
    name: "Forgotten corridors",
    subtitle: "Branches awaiting a visit",
    icon: "branch",
  },
  {
    id: "unfinished",
    name: "The unfinished attic",
    subtitle: "TODOs, dependencies, docs & structure",
    icon: "ghost",
  },
];
export function parseRepository(input: string): string {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error("Enter a full URL: https://github.com/owner/repository");
  }
  const match = url.pathname.match(
    /^\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9_.-]{1,100})\/?$/,
  );
  if (
    url.protocol !== "https:" ||
    url.hostname !== "github.com" ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !match
  ) {
    throw new Error(
      "Use a public https://github.com/owner/repository URL without extra paths or parameters.",
    );
  }
  const name = match[2].replace(/\.git$/, "");
  if (!name || name === "." || name === "..")
    throw new Error("Repository name is invalid.");
  return `${match[1]}/${name}`;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("GitHub returned an unexpected response.");
  return value as Record<string, unknown>;
}
function string(value: unknown): string {
  if (typeof value !== "string")
    throw new Error("GitHub returned incomplete repository data.");
  return value;
}
function list(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value))
    throw new Error("GitHub returned an unexpected list.");
  return value.map(object);
}
function isoDate(value: unknown): string {
  const result = string(value);
  if (!Number.isFinite(Date.parse(result)))
    throw new Error("GitHub returned an invalid date.");
  return result;
}
function sha(value: unknown): string {
  const result = string(value);
  if (!/^[a-f0-9]{40,64}$/.test(result))
    throw new Error("GitHub returned an invalid revision.");
  return result;
}
const encodedPath = (path: string) =>
  path.split("/").map(encodeURIComponent).join("/");
export function todoFindings(
  repository: string,
  revision: string,
  path: string,
  content: string,
  observedAt: string,
): Finding[] {
  const findings: Finding[] = [];
  content.split("\n").forEach((line, index) => {
    if (findings.length >= 3 || !/\b(TODO|FIXME)\b/.test(line)) return;
    const marker = line.match(/\b(TODO|FIXME)\b/)![0];
    findings.push({
      id: `todo:${path}:${index + 1}`,
      zone: "unfinished",
      title: `${marker} in ${path.split("/").pop()}`,
      path: `${path}:${index + 1}`,
      explanation: `An explicit ${marker} marker appears on line ${index + 1}. It may be intentional; this is not a confirmed defect.`,
      action:
        "Read the surrounding code; resolve the task or document why it remains.",
      confidence: "High",
      severity: "review",
      source: `https://github.com/${repository}/blob/${revision}/${encodedPath(path)}#L${index + 1}`,
      observedAt,
    });
  });
  return findings;
}
export function dependencyFinding(
  repository: string,
  revision: string,
  content: string,
  observedAt: string,
): Finding {
  const manifest = object(JSON.parse(content));
  const dependencies =
    manifest.dependencies === undefined ? {} : object(manifest.dependencies);
  if (!Object.values(dependencies).every((value) => typeof value === "string"))
    throw new Error("Dependency declarations are invalid.");
  const entries = Object.entries(dependencies);
  const loose = entries
    .filter(([, version]) =>
      /^(\*|latest|[><]|git|https?:)/.test(version as string),
    )
    .map(([name]) => name);
  return {
    id: "dependencies:package.json",
    zone: "unfinished",
    path: "package.json",
    title: loose.length
      ? `${loose.length} broad or remote dependency declarations`
      : `${entries.length} runtime dependencies declared`,
    explanation: loose.length
      ? `Manifest contains broad or remote version declarations for ${loose.join(", ")}. Lockfile behavior and security advisories were not checked.`
      : `The root manifest declares ${entries.length} direct runtime dependencies. Installed versions, transitive dependencies, licenses, and security advisories were not checked.`,
    action: loose.length
      ? "Check the lockfile and confirm the source and intended version of each flagged dependency."
      : "Review the manifest and lockfile before updating dependencies; this inventory is not a vulnerability report.",
    confidence: "High",
    severity: loose.length ? "review" : "info",
    source: `https://github.com/${repository}/blob/${revision}/package.json`,
    observedAt,
  };
}
const TEST_PATH =
  /(^|\/)(tests?|__tests__|spec|specs)\/|\.(test|spec)\.[^/]+$|(^|\/)test_[^/]+\.py$|_test\.(go|py|rb)$/i;
const SOURCE_PATH =
  /\.(?:[cm]?[jt]sx?|py|rs|go|rb|java|kt|swift|cs|php)$/i;
const SENSITIVE_NAME =
  /(^|\/)(\.env(?:\.(?!example$|sample$|template$)[^/]+)?|id_rsa|id_ed25519|[^/]+\.(?:pem|p12|pfx|keystore))$/i;
export function structureFindings(
  repository: string,
  revision: string,
  files: string[],
  complete: boolean,
  observedAt: string,
): Finding[] {
  const findings: Finding[] = [];
  const treeUrl = `https://github.com/${repository}/tree/${revision}`;
  const hasSource = files.some(
    (path) => SOURCE_PATH.test(path) && !TEST_PATH.test(path),
  );
  if (complete && hasSource && !files.some((path) => TEST_PATH.test(path))) {
    findings.push({
      id: "tests:none-found",
      zone: "unfinished",
      title: "No test files recognized in the file tree",
      path: "/",
      explanation:
        "No path matched common test naming (test/tests/spec directories, .test/.spec files, test_*.py, *_test.go). Tests may exist under other names or in another repository.",
      action:
        "Browse the tree to confirm whether automated tests exist and how they are run.",
      confidence: "Medium",
      severity: "review",
      source: treeUrl,
      observedAt,
    });
  }
  files
    .filter((path) => SENSITIVE_NAME.test(path))
    .slice(0, 3)
    .forEach((path) =>
      findings.push({
        id: `config:${path}`,
        zone: "unfinished",
        title: `${path.split("/").pop()} is tracked in the repository`,
        path,
        explanation:
          "The file name is commonly used for environment settings or key material. File contents were not read, so nothing is claimed about secrets.",
        action:
          "Open the file and confirm it holds no live credentials; if it does, rotate them and remove the file from history.",
        confidence: "Medium",
        severity: "review",
        source: `https://github.com/${repository}/blob/${revision}/${encodedPath(path)}`,
        observedAt,
      }),
    );
  return findings;
}
export async function scanRepository(
  input: string,
  signal?: AbortSignal,
  onProgress: (message: string) => void = () => {},
): Promise<Snapshot> {
  const repository = parseRepository(input);
  const root = `https://api.github.com/repos/${repository}`;
  const observedAt = new Date().toISOString();
  const warnings: string[] = [];
  let requests = 0;
  let rateLimitMessage = "";
  async function get(path: string): Promise<{
    data: unknown;
    more: boolean;
  }> {
    signal?.throwIfAborted();
    if (rateLimitMessage) throw new Error(rateLimitMessage);
    requests++;
    const response = await fetch(`${root}${path}`, {
      signal: AbortSignal.any([
        ...(signal ? [signal] : []),
        AbortSignal.timeout(15000),
      ]),
      headers: { Accept: "application/vnd.github+json" },
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    recordQuota(response.headers);
    if (!response.ok) {
      if (response.status === 403 || response.status === 429) {
        const reset = response.headers.get("x-ratelimit-reset");
        const time =
          reset && Number.isFinite(Number(reset))
            ? ` Try after ${new Date(Number(reset) * 1000).toLocaleTimeString()}.`
            : " Try again later.";
        rateLimitMessage = `GitHub limited this request.${time} Cached results and the demo remain available.`;
        throw new Error(rateLimitMessage);
      }
      if (response.status === 404)
        throw new Error(
          "Repository or source unavailable. Only accessible public repositories are supported.",
        );
      if (response.status === 409)
        throw new Error(
          "This repository is empty or its history is unavailable.",
        );
      throw new Error(
        `GitHub request failed (${response.status}). Try again later.`,
      );
    }
    return {
      data: await response.json(),
      more: /rel="next"/.test(response.headers.get("link") || ""),
    };
  }
  async function optional(path: string, label: string) {
    try {
      return await get(path);
    } catch (error) {
      signal?.throwIfAborted();
      warnings.push(
        `${label}: ${error instanceof Error ? error.message : "unavailable"}`,
      );
      return null;
    }
  }
  onProgress("Opening the repository…");
  const metadata = object((await get("")).data);
  if (metadata.private !== false)
    throw new Error("Only public repositories are supported.");
  const defaultBranch = string(metadata.default_branch);
  onProgress("Reading recent activity…");
  const history = await optional(
    `/commits?per_page=${LIMITS.commits}`,
    "Commit history",
  );
  const commits = history ? list(history.data) : [];
  const revision = commits.length ? sha(commits[0].sha) : "";
  if (history?.more)
    warnings.push(`Activity covers the latest ${LIMITS.commits} commits only.`);
  const findings: Finding[] = commits.slice(0, 6).map((commit) => {
    const data = object(commit.commit);
    const commitSha = sha(commit.sha);
    return {
      id: `commit:${commitSha}`,
      zone: "activity",
      title: string(data.message).split("\n")[0].slice(0, 160),
      path: commitSha.slice(0, 7),
      explanation: `Commit recorded ${isoDate(object(data.committer).date)}. Recent activity alone does not establish repository health.`,
      action: "Review the commit diff and its associated tests.",
      confidence: "High",
      severity: "info",
      source: `https://github.com/${repository}/commit/${commitSha}`,
      observedAt,
    };
  });
  onProgress("Walking the forgotten corridors…");
  const branchResponse = await optional(
    `/branches?per_page=${LIMITS.branches + 1}`,
    "Branch list",
  );
  const branches = branchResponse ? list(branchResponse.data) : [];
  const candidates = branches
    .filter((branch) => branch.name !== defaultBranch)
    .slice(0, LIMITS.branches);
  if (
    branchResponse?.more ||
    branches.filter((branch) => branch.name !== defaultBranch).length >
      LIMITS.branches
  )
    warnings.push(
      `Branch review is limited to ${LIMITS.branches} non-default branches.`,
    );
  let branchesInspected = 0;
  for (const branch of candidates) {
    const name = string(branch.name);
    const tip = sha(object(branch.commit).sha);
    const response = await optional(`/commits/${tip}`, `Branch ${name}`);
    if (!response) continue;
    const date = isoDate(
      object(object(object(response.data).commit).committer).date,
    );
    const age = Math.max(
      0,
      Math.floor((Date.parse(observedAt) - Date.parse(date)) / 86400000),
    );
    branchesInspected++;
    findings.push({
      id: `branch:${name}`,
      zone: "branches",
      title: age >= 90 ? `${name} has been quiet` : `${name} is still stirring`,
      path: name,
      explanation: `Tip commit is ${age} days old. The review threshold is 90 days; commit age does not reveal branch creation date or whether work was abandoned.`,
      action:
        age >= 90
          ? "Ask the maintainer whether this branch should be kept, merged, or archived."
          : "Check the branch diff for ongoing work.",
      confidence: age >= 90 ? "Medium" : "High",
      severity: age >= 90 ? "review" : "info",
      source: `https://github.com/${repository}/commit/${tip}`,
      observedAt,
    });
  }
  onProgress("Looking for unfinished business…");
  const treeResponse = revision
    ? await optional(`/git/trees/${revision}?recursive=1`, "File tree")
    : null;
  if (!revision)
    warnings.push("No revision available; source analysis was skipped.");
  const tree = treeResponse ? object(treeResponse.data) : null;
  const allFiles = tree
    ? list(tree.tree).filter(
        (file) => file.type === "blob" && file.mode !== "120000",
      )
    : [];
  const entries = allFiles.slice(0, LIMITS.files);
  if (tree?.truncated || allFiles.length > LIMITS.files)
    warnings.push(
      `File listing is incomplete; at most ${LIMITS.files} files are considered.`,
    );
  const files = entries.map((file) => string(file.path)).sort();
  const sourcePriority = (path: string) =>
    path === "package.json" ? 0 : /^(src|lib|app)\//.test(path) ? 1 : 2;
  const sources = entries
    .filter(
      (file) =>
        typeof file.size === "number" &&
        file.size <= LIMITS.sourceBytes &&
        (file.path === "package.json" ||
          /\.(?:[cm]?[jt]sx?|py|rs|go|rb|java|css|md)$/i.test(
            string(file.path),
          )) &&
        !/(^|\/)(?:vendor|dist|build|node_modules|package-lock\.json)(\/|$)/.test(
          string(file.path),
        ),
    )
    .sort(
      (a, b) =>
        sourcePriority(string(a.path)) - sourcePriority(string(b.path)) ||
        string(a.path).localeCompare(string(b.path)),
    )
    .slice(0, LIMITS.sourceFiles);
  let sampledFiles = 0;
  for (const file of sources) {
    const path = string(file.path);
    const response = await optional(
      `/git/blobs/${sha(file.sha)}`,
      `Source ${path}`,
    );
    if (!response) continue;
    const blob = object(response.data);
    if (
      blob.encoding !== "base64" ||
      typeof blob.size !== "number" ||
      blob.size > LIMITS.sourceBytes
    ) {
      warnings.push(`Source ${path}: unsupported or oversized content.`);
      continue;
    }
    try {
      const binary = atob(string(blob.content).replace(/\s/g, ""));
      const content = new TextDecoder().decode(
        Uint8Array.from(binary, (c) => c.charCodeAt(0)),
      );
      if (path === "package.json")
        findings.push(
          dependencyFinding(repository, revision, content, observedAt),
        );
      else
        findings.push(
          ...todoFindings(repository, revision, path, content, observedAt),
        );
      sampledFiles++;
    } catch {
      warnings.push(
        `Source ${path}: malformed or unsupported content; analysis skipped.`,
      );
    }
  }
  if (tree && !files.some((path) => /^readme(?:\.[^.]+)?$/i.test(path))) {
    findings.push({
      id: "docs:readme",
      zone: "unfinished",
      title: "No root README in the inspected tree",
      path: "/",
      explanation:
        "No root README was found in the available file listing. A partial tree may omit it.",
      action:
        "Inspect the root directory and add an introduction if documentation is missing.",
      confidence: "Medium",
      severity: "review",
      source: `https://github.com/${repository}/tree/${revision}`,
      observedAt,
    });
  }
  if (tree) {
    const complete = !tree.truncated && allFiles.length <= LIMITS.files;
    findings.push(
      ...structureFindings(repository, revision, files, complete, observedAt),
    );
  }
  warnings.push(
    `TODO analysis samples ${sampledFiles} text files, at most ${LIMITS.sourceBytes / 1024} KiB each; it is not a full code or security audit.`,
  );
  return {
    version: 1,
    repository,
    description:
      typeof metadata.description === "string"
        ? metadata.description
        : "A public repository, with a few stories to tell.",
    defaultBranch,
    stars:
      typeof metadata.stargazers_count === "number"
        ? metadata.stargazers_count
        : 0,
    observedAt,
    revision,
    findings,
    files,
    sampledFiles,
    branchesInspected,
    commitsInspected: commits.length,
    commitDates: commits.map((commit) =>
      isoDate(object(object(commit.commit).committer).date),
    ),
    warnings,
    requests,
  };
}
export function isSnapshot(value: unknown): value is Snapshot {
  try {
    const item = object(value);
    if (
      item.version !== 1 ||
      parseRepository(`https://github.com/${string(item.repository)}`) !==
        item.repository
    )
      return false;
    isoDate(item.observedAt);
    if (
      typeof item.description !== "string" ||
      typeof item.defaultBranch !== "string" ||
      typeof item.revision !== "string"
    )
      return false;
    if (
      ![
        "stars",
        "sampledFiles",
        "branchesInspected",
        "commitsInspected",
        "requests",
      ].every(
        (key) =>
          typeof item[key] === "number" &&
          Number.isFinite(item[key]) &&
          (item[key] as number) >= 0,
      )
    )
      return false;
    if (
      !Array.isArray(item.files) ||
      item.files.length > LIMITS.files ||
      !item.files.every((path) => typeof path === "string")
    )
      return false;
    if (
      !Array.isArray(item.warnings) ||
      !item.warnings.every((warning) => typeof warning === "string")
    )
      return false;
    if (
      item.commitDates !== undefined &&
      (!Array.isArray(item.commitDates) ||
        item.commitDates.length > LIMITS.commits ||
        !item.commitDates.every(
          (value) =>
            typeof value === "string" && Number.isFinite(Date.parse(value)),
        ))
    )
      return false;
    if (!Array.isArray(item.findings) || item.findings.length > 40)
      return false;
    const ids = new Set<string>();
    return item.findings.every((value) => {
      const finding = object(value);
      if (
        !["id", "title", "path", "explanation", "action", "source"].every(
          (key) => typeof finding[key] === "string",
        )
      )
        return false;
      isoDate(finding.observedAt);
      const url = new URL(string(finding.source));
      if (
        url.origin !== "https://github.com" ||
        url.username ||
        url.password ||
        !url.pathname.startsWith(`/${item.repository}/`)
      )
        return false;
      if (ids.has(string(finding.id))) return false;
      ids.add(string(finding.id));
      return (
        ZONES.some((zone) => zone.id === finding.zone) &&
        ["High", "Medium"].includes(string(finding.confidence)) &&
        ["review", "info"].includes(string(finding.severity))
      );
    });
  } catch {
    return false;
  }
}
