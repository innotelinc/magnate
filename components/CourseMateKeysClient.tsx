"use client";

import { useState } from "react";

export interface CourseMatePlanOption {
  slug: string;
  name: string;
  description: string | null;
  pricePerKeyCents: number;
  features: string[];
}

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function CourseMateKeysClient({
  plans,
  minutes,
  maxKeys,
}: {
  plans: CourseMatePlanOption[];
  minutes: number;
  maxKeys: number;
}) {
  const [planSlug, setPlanSlug] = useState(plans[0]?.slug ?? "");
  const [keys, setKeys] = useState(1);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const plan = plans.find((p) => p.slug === planSlug) ?? plans[0];
  const total = (plan?.pricePerKeyCents ?? 0) * keys;

  async function buy() {
    if (!plan) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/coursemate/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planSlug: plan.slug, email, keys }),
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
        Keys aren&apos;t priced yet — check back shortly.
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
              aria-pressed={selected}
              className={`glass flex flex-col rounded-2xl p-5 text-left transition-all ${
                selected
                  ? "ring-2 ring-brand-500 shadow-lg shadow-brand-600/20"
                  : "hover:border-zinc-950/25 dark:hover:border-white/25"
              }`}
            >
              <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {option.name}
              </span>
              <span className="mt-2 text-2xl font-bold tracking-tight">
                {money(option.pricePerKeyCents)}
              </span>
              <span className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                per key · {minutes} min session
              </span>
              {option.description ? (
                <span className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
                  {option.description}
                </span>
              ) : null}
              {option.features.length > 0 ? (
                <ul className="mt-3 space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
                  {option.features.map((feature) => (
                    <li key={feature}>· {feature}</li>
                  ))}
                </ul>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="glass space-y-4 rounded-3xl p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-zinc-600 dark:text-zinc-400">
              Where to send the receipt
            </span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              className="mt-1 w-full rounded-xl border border-zinc-950/15 bg-white/70 px-3 py-2 text-zinc-900 outline-none focus:border-brand-500 dark:border-white/15 dark:bg-black/30 dark:text-zinc-100"
            />
          </label>
          <label className="block text-sm">
            <span className="text-zinc-600 dark:text-zinc-400">Keys</span>
            <select
              value={keys}
              onChange={(event) => setKeys(Number(event.target.value))}
              className="mt-1 w-full rounded-xl border border-zinc-950/15 bg-white/70 px-3 py-2 text-zinc-900 outline-none focus:border-brand-500 dark:border-white/15 dark:bg-black/30 dark:text-zinc-100"
            >
              {Array.from({ length: maxKeys }, (_, index) => index + 1).map(
                (count) => (
                  <option key={count} value={count}>
                    {count}
                  </option>
                ),
              )}
            </select>
          </label>
        </div>

        {error ? (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {keys} × {money(plan?.pricePerKeyCents ?? 0)} ={" "}
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">
              {money(total)}
            </span>
          </p>
          <button
            type="button"
            onClick={buy}
            disabled={busy || !email}
            className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Starting checkout…" : "Buy key"}
          </button>
        </div>
      </div>
    </div>
  );
}
