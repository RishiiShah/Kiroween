import { cachedFetch, savedAt } from "./apiCache";
import { recordQuota } from "./quota";

export type Issue = {
  number: number;
  title: string;
  url: string;
  kind: "issue" | "pull";
  draft: boolean;
  author: string;
  authorId: number | null;
  association: Association;
  assignees: Person[];
  reactions: number;
  comments: number;
  labels: string[];
  createdAt: string;
  updatedAt: string;
  excerpt: string;
};
export type Association =
  | "OWNER"
  | "MEMBER"
  | "COLLABORATOR"
  | "CONTRIBUTOR"
  | "FIRST_TIME_CONTRIBUTOR"
  | "FIRST_TIMER"
  | "NONE";
const ASSOCIATIONS: Association[] = [
  "OWNER",
  "MEMBER",
  "COLLABORATOR",
  "CONTRIBUTOR",
  "FIRST_TIME_CONTRIBUTOR",
  "FIRST_TIMER",
  "NONE",
];
export const ASSOCIATION_LABEL: Record<Association, string> = {
  OWNER: "Owner",
  MEMBER: "Member",
  COLLABORATOR: "Collaborator",
  CONTRIBUTOR: "Contributor",
  FIRST_TIME_CONTRIBUTOR: "First-time contributor",
  FIRST_TIMER: "First-timer",
  NONE: "Outside contributor",
};
export const isMaintainer = (value: Association) =>
  value === "OWNER" || value === "MEMBER" || value === "COLLABORATOR";
export const isNewcomer = (value: Association) =>
  value === "FIRST_TIME_CONTRIBUTOR" || value === "FIRST_TIMER";
export type Person = { login: string; id: number | null };
/** Avatar URLs are built from a validated numeric id, never copied from responses. */
export const avatarUrl = (id: number | null, size = 64) =>
  id && Number.isInteger(id) && id > 0
    ? `https://avatars.githubusercontent.com/u/${id}?s=${size}&v=4`
    : null;
export const profileUrl = (login: string) =>
  `https://github.com/${encodeURIComponent(login)}`;

export type IssueComment = {
  id: number;
  author: string;
  createdAt: string;
  excerpt: string;
};
export type Release = {
  tag: string;
  name: string;
  publishedAt: string;
  url: string;
  prerelease: boolean;
};
export type Week = { week: string; total: number; days: number[] };
export type Details = {
  languages: { name: string; bytes: number }[];
  contributors: { login: string; id: number | null; contributions: number; url: string }[];
  contributorsMore: boolean;
  release: Release | null;
  releases: Release[];
  weeks: Week[] | null;
  weeksPending: boolean;
  warnings: string[];
  fetchedAt: string;
};
export type PullDetails = {
  additions: number;
  deletions: number;
  changedFiles: number;
  commits: number;
  requestedReviewers: Person[];
  reviews: { author: string; id: number | null; state: string; submittedAt: string }[];
  mergeableState: string | null;
};
export const COMMUNITY_LIMITS = {
  issues: 100,
  comments: 10,
  contributors: 30,
  releases: 10,
  reviews: 30,
  assignees: 5,
  languages: 6,
  excerpt: 1500,
  commentExcerpt: 900,
  labels: 4,
};
export const QUIET_DAYS = 90;

