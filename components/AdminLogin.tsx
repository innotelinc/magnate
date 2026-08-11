"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LockIcon } from "./icons";

export default function AdminLogin() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
        className="w-full rounded-xl bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
