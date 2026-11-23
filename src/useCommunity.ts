import { useCallback, useEffect, useRef, useState } from "react";
import { getQuota } from "./quota";
import {
  fetchComments,
  fetchDetails,
  fetchIssues,
  type Details,
  type Issue,
  type IssueComment,
} from "./community";

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
 * With autoLoad, open issues and pull requests (one request) load as soon as a
 * repository is shown, unless GitHub already reported an exhausted quota.
 */
export function useCommunity(repository: string | undefined, autoLoad = false) {
  const [issues, setIssues] = useState<Loadable<IssueList>>(idle);
  const [details, setDetails] = useState<Loadable<Details>>(idle);
  const [comments, setComments] = useState<Record<number, Loadable<CommentList>>>({});
  const controller = useRef<AbortController | null>(null);
  const autoStart = useRef<() => void>(() => {});

  useEffect(() => {
    const own = new AbortController();
    controller.current?.abort();
    controller.current = own;
    setIssues(idle);
    setDetails(idle);
    setComments({});
    const quota = getQuota();
    if (repository && autoLoad && (!quota || quota.remaining > 0)) autoStart.current();
    return () => own.abort();
  }, [repository, autoLoad]);

  const loadIssues = useCallback(async () => {
    const signal = controller.current?.signal;
    if (!repository || !signal) return;
    setIssues({ status: "loading" });
    try {
      const data = await fetchIssues(repository, signal);
      if (!signal.aborted) setIssues({ status: "ready", data });
    } catch (error) {
      if (!signal.aborted) setIssues({ status: "error", error: message(error) });
    }
  }, [repository]);

  autoStart.current = () => void loadIssues();

  const loadDetails = useCallback(async () => {
    const signal = controller.current?.signal;
    if (!repository || !signal) return;
    setDetails({ status: "loading" });
    try {
      const data = await fetchDetails(repository, signal);
      if (!signal.aborted) setDetails({ status: "ready", data });
    } catch (error) {
      if (!signal.aborted) setDetails({ status: "error", error: message(error) });
    }
  }, [repository]);

  const loadComments = useCallback(
    async (number: number) => {
      const signal = controller.current?.signal;
      if (!repository || !signal) return;
      setComments((all) => ({ ...all, [number]: { status: "loading" } }));
      try {
        const data = await fetchComments(repository, number, signal);
        if (!signal.aborted)
          setComments((all) => ({ ...all, [number]: { status: "ready", data } }));
      } catch (error) {
        if (!signal.aborted)
          setComments((all) => ({
            ...all,
            [number]: { status: "error", error: message(error) },
          }));
      }
    },
    [repository],
  );

  return { issues, details, comments, loadIssues, loadDetails, loadComments };
}