export class GitHubError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export const clip = (value: unknown, max: number): string => {
  const text =
    typeof value === "string"
      ? // eslint-disable-next-line no-control-regex
        value.replace(/\r/g, "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim()
      : "";
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
};

export async function api(repository: string, path: string, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const response = await cachedFetch(`https://api.github.com/repos/${repository}${path}`, {
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
      throw new GitHubError(`GitHub limited this request.${time}`, response.status);
    }
    if (response.status === 404)
      throw new GitHubError("Not found or not publicly available.", 404);
    throw new GitHubError(
      `GitHub request failed (${response.status}). Try again later.`,
      response.status,
    );
  }
  const more = /rel="next"/.test(response.headers.get("link") || "");
  const cachedAt = savedAt(response);
  if (response.status === 204 || response.status === 202)
    return { data: [] as unknown, more, status: response.status, cachedAt };
  return { data: (await response.json()) as unknown, more, status: response.status, cachedAt };
}

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
const validDate = (value: unknown): value is string =>
  typeof value === "string" && Number.isFinite(Date.parse(value));
const LOGIN = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}(\[bot\])?$/;
const login = (value: unknown) => {
  const name = record(value)?.login;
  return typeof name === "string" && LOGIN.test(name) ? name : "ghost";
};
const userId = (value: unknown) => {
  const id = record(value)?.id;
  return typeof id === "number" && Number.isInteger(id) && id > 0 ? id : null;
};
const person = (value: unknown): Person | null => {
  const name = record(value)?.login;
  return typeof name === "string" && LOGIN.test(name) ? { login: name, id: userId(value) } : null;
};
const people = (value: unknown, max: number) =>
  (Array.isArray(value) ? value : [])
    .map(person)
    .filter((item): item is Person => item !== null)
    .slice(0, max);

/** Links are built from validated parts, never copied from API responses. */
export const issueUrl = (repository: string, number: number, kind: Issue["kind"]) =>
  `https://github.com/${repository}/${kind === "pull" ? "pull" : "issues"}/${number}`;

export function parseIssues(data: unknown, repository: string): Issue[] {
  if (!Array.isArray(data)) throw new Error("GitHub returned an unexpected list.");
  const issues: Issue[] = [];
  for (const raw of data) {
    const item = record(raw);
    if (!item) continue;
    const number = item.number;
    if (
      typeof number !== "number" ||
      !Number.isInteger(number) ||
      number < 1 ||
      typeof item.title !== "string" ||
      !validDate(item.created_at) ||
      !validDate(item.updated_at)
    )
      continue;
    const kind = record(item.pull_request) ? "pull" : "issue";
    const labels = (Array.isArray(item.labels) ? item.labels : [])
      .map((label) => (typeof label === "string" ? label : record(label)?.name))
      .filter((name): name is string => typeof name === "string" && !!name)
      .map((name) => clip(name, 40))
      .slice(0, COMMUNITY_LIMITS.labels);
    issues.push({
      number,
      title: clip(item.title, 200) || `#${number}`,
      url: issueUrl(repository, number, kind),
      kind,
      draft: item.draft === true,
      author: login(item.user),
      authorId: userId(item.user),
      association: ASSOCIATIONS.includes(item.author_association as Association)
        ? (item.author_association as Association)
        : "NONE",
      assignees: people(item.assignees, COMMUNITY_LIMITS.assignees),
      reactions: (() => {
        const total = record(item.reactions)?.total_count;
        return typeof total === "number" && total >= 0 ? Math.floor(total) : 0;
      })(),
      comments:
        typeof item.comments === "number" && item.comments >= 0
          ? Math.floor(item.comments)
          : 0,
      labels,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
      excerpt: clip(item.body, COMMUNITY_LIMITS.excerpt),
    });
  }
  return issues.slice(0, COMMUNITY_LIMITS.issues);
}

export async function fetchIssues(repository: string, signal?: AbortSignal) {
  const { data, more, cachedAt } = await api(
    repository,
    `/issues?state=open&sort=updated&direction=desc&per_page=${COMMUNITY_LIMITS.issues}`,
    signal,
  );
  return {
    items: parseIssues(data, repository),
    more,
    fetchedAt: new Date(cachedAt ?? Date.now()).toISOString(),
  };
}

export function parseComments(data: unknown): IssueComment[] {
  if (!Array.isArray(data)) throw new Error("GitHub returned an unexpected list.");
  const comments: IssueComment[] = [];
  for (const raw of data) {
    const item = record(raw);
    if (!item || typeof item.id !== "number" || !validDate(item.created_at)) continue;
    comments.push({
      id: item.id,
      author: login(item.user),
      createdAt: item.created_at,
      excerpt: clip(item.body, COMMUNITY_LIMITS.commentExcerpt),
    });
  }
  return comments.slice(0, COMMUNITY_LIMITS.comments);
}

