import { useCallback, useEffect, useRef, useState } from "react";
import { purge, uncachedCount } from "./apiCache";
import { AUTO_RESERVE, getQuota, refreshQuota } from "./quota";
import {
  fetchComments,
  fetchDetails,
  fetchIssues,
  fetchPullDetails,
  type Details,
  type Issue,
  type IssueComment,
  type PullDetails,
} from "./community";
import {
  fetchCommitDetail,
  fetchGraph,
  fetchInsights,
  type BranchRef,
  type CommitDetail,
  type Graph,
  type Insights,
} from "./history";

export type Loadable<T> = {
  status: "idle" | "loading" | "ready" | "error";
  data?: T;
  error?: string;
  /** Why an automatic load was skipped (idle state only). */
  note?: string;
};
export type IssueList = { items: Issue[]; more: boolean; fetchedAt: string; page: number };
export type CommentList = { items: IssueComment[]; more: boolean };
const idle = { status: "idle" } as const;
const message = (error: unknown) =>
  error instanceof Error ? error.message : "Request failed.";

/**
 * GitHub reads for one repository. Everything resets when the repository changes.
 * When autoLoad becomes true, open threads (1 request) and repository details
 * (4 requests) load once, unless GitHub already reported an exhausted quota.
 * Leaving and re-entering the dashboard does not refetch.
 */
