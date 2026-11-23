import { useCallback, useEffect, useRef, useState } from "react";
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

/** On-demand GitHub reads for one repository. Everything resets when the repository changes. */
export function useCommunity(repository: string | undefined) {
  const [issues, setIssues] = useState<Loadable<IssueList>>(idle);
  const [details, setDetails] = useState<Loadable<Details>>(idle);
  const [comments, setComments] = useState<Record<number, Loadable<CommentList>>>({});
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    const own = new AbortController();
    controller.current?.abort();
    controller.current = own;
    setIssues(idle);
    setDetails(idle);
    setComments({});
    return () => own.abort();
  }, [repository]);

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