export async function fetchComments(
  repository: string,
  number: number,
  signal?: AbortSignal,
) {
  if (!Number.isInteger(number) || number < 1) throw new Error("Invalid issue number.");
  const { data, more } = await api(
    repository,
    `/issues/${number}/comments?per_page=${COMMUNITY_LIMITS.comments}`,
    signal,
  );
  return { items: parseComments(data), more };
}

export function parseLanguages(data: unknown) {
  const source = record(data) ?? {};
  const all = Object.entries(source)
    .filter(
      (entry): entry is [string, number] =>
        typeof entry[1] === "number" && Number.isFinite(entry[1]) && entry[1] > 0,
    )
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const top = all.slice(0, COMMUNITY_LIMITS.languages);
  const rest = all.slice(COMMUNITY_LIMITS.languages).reduce((sum, [, bytes]) => sum + bytes, 0);
  const languages = top.map(([name, bytes]) => ({ name: clip(name, 40), bytes }));
  if (rest > 0) languages.push({ name: "Other", bytes: rest });
  return languages;
}

export function parseContributors(data: unknown) {
  if (!Array.isArray(data)) return [];
  return data
    .map((raw) => record(raw))
    .filter((item): item is Record<string, unknown> => !!item)
    .filter(
      (item) =>
        typeof item.login === "string" &&
        /^[A-Za-z0-9][A-Za-z0-9-]{0,38}(\[bot\])?$/.test(item.login) &&
        typeof item.contributions === "number",
    )
    .slice(0, COMMUNITY_LIMITS.contributors)
    .map((item) => ({
      login: item.login as string,
      id: userId(item),
      contributions: Math.max(0, Math.floor(item.contributions as number)),
      url: profileUrl(item.login as string),
    }));
}

export function parseReleases(data: unknown, repository: string): Release[] {
  if (!Array.isArray(data)) return [];
  return data
    .map((raw) => record(raw))
    .filter((item): item is Record<string, unknown> => !!item && item.draft !== true)
    .map((item) => {
      const base = parseRelease(item, repository);
      return base && base.publishedAt
        ? { ...base, prerelease: item.prerelease === true }
        : null;
    })
    .filter((item): item is Release => item !== null)
    .slice(0, COMMUNITY_LIMITS.releases);
}

export function parseWeeks(data: unknown): Week[] {
  if (!Array.isArray(data)) return [];
  return data
    .map((raw) => record(raw))
    .filter(
      (item): item is Record<string, unknown> =>
        !!item &&
        typeof item.week === "number" &&
        Number.isFinite(item.week) &&
        Array.isArray(item.days) &&
        item.days.length === 7,
    )
    .slice(-52)
    .map((item) => {
      const days = (item.days as unknown[]).map((d) =>
        typeof d === "number" && d >= 0 ? Math.floor(d) : 0,
      );
      return {
        week: new Date((item.week as number) * 1000).toISOString(),
        days,
        total: days.reduce((sum, d) => sum + d, 0),
      };
    });
}

export function parseRelease(data: unknown, repository: string) {
  const item = record(data);
  if (!item || typeof item.tag_name !== "string" || !item.tag_name) return null;
  return {
    tag: clip(item.tag_name, 100),
    name: clip(item.name, 160) || clip(item.tag_name, 100),
    publishedAt: validDate(item.published_at) ? item.published_at : "",
    url: `https://github.com/${repository}/releases/tag/${encodeURIComponent(item.tag_name)}`,
    prerelease: item.prerelease === true,
  };
}

