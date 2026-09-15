"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LockIcon } from "./icons";

export default function AdminLogin({
  ssoEnabled = false,
  breakglass = false,
}: {
  ssoEnabled?: boolean;
  /** True only when BREAKGLASS_LOGIN=1 — see lib/auth.ts. */
  breakglass?: boolean;
}) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function handleSso(e: React.MouseEvent) {
    e.preventDefault();
    // Full document navigation on purpose: this is an API route that 302s to
    // Authentik and sets the PKCE cookies, so the router must not intercept it.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/api/auth/authentik/login";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Login failed.");
        setLoading(false);
        return;
      }
      router.push("/admin");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  // SSO is the only way in normally. Say so plainly rather than rendering a
  // sign-in page with nothing actionable (which is what an unconfigured
  // Authentik plus a disabled password path would otherwise look like).
  const nothingUsable = !ssoEnabled && !breakglass;

  return (
    <div className="space-y-4">
      {ssoEnabled && (
        <button
          type="button"
          onClick={handleSso}
          className="w-full rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-600/30 transition-all hover:brightness-110"
        >
          Sign in with Cerulean
        </button>
      )}

      {nothingUsable && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          Authentik SSO is not configured on this deployment and password
          sign-in is disabled. Set the <code>AUTHENTIK_*</code> variables, or
          set <code>BREAKGLASS_LOGIN=1</code> for recovery.
        </div>
      )}

      {breakglass && (
        <form onSubmit={handleSubmit} className="space-y-4">
          {ssoEnabled && (
            <div className="flex items-center gap-3 py-1">
              <div className="h-px flex-1 bg-zinc-950/10 dark:bg-white/10" />
              <span className="text-xs uppercase tracking-wide text-zinc-500">
                break-glass
              </span>
              <div className="h-px flex-1 bg-zinc-950/10 dark:bg-white/10" />
            </div>
          )}

          <div>
            <label
              htmlFor="admin-password"
              className="mb-1.5 block text-sm font-medium text-zinc-800 dark:text-zinc-300"
            >
              Admin password
            </label>
            <div className="relative">
              <LockIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600 dark:text-zinc-500" />
              <input
                id="admin-password"
                type="password"
                required
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-zinc-950/10 bg-black/[0.04] py-3 pl-10 pr-4 text-sm text-zinc-950 placeholder-zinc-400 outline-none transition-colors focus:border-brand-400 focus:ring-2 focus:ring-brand-500/30 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder-zinc-600"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-600 dark:text-rose-300">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl border border-zinc-950/10 bg-white py-3 text-sm font-semibold text-zinc-800 shadow-sm transition-all hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/15 dark:bg-white/[0.04] dark:text-white dark:hover:bg-white/[0.08]"
          >
            {loading ? "Signing in…" : "Sign in with password"}
          </button>

          <p className="text-xs text-zinc-500 dark:text-zinc-500">
            Break-glass sign-in is on because <code>BREAKGLASS_LOGIN</code> is
            set. Unset it and restart to return to Authentik-only.
          </p>
        </form>
      )}
    </div>
  );
}
