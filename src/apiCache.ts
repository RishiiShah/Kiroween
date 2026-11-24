import { quotaBlocked } from "./quota";

/**
 * Browser-side cache for public GitHub API GET responses.
 *
 * Repeated requests for the same repository within API_CACHE_TTL are answered locally,
 * so revisiting a repository does not spend the 60-requests-per-hour quota. Only HTTP 200
 * responses are stored; "still computing" (202), errors, and rate-limit replies never are.
 * Entries live in IndexedDB when available (large issue lists exceed localStorage limits)
 * with an in-memory layer in front; without IndexedDB the memory layer alone is used.
 */
export const API_CACHE_TTL = 45 * 60 * 1000;
export const CACHE_HIT_HEADER = "x-poltergeist-cache";
export const SAVED_AT_HEADER = "x-poltergeist-saved-at";
export const BLOCKED_HEADER = "x-poltergeist-blocked";
const MAX_ENTRIES = 400;
const DB = "poltergeist-api";
const STORE = "responses";

type Entry = { url: string; body: string; link: string | null; savedAt: number };

const memory = new Map<string, Entry>();
let database: Promise<IDBDatabase | null> | null = null;
let now = () => Date.now();

/** Test hook: replace the clock. */
export function setCacheClock(clock: () => number) {
  now = clock;
}

function open(): Promise<IDBDatabase | null> {
  if (database) return database;
  database = new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const request = indexedDB.open(DB, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE))
          request.result.createObjectStore(STORE, { keyPath: "url" });
      };
      request.onsuccess = () => {
        resolve(request.result);
        void prune(request.result);
      };
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return database;
}

function run<T>(db: IDBDatabase, mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) {
  return new Promise<T | undefined>((resolve) => {
    try {
      const request = action(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

const fresh = (entry: Entry | undefined): entry is Entry =>
  !!entry && now() - entry.savedAt >= 0 && now() - entry.savedAt < API_CACHE_TTL;

async function prune(db: IDBDatabase) {
  const all = (await run<Entry[]>(db, "readonly", (store) => store.getAll())) ?? [];
  const stale = all.filter((entry) => !fresh(entry));
  const overflow = all
    .filter(fresh)
    .sort((a, b) => b.savedAt - a.savedAt)
    .slice(MAX_ENTRIES);
  for (const entry of [...stale, ...overflow]) await run(db, "readwrite", (store) => store.delete(entry.url));
}

async function read(url: string): Promise<Entry | undefined> {
  const hot = memory.get(url);
  if (fresh(hot)) return hot;
  memory.delete(url);
  const db = await open();
  if (!db) return undefined;
  const entry = await run<Entry>(db, "readonly", (store) => store.get(url));
  if (fresh(entry)) {
    memory.set(url, entry);
    return entry;
  }
  return undefined;
}

async function write(entry: Entry) {
  memory.set(entry.url, entry);
  if (memory.size > MAX_ENTRIES) {
    const oldest = [...memory.values()].sort((a, b) => a.savedAt - b.savedAt)[0];
    memory.delete(oldest.url);
  }
  const db = await open();
  if (db) await run(db, "readwrite", (store) => store.put(entry));
}

/**
 * fetch() with the cache in front. Cached answers carry CACHE_HIT_HEADER and
 * SAVED_AT_HEADER and never carry rate-limit headers, so quota tracking ignores them.
 */
export async function cachedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  if (method === "GET") {
    const hit = await read(url);
    init.signal?.throwIfAborted();
    if (hit)
      return new Response(hit.body, {
        status: 200,
        headers: {
          "content-type": "application/json",
          ...(hit.link ? { link: hit.link } : {}),
          [CACHE_HIT_HEADER]: "hit",
          [SAVED_AT_HEADER]: String(hit.savedAt),
        },
      });
  }
  // Once GitHub reports the hourly quota as spent, answer API calls locally until it resets
  // instead of sending requests that can only fail.
  const blocked = url.startsWith("https://api.github.com/") ? quotaBlocked() : null;
  if (blocked)
    return new Response("{}", {
      status: 403,
      headers: {
        "x-ratelimit-remaining": "0",
        "x-ratelimit-limit": String(blocked.limit),
        "x-ratelimit-reset": String(blocked.reset),
        [BLOCKED_HEADER]: "1",
      },
    });
  const response = await fetch(url, init);
  if (method === "GET" && response.status === 200) {
    try {
      const body = await response.clone().text();
      void write({ url, body, link: response.headers.get("link"), savedAt: now() }).catch(() => {});
    } catch {
      /* Uncacheable body; the live response is still returned. */
    }
  }
  return response;
}

export const isCacheHit = (response: Response) => response.headers.get(CACHE_HIT_HEADER) === "hit";
/** True when no network request was made (cache hit or local quota block). */
export const isLocal = (response: Response) =>
  isCacheHit(response) || response.headers.get(BLOCKED_HEADER) === "1";
export function savedAt(response: Response): number | null {
  const value = Number(response.headers.get(SAVED_AT_HEADER));
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Removes cached responses whose URL starts with any prefix (for explicit refreshes). */
export async function purge(prefixes: string[]) {
  const matches = (url: string) => prefixes.some((prefix) => url.startsWith(prefix));
  for (const url of [...memory.keys()]) if (matches(url)) memory.delete(url);
  const db = await open();
  if (!db) return;
  const all = (await run<Entry[]>(db, "readonly", (store) => store.getAll())) ?? [];
  for (const entry of all) if (matches(entry.url)) await run(db, "readwrite", (store) => store.delete(entry.url));
}

export async function clearApiCache() {
  memory.clear();
  const db = await open();
  if (db) await run(db, "readwrite", (store) => store.clear());
}

/** How many of these URLs would actually hit the network right now. */
export async function uncachedCount(urls: string[]): Promise<number> {
  let count = 0;
  for (const url of urls) if (!(await read(url))) count++;
  return count;
}