export async function fetchDetails(repository: string, signal?: AbortSignal): Promise<Details> {
  const warnings: string[] = [];
  const [languages, contributors, releases, weekly] = await Promise.allSettled([
    api(repository, "/languages", signal),
    api(repository, `/contributors?per_page=${COMMUNITY_LIMITS.contributors}`, signal),
    api(repository, `/releases?per_page=${COMMUNITY_LIMITS.releases}`, signal),
    api(repository, "/stats/commit_activity", signal),
  ]);
  signal?.throwIfAborted();
  const note = (label: string, result: PromiseRejectedResult) => {
    const error = result.reason;
    if (error instanceof GitHubError && error.status === 404) return;
    warnings.push(`${label}: ${error instanceof Error ? error.message : "unavailable"}`);
  };
  if (languages.status === "rejected") note("Languages", languages);
  if (contributors.status === "rejected") note("Contributors", contributors);
  if (releases.status === "rejected") note("Releases", releases);
  if (weekly.status === "rejected") note("Weekly activity", weekly);
  const results = [languages, contributors, releases, weekly];
  if (results.every((result) => result.status === "rejected") && warnings.length === 4)
    throw new Error(warnings[0].replace(/^Languages: /, ""));
  const releaseList =
    releases.status === "fulfilled" ? parseReleases(releases.value.data, repository) : [];
  const weeksPending = weekly.status === "fulfilled" && weekly.value.status === 202;
  return {
    languages: languages.status === "fulfilled" ? parseLanguages(languages.value.data) : [],
    contributors:
      contributors.status === "fulfilled" ? parseContributors(contributors.value.data) : [],
    contributorsMore: contributors.status === "fulfilled" && contributors.value.more,
    release: releaseList.find((release) => !release.prerelease) ?? releaseList[0] ?? null,
    releases: releaseList,
    weeks:
      weekly.status === "fulfilled" && !weeksPending ? parseWeeks(weekly.value.data) : null,
    weeksPending,
    warnings,
    fetchedAt: new Date(
      Math.min(
        ...[languages, contributors, releases, weekly].map((result) =>
          result.status === "fulfilled" && result.value.cachedAt ? result.value.cachedAt : Date.now(),
        ),
      ),
    ).toISOString(),
  };
}

export async function fetchPullDetails(
  repository: string,
  number: number,
  signal?: AbortSignal,
): Promise<PullDetails> {
  if (!Number.isInteger(number) || number < 1) throw new Error("Invalid pull request number.");
  const [pull, reviews] = await Promise.all([
    api(repository, `/pulls/${number}`, signal),
    api(repository, `/pulls/${number}/reviews?per_page=${COMMUNITY_LIMITS.reviews}`, signal),
  ]);
  const item = record(pull.data) ?? {};
  const n = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
  const STATES = ["APPROVED", "CHANGES_REQUESTED", "COMMENTED", "DISMISSED", "PENDING"];
  return {
    additions: n(item.additions),
    deletions: n(item.deletions),
    changedFiles: n(item.changed_files),
    commits: n(item.commits),
    requestedReviewers: people(item.requested_reviewers, 10),
    reviews: (Array.isArray(reviews.data) ? reviews.data : [])
      .map((raw) => record(raw))
      .filter(
        (review): review is Record<string, unknown> =>
          !!review && STATES.includes(review.state as string) && validDate(review.submitted_at),
      )
      .map((review) => ({
        author: login(review.user),
        id: userId(review.user),
        state: review.state as string,
        submittedAt: review.submitted_at as string,
      })),
    mergeableState:
      typeof item.mergeable_state === "string" && /^[a-z_]{1,20}$/.test(item.mergeable_state)
        ? item.mergeable_state
        : null,
  };
}

export function daysBetween(from: string, to: string) {
  return Math.max(0, Math.floor((Date.parse(to) - Date.parse(from)) / 86400000));
}
export function ago(from: string, now: string) {
  const days = daysBetween(from, now);
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 60) return `${days} days ago`;
  if (days < 730) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}
export const isQuiet = (issue: Issue, now: string) =>
  daysBetween(issue.updatedAt, now) >= QUIET_DAYS;
