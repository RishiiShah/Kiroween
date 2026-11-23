import { useEffect, useRef, useState } from "react";
import {
  isSnapshot,
  parseRepository,
  type Finding,
  type Snapshot,
} from "./scan";

export type Review = { note: string; reviewed: boolean };
export type Reviews = Record<string, Review>;
const STORAGE = "poltergeist.reviews.v1";
export const REVIEW_LIMIT = 200;
export const reviewKey = (repository: string, finding: Finding) =>
  JSON.stringify([repository, finding.id, finding.source]);

export function isReviews(value: unknown): value is Reviews {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const entries = Object.entries(value);
  if (entries.length > REVIEW_LIMIT) return false;
  return entries.every(([key, entry]) => {
    try {
      const parts: unknown = JSON.parse(key);
      if (
        !Array.isArray(parts) ||
        parts.length !== 3 ||
        !parts.every((part) => typeof part === "string")
      )
        return false;
      const [repository, id, source] = parts as string[];
      if (
        parseRepository(`https://github.com/${repository}`) !== repository ||
        !id ||
        id.length > 4000
      )
        return false;
      const url = new URL(source);
      return (
        url.origin === "https://github.com" &&
        !url.username &&
        !url.password &&
        url.pathname.startsWith(`/${repository}/`) &&
        !!entry &&
        typeof entry === "object" &&
        typeof entry.note === "string" &&
        entry.note.length <= 2000 &&
        typeof entry.reviewed === "boolean"
      );
    } catch {
      return false;
    }
  });
}

export function reportReviews(snapshot: Snapshot, reviews: Reviews): Reviews {
  return Object.fromEntries(
    snapshot.findings.flatMap((finding) => {
      const key = reviewKey(snapshot.repository, finding);
      return reviews[key] ? [[key, reviews[key]]] : [];
    }),
  );
}

export function parseReport(text: string): {
  snapshot: Snapshot;
  reviews: Reviews;
} {
  if (text.length > 2 * 1024 * 1024)
    throw new Error("Report must be at most 2 MiB.");
  const value: unknown = JSON.parse(text);
  if (!isSnapshot(value))
    throw new Error("This file is not a valid Poltergeist snapshot.");
  const reviews: unknown =
    (value as Snapshot & { localReviews?: unknown }).localReviews ?? {};
  if (!isReviews(reviews))
    throw new Error("Report contains invalid review notes.");
  const allowed = new Set(
    value.findings.map((finding) => reviewKey(value.repository, finding)),
  );
  if (Object.keys(reviews).some((key) => !allowed.has(key)))
    throw new Error("Review notes do not belong to this snapshot.");
  return { snapshot: value, reviews };
}

export function useReviews() {
  const [initial] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE);
      const records: unknown = raw ? JSON.parse(raw) : {};
      if (!isReviews(records)) throw new Error("Invalid notes");
      return { records, writable: true };
    } catch {
      return { records: {} as Reviews, writable: false };
    }
  });
  const [reviews, setReviews] = useState<Reviews>(initial.records);
  const [message, setMessage] = useState(
    initial.writable
      ? "Notes stay in this browser."
      : "Existing notes could not be read. New notes stay in this session; export a report to keep them.",
  );
  const latest = useRef(reviews);
  const dirty = useRef(false);

  function flush(notify = true) {
    if (!dirty.current || !initial.writable) return;
    try {
      localStorage.setItem(STORAGE, JSON.stringify(latest.current));
      dirty.current = false;
      if (notify) setMessage("Saved locally.");
    } catch {
      if (notify)
        setMessage(
          "Notes kept for this session. Export a report to keep a copy.",
        );
    }
  }
  useEffect(() => {
    const timer = setTimeout(flush, 300);
    return () => clearTimeout(timer);
  }, [reviews]);
  useEffect(() => {
    const save = () => flush(false);
    window.addEventListener("pagehide", save);
    return () => {
      window.removeEventListener("pagehide", save);
      flush(false);
    };
  }, []);

  function merge(imported: Reviews) {
    const next = { ...imported, ...latest.current };
    if (Object.keys(next).length > REVIEW_LIMIT)
      throw new Error(
        "Local review limit reached (200). Existing notes are preserved.",
      );
    latest.current = next;
    dirty.current = true;
    setReviews(next);
    setMessage(
      initial.writable
        ? "Saving…"
        : "Notes kept for this session. Export a report to keep a copy.",
    );
  }
  function update(key: string, patch: Partial<Review>) {
    const next = {
      ...latest.current,
      [key]: {
        ...(latest.current[key] || { note: "", reviewed: false }),
        ...patch,
      },
    };
    if (!next[key].note && !next[key].reviewed) delete next[key];
    if (!isReviews(next)) {
      setMessage(
        "Note limit reached: 200 findings, 2,000 characters per note. Existing notes are preserved.",
      );
      return;
    }
    latest.current = next;
    dirty.current = true;
    setReviews(next);
    setMessage(
      initial.writable
        ? "Saving…"
        : "Notes kept for this session. Export a report to keep a copy.",
    );
  }
  return { reviews, message, update, merge };
}
