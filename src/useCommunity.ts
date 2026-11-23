import { useCallback, useEffect, useRef, useState } from "react";
import { getQuota } from "./quota";
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
};
export type IssueList = { items: Issue[]; more: boolean; fetchedAt: string };
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

  const loadIssues = useCallback(
    () => run(setIssues, (signal) => fetchIssues(repository!, signal)),
    [run, repository],
  );
  const loadDetails = useCallback(
    () => run(setDetails, (signal) => fetchDetails(repository!, signal)),
    [run, repository],
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
    (defaultBranch: string, branches: BranchRef[]) =>
      run(setGraph, (signal) => fetchGraph(repository!, defaultBranch, branches, signal)),
    [run, repository],
  );
  const loadInsights = useCallback(
    () => run(setInsights, (signal) => fetchInsights(repository!, signal)),
    [run, repository],
  );
  const loadCommit = useCallback(
    (sha: string) =>
      run(keyed(setCommits, sha), (signal) => fetchCommitDetail(repository!, sha, signal)),
    [run, repository],
  );

  useEffect(() => {
    if (!repository || !autoLoad || started.current === repository) return;
    const quota = getQuota();
    if (quota && quota.remaining <= 0) return;
    started.current = repository;
    void loadIssues();
    void loadDetails();
  }, [repository, autoLoad, loadIssues, loadDetails]);

  return {
    issues,
    details,
    comments,
    pulls,
    loadIssues,
    loadDetails,
    loadComments,
    loadPull,
    graph,
    insights,
    commits,
    loadGraph,
    loadInsights,
    loadCommit,
  };
}
