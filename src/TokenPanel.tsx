import { useState, useSyncExternalStore } from "react";
import { forgetQuota, refreshQuota } from "./quota";
import { hasToken, isValidToken, setToken, subscribeToken } from "./token";
import { Icon } from "./ui";

/** Optional token entry. The value lives only in memory for this tab. */
export function TokenPanel({ onNotice }: { onNotice: (message: string) => void }) {
  const active = useSyncExternalStore(subscribeToken, hasToken, () => false);
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  function apply(event: React.FormEvent) {
    event.preventDefault();
    if (!isValidToken(value)) {
      setError("That does not look like a GitHub token (ghp_…, github_pat_…).");
      return;
    }
    setToken(value);
    setValue("");
    setError("");
    forgetQuota();
    void refreshQuota(true);
    onNotice("Token in use for this tab. GitHub allows up to 5,000 requests an hour with it.");
  }
  function forget() {
    setToken(null);
    forgetQuota();
    void refreshQuota(true);
    onNotice("Token forgotten. Back to 60 anonymous requests an hour.");
  }
  return (
    <div className="token-panel">
      {active ? (
        <>
          <p className="token-status">
            <Icon name="shield" size={14} /> Token active for this tab
          </p>
          <button type="button" className="menu-item danger" onClick={forget}>
            <Icon name="trash" size={15} />
            Forget token
          </button>
        </>
      ) : (
        <form onSubmit={apply} className="token-form">
          <label className="sr-only" htmlFor="gh-token">
            GitHub token
          </label>
          <input
            id="gh-token"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="github_pat_… (optional)"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
          <button className="btn btn-plain" disabled={!value}>
            Use for this tab
          </button>
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
        </form>
      )}
      <p className="menu-note">
        Optional. Raises the limit from 60 to 5,000 requests an hour. Kept in memory only, never
        saved or exported, and sent only to api.github.com. A fine-grained token with no extra
        permissions is enough; private repositories are still refused.
      </p>
    </div>
  );
}
