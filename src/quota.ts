export type Quota = { remaining: number; limit: number; reset: number };
const KEY = "poltergeist.quota.v1";
const listeners = new Set<() => void>();

function restore(): Quota | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) || "null");
    if (
      value &&
      typeof value === "object" &&
      ["remaining", "limit", "reset"].every((key) => Number.isFinite((value as Record<string, number>)[key])) &&
      (value as Quota).reset * 1000 > Date.now()
    )
      return value as Quota;
  } catch {
    /* storage unavailable */
  }
  return null;
}
let state: Quota | null = restore();

/** Remember GitHub's rate-limit headers from the latest live response (persisted until reset). */
export function recordQuota(headers: Headers) {
  const read = (name: string) => {
    const value = headers.get(name);
    return value === null || value === "" ? NaN : Number(value);
  };
  const remaining = read("x-ratelimit-remaining");
  const limit = read("x-ratelimit-limit");
  const reset = read("x-ratelimit-reset");
  if (!Number.isFinite(remaining) || !Number.isFinite(limit)) return;
  state = { remaining, limit, reset: Number.isFinite(reset) ? reset : 0 };
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable; the in-memory value still applies */
  }
  listeners.forEach((listener) => listener());
}
export const getQuota = () => {
  if (state && state.reset && state.reset * 1000 <= Date.now()) state = null;
  return state;
};
/** The quota GitHub last reported as exhausted, while its reset time is still ahead. */
export function quotaBlocked(): Quota | null {
  const quota = getQuota();
  return quota && quota.remaining <= 0 && quota.reset * 1000 > Date.now() ? quota : null;
}
export function subscribeQuota(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function resetQuotaForTests() {
  state = null;
  lastCheck = 0;
  pending = null;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  listeners.forEach((listener) => listener());
}

/** Requests kept free for scans: automatic background loads never dip below this. */
export const AUTO_RESERVE = 10;
let lastCheck = 0;
let pending: Promise<Quota | null> | null = null;

/**
 * Reads the current quota from GitHub's /rate_limit endpoint, which GitHub documents as not
 * counting against the rate limit. Checked at most once a minute.
 */
export function refreshQuota(force = false): Promise<Quota | null> {
  if (pending) return pending;
  if (!force && Date.now() - lastCheck < 60_000) return Promise.resolve(getQuota());
  lastCheck = Date.now();
  pending = (async () => {
    try {
      const response = await fetch("https://api.github.com/rate_limit", {
        headers: { Accept: "application/vnd.github+json" },
        credentials: "omit",
        referrerPolicy: "no-referrer",
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) return getQuota();
      const body = (await response.json()) as { resources?: { core?: Record<string, unknown> } };
      const core = body.resources?.core;
      if (core && [core.remaining, core.limit, core.reset].every((v) => typeof v === "number"))
        recordQuota(
          new Headers({
            "x-ratelimit-remaining": String(core.remaining),
            "x-ratelimit-limit": String(core.limit),
            "x-ratelimit-reset": String(core.reset),
          }),
        );
    } catch {
      /* offline or blocked: keep what we know */
    } finally {
      pending = null;
    }
    return getQuota();
  })();
  return pending;
}
