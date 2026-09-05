"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LockIcon } from "./icons";

export default function AdminLogin({ ssoEnabled = false }: { ssoEnabled?: boolean }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function handleSso(e: React.MouseEvent) {
    e.preventDefault();
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

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="admin-password" className="mb-1.5 block text-sm font-medium text-zinc-800 dark:text-zinc-300">
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
        className="w-full rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-600/30 transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Signing in…" : "Sign in"}
      </button>

      {ssoEnabled && (
        <>
          <div className="flex items-center gap-3 py-1">
            <div className="h-px flex-1 bg-zinc-950/10 dark:bg-white/10" />
            <span className="text-xs uppercase tracking-wide text-zinc-500">or</span>
            <div className="h-px flex-1 bg-zinc-950/10 dark:bg-white/10" />
          </div>

          <button
            type="button"
            onClick={handleSso}
            className="w-full rounded-xl border border-zinc-950/10 bg-white py-3 text-sm font-semibold text-zinc-800 shadow-sm transition-all hover:bg-zinc-50 dark:border-white/15 dark:bg-white/[0.04] dark:text-white dark:hover:bg-white/[0.08]"
          >
            Sign in with Cerulean
          </button>
        </>
      )}
    </form>
  );
}
