"use client";

import { useState } from "react";

export interface SagePlanOption {
  slug: string;
  name: string;
  description: string | null;
  pricePerUnitCents: number;
  features: string[];
}

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function SageSessionsClient({
  plans,
  minutes,
  maxSessions,
}: {
  plans: SagePlanOption[];
  minutes: number;
  maxSessions: number;
}) {
  const [planSlug, setPlanSlug] = useState(plans[0]?.slug ?? "");
  const [sessions, setSessions] = useState(1);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const plan = plans.find((p) => p.slug === planSlug) ?? plans[0];
  const total = (plan?.pricePerUnitCents ?? 0) * sessions;

  async function buy() {
    if (!plan) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/sage/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planSlug: plan.slug, email, sessions }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setError(data.error ?? "Could not start the checkout.");
        setBusy(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Could not reach the checkout. Try again.");
      setBusy(false);
    }
  }

  if (plans.length === 0) {
    return (
      <div className="glass rounded-3xl p-8 text-center text-zinc-600 dark:text-zinc-400">
        Sessions aren&apos;t priced yet — check back shortly.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        {plans.map((option) => {
          const selected = option.slug === plan?.slug;
          return (
            <button
              key={option.slug}
              type="button"
              onClick={() => setPlanSlug(option.slug)}
              className={`glass flex flex-col rounded-2xl p-5 text-left transition-all ${
                selected
                  ? "ring-2 ring-brand-500 shadow-lg shadow-brand-600/20"
                  : "hover:border-zinc-950/25 dark:hover:border-white/25"
              }`}
            >
              <span className="text-sm font-semibold">{option.name}</span>
              <span className="mt-2 text-3xl font-bold tracking-tight">
                {money(option.pricePerUnitCents)}
              </span>
              <span className="mt-1 text-xs text-zinc-600 dark:text-zinc-500">
                per {minutes}-minute session
              </span>
              {option.description && (
                <span className="mt-3 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                  {option.description}
                </span>
              )}
              <ul className="mt-3 space-y-1.5 text-xs text-zinc-600 dark:text-zinc-400">
                {option.features.slice(0, 4).map((feature) => (
                  <li key={feature} className="flex gap-1.5">
                    <span className="text-brand-500">·</span>
                    {feature}
                  </li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>

      <div className="glass space-y-4 rounded-2xl p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Sessions
            </span>
            <select
              value={sessions}
              onChange={(event) => setSessions(Number(event.target.value))}
              className="mt-1.5 w-full rounded-lg border border-zinc-950/10 bg-black/[0.04] px-3 py-2.5 text-sm outline-none focus:border-brand-400 dark:border-white/10 dark:bg-white/[0.05]"
            >
              {Array.from({ length: maxSessions }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n} session{n === 1 ? "" : "s"} — {money((plan?.pricePerUnitCents ?? 0) * n)}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Email for the receipt
            </span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              className="mt-1.5 w-full rounded-lg border border-zinc-950/10 bg-black/[0.04] px-3 py-2.5 text-sm outline-none focus:border-brand-400 dark:border-white/10 dark:bg-white/[0.05]"
            />
          </label>
        </div>

        {error && (
          <p className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Total <span className="font-semibold text-zinc-950 dark:text-white">{money(total)}</span>{" "}
            — keys are minted the moment payment confirms.
          </p>
          <button
            type="button"
            disabled={busy || !email}
            onClick={buy}
            className="rounded-full bg-zinc-950 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {busy ? "Opening checkout…" : `Buy ${sessions} session${sessions === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </div>
  );
}
