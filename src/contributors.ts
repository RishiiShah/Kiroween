import {
  isMaintainer,
  isNewcomer,
  type Association,
  type Issue,
} from "./community";
import type { CommitRecord } from "./scan";

export type Committer = {
  name: string;
  login: string | null;
  avatarId: number | null;
  commits: number;
  last: string;
};

/** Distinct authors in the inspected commits, most active first. */
export function recentCommitters(commits: CommitRecord[] = []): Committer[] {
  const map = new Map<string, Committer>();
  for (const commit of commits) {
    const key = commit.login ?? `name:${commit.author}`;
    const entry = map.get(key);
    if (entry) {
      entry.commits++;
      if (Date.parse(commit.date) > Date.parse(entry.last)) entry.last = commit.date;
    } else
      map.set(key, {
        name: commit.author,
        login: commit.login,
        avatarId: commit.avatarId,
        commits: 1,
        last: commit.date,
      });
  }
  return [...map.values()].sort(
    (a, b) => b.commits - a.commits || Date.parse(b.last) - Date.parse(a.last) || a.name.localeCompare(b.name),
  );
}

export type OpenWorker = {
  login: string;
  id: number | null;
  association: Association;
  pulls: number;
  issues: number;
  oldest: string;
};

/** Who opened the currently open threads. */
export function openAuthors(items: Issue[]): OpenWorker[] {
  const map = new Map<string, OpenWorker>();
  for (const item of items) {
    if (item.author === "ghost") continue;
    const entry =
      map.get(item.author) ??
      ({ login: item.author, id: item.authorId, association: item.association, pulls: 0, issues: 0, oldest: item.updatedAt } as OpenWorker);
    if (item.kind === "pull") entry.pulls++;
    else entry.issues++;
    if (Date.parse(item.updatedAt) < Date.parse(entry.oldest)) entry.oldest = item.updatedAt;
    map.set(item.author, entry);
  }
  return [...map.values()].sort(
    (a, b) => b.pulls + b.issues - (a.pulls + a.issues) || a.login.localeCompare(b.login),
  );
}

export type Assignee = { login: string; id: number | null; pulls: number; issues: number };

export function assigneeLoad(items: Issue[]): { people: Assignee[]; unassigned: number } {
  const map = new Map<string, Assignee>();
  let unassigned = 0;
  for (const item of items) {
    if (!item.assignees.length) unassigned++;
    for (const person of item.assignees) {
      const entry = map.get(person.login) ?? { login: person.login, id: person.id, pulls: 0, issues: 0 };
      if (item.kind === "pull") entry.pulls++;
      else entry.issues++;
      map.set(person.login, entry);
    }
  }
  return {
    people: [...map.values()].sort(
      (a, b) => b.pulls + b.issues - (a.pulls + a.issues) || a.login.localeCompare(b.login),
    ),
    unassigned,
  };
}

/** Open pull requests from first-time contributors, longest-waiting first. */
export function newcomersWaiting(items: Issue[]): Issue[] {
  return items
    .filter((item) => item.kind === "pull" && isNewcomer(item.association))
    .sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt));
}

export type AssociationGroup = { key: string; label: string; value: number; className: string };

export function associationBreakdown(items: Issue[]): AssociationGroup[] {
  const groups = [
    { key: "maintainers", label: "Maintainers", className: "assoc-maint", test: isMaintainer },
    { key: "contributors", label: "Returning contributors", className: "assoc-contrib", test: (a: Association) => a === "CONTRIBUTOR" },
    { key: "newcomers", label: "First-time contributors", className: "assoc-new", test: isNewcomer },
    { key: "outside", label: "Outside contributors", className: "assoc-out", test: (a: Association) => a === "NONE" },
  ];
  return groups.map(({ test, ...group }) => ({
    ...group,
    value: items.filter((item) => test(item.association)).length,
  }));
}
