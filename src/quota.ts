export type Quota = { remaining: number; limit: number; reset: number };
let state: Quota | null = null;
const listeners = new Set<() => void>();

/** Remember GitHub's rate-limit headers from the latest response. */
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
  listeners.forEach((listener) => listener());
}
export const getQuota = () => state;
export function subscribeQuota(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function resetQuotaForTests() {
  state = null;
  listeners.forEach((listener) => listener());
}