export function useCommunity(repository: string | undefined, autoLoad = false) {
  const [issues, setIssues] = useState<Loadable<IssueList>>(idle);
  const [details, setDetails] = useState<Loadable<Details>>(idle);
  const [comments, setComments] = useState<Record<number, Loadable<CommentList>>>({});
  const [pulls, setPulls] = useState<Record<number, Loadable<PullDetails>>>({});
  const [graph, setGraph] = useState<Loadable<Graph>>(idle);
  const [more, setMore] = useState<{ status: "idle" | "loading" | "error"; error?: string }>({ status: "idle" });
  const [insights, setInsights] = useState<Loadable<Insights>>(idle);
  const [commits, setCommits] = useState<Record<string, Loadable<CommitDetail>>>({});
  const controller = useRef<AbortController | null>(null);
  const started = useRef<string | null>(null);

  useEffect(() => {
    const own = new AbortController();
    controller.current?.abort();
    controller.current = own;
    started.current = null;
    setIssues(idle);
    setDetails(idle);
    setComments({});
    setPulls({});
    setGraph(idle);
    setMore({ status: "idle" });
    setInsights(idle);
    setCommits({});
    return () => own.abort();
  }, [repository]);

  const run = useCallback(
    async <T,>(
      set: (value: Loadable<T> | ((all: Loadable<T>) => Loadable<T>)) => void,
      load: (signal: AbortSignal) => Promise<T>,
    ) => {
      const signal = controller.current?.signal;
      if (!repository || !signal) return;
      set({ status: "loading" });
      try {
        const data = await load(signal);
        if (!signal.aborted) set({ status: "ready", data });
      } catch (error) {
        if (!signal.aborted) set({ status: "error", error: message(error) });
      }
    },
    [repository],
  );

  const base = `https://api.github.com/repos/${repository}`;
  /** fresh=true drops this resource's cached responses first (explicit Refresh). */
  const loadIssues = useCallback(
    (fresh = false) =>
      run(setIssues, async (signal) => {
        if (fresh) await purge([`${base}/issues?`]);
        return fetchIssues(repository!, signal);
      }),
    [run, repository, base],
  );
  /** Appends the next page of 100 open threads (1 request). */
  const loadMoreIssues = useCallback(async () => {
    const signal = controller.current?.signal;
    const current = issues.data;
    if (!repository || !signal || !current?.more) return;
    setMore({ status: "loading" });
    try {
      const next = await fetchIssues(repository, signal, current.page + 1);
      if (signal.aborted) return;
      const seen = new Set(current.items.map((item) => item.number));
      setIssues({
        status: "ready",
        data: {
          items: [...current.items, ...next.items.filter((item) => !seen.has(item.number))],
          more: next.more,
          page: next.page,
          fetchedAt: current.fetchedAt < next.fetchedAt ? current.fetchedAt : next.fetchedAt,
        },
      });
      setMore({ status: "idle" });
    } catch (error) {
      if (!signal.aborted) setMore({ status: "error", error: message(error) });
    }
  }, [repository, issues.data]);
  const loadDetails = useCallback(
    (fresh = false) =>
      run(setDetails, async (signal) => {
        if (fresh)
          await purge([`${base}/languages`, `${base}/contributors?`, `${base}/releases?`, `${base}/stats/commit_activity`]);
        return fetchDetails(repository!, signal);
      }),
    [run, repository, base],
  );
  const keyed =
    <T, K extends string | number>(
      setAll: React.Dispatch<React.SetStateAction<Record<K, Loadable<T>>>>,
      number: K,
    ) =>
    (value: Loadable<T> | ((all: Loadable<T>) => Loadable<T>)) =>
      setAll((all) => ({
        ...all,
        [number]: typeof value === "function" ? value(all[number] ?? idle) : value,
      }) as Record<K, Loadable<T>>);
  const loadComments = useCallback(
    (number: number) =>
      run(keyed(setComments, number), (signal) => fetchComments(repository!, number, signal)),
    [run, repository],
  );
  const loadPull = useCallback(
    (number: number) =>
      run(keyed(setPulls, number), (signal) => fetchPullDetails(repository!, number, signal)),
    [run, repository],
  );

  const loadGraph = useCallback(
    (defaultBranch: string, branches: BranchRef[], fresh = false) =>
      run(setGraph, async (signal) => {
        if (fresh) await purge([`${base}/commits?`]);
        return fetchGraph(repository!, defaultBranch, branches, signal);
      }),
    [run, repository, base],
  );
  const loadInsights = useCallback(
    (fresh = false) =>
      run(setInsights, async (signal) => {
        if (fresh) await purge([`${base}/stats/code_frequency`, `${base}/stats/punch_card`]);
        return fetchInsights(repository!, signal);
      }),
    [run, repository, base],
  );
  const loadCommit = useCallback(
    (sha: string) =>
      run(keyed(setCommits, sha), (signal) => fetchCommitDetail(repository!, sha, signal)),
    [run, repository],
  );

  /**
   * Runs a background load only if it fits the quota while leaving AUTO_RESERVE requests for
   * scans. Cost counts only URLs that are not already cached. /rate_limit itself is free.
   */
  const withinBudget = useCallback(async (urls: string[]) => {
    const cost = await uncachedCount(urls);
    if (cost === 0) return { ok: true, note: "" };
    const quota = getQuota() ?? (await refreshQuota());
    if (!quota) return { ok: true, note: "" };
    const ok = quota.remaining - cost >= AUTO_RESERVE;
    return {
      ok,
      note: ok
        ? ""
        : `Paused automatic loading to save quota: ${quota.remaining} of ${quota.limit} GitHub requests left this hour, and ${AUTO_RESERVE} are kept for scans.`,
    };
  }, []);
  const autoRun = useCallback(
    async <T,>(
      urls: string[],
      set: (value: Loadable<T>) => void,
      load: () => Promise<unknown>,
    ) => {
      const budget = await withinBudget(urls);
      if (controller.current?.signal.aborted) return;
      if (budget.ok) void load();
      else set({ status: "idle", note: budget.note });
    },
    [withinBudget],
  );
  const issueUrls = [`${base}/issues?state=open&sort=updated&direction=desc&per_page=100`];
  const detailUrls = [
    `${base}/languages`,
    `${base}/contributors?per_page=30`,
    `${base}/releases?per_page=10`,
    `${base}/stats/commit_activity`,
  ];

  useEffect(() => {
    if (!repository || !autoLoad || started.current === repository) return;
    started.current = repository;
    void (async () => {
      await autoRun(issueUrls, setIssues, () => loadIssues(false));
      await autoRun(detailUrls, setDetails, () => loadDetails(false));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repository, autoLoad, loadIssues, loadDetails, autoRun]);

  /** Background graph + statistics for the Commits view, budget-checked like the rest. */
  const autoCommits = useCallback(
    (defaultBranch: string, branches: BranchRef[]) => {
      const graphUrls = [
        `${base}/commits?sha=${encodeURIComponent(defaultBranch)}&per_page=40`,
        ...branches.map((branch) => `${base}/commits?sha=${branch.tip}&per_page=15`),
      ];
      void (async () => {
        await autoRun(graphUrls, setGraph, () => loadGraph(defaultBranch, branches));
        await autoRun([`${base}/stats/code_frequency`, `${base}/stats/punch_card`], setInsights, () => loadInsights());
      })();
    },
    [autoRun, base, loadGraph, loadInsights],
  );

  return {
    issues,
    details,
    comments,
    pulls,
    loadIssues,
    loadDetails,
    loadComments,
    loadPull,
    more,
    loadMoreIssues,
    graph,
    insights,
    commits,
    loadGraph,
    loadInsights,
    loadCommit,
    autoCommits,
  };
}
