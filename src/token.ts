/**
 * Optional personal GitHub token, held in memory for this tab only.
 *
 * Never written to storage, reports, logs, or caches. Attached only to requests for
 * https://api.github.com/. Public-repository restrictions still apply: the scan refuses
 * private repositories even when a token could read them.
 */
const PATTERN = /^(gh[pousr]_[A-Za-z0-9_]{20,255}|github_pat_[A-Za-z0-9_]{20,255})$/;
let token: string | null = null;
const listeners = new Set<() => void>();

export const isValidToken = (value: string) => PATTERN.test(value.trim());
export function setToken(value: string | null) {
  const next = value && isValidToken(value) ? value.trim() : null;
  token = next;
  listeners.forEach((listener) => listener());
  return next !== null;
}
export const hasToken = () => token !== null;
export function subscribeToken(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
/** Headers to add for a request; empty unless the URL is the GitHub REST API. */
export function authFor(url: string): Record<string, string> {
  return token && url.startsWith("https://api.github.com/") ? { Authorization: `Bearer ${token}` } : {};
}
