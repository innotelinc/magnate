"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LockIcon, KeyIcon, ArrowRightIcon, CheckIcon } from "./icons";

const USERNAME_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9._-]{1,30}[a-zA-Z0-9])?$/;

interface Props {
  plan: {
    name: string;
    slug: string;
    priceMonthlyCents: number;
    priceYearlyCents: number;
  };
  interval: "month" | "year";
}

export default function SignupForm({ plan, interval }: Props) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const priceCents =
    interval === "month" ? plan.priceMonthlyCents : plan.priceYearlyCents;
  const price = priceCents / 100;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!USERNAME_RE.test(username) || username.length < 3 || username.length > 32) {
      setError(
        "Username must be 3–32 characters using letters, numbers, dots, dashes or underscores.",
      );
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planSlug: plan.slug,
          interval,
          email,
          username,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        setLoading(false);
        return;
      }
      // data.url points at Stripe's hosted checkout
      if (data.url) {
        router.push(data.url);
      } else {
        setError("Checkout could not be started. Please try again.");
        setLoading(false);
      }
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Plan summary */}
      <div className="flex items-center justify-between rounded-xl border border-zinc-950/10 bg-black/[0.03] px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
        <div>
          <p className="text-sm font-semibold">{plan.name}</p>
          <p className="text-xs text-zinc-600 dark:text-zinc-500">
            {interval === "month" ? "Monthly" : "Yearly"} billing
          </p>
        </div>
        <p className="text-lg font-bold">
          ${price % 1 === 0 ? price.toFixed(0) : price.toFixed(2)}
          <span className="text-xs font-normal text-zinc-600 dark:text-zinc-500">
            /{interval === "month" ? "mo" : "yr"}
          </span>
        </p>
      </div>

      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-zinc-800 dark:text-zinc-300">
          Email address
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-xl border border-zinc-950/10 bg-black/[0.04] px-4 py-3 text-sm text-zinc-950 placeholder-zinc-400 outline-none transition-colors focus:border-brand-400 focus:ring-2 focus:ring-brand-500/30 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder-zinc-600"
        />
      </div>

      <div>
        <label htmlFor="username" className="mb-1.5 block text-sm font-medium text-zinc-800 dark:text-zinc-300">
          Desired username
        </label>
        <input
          id="username"
          type="text"
          required
          autoComplete="username"
          placeholder="e.g. movielover"
          value={username}
          onChange={(e) => setUsername(e.target.value.trim())}
          className="w-full rounded-xl border border-zinc-950/10 bg-black/[0.04] px-4 py-3 text-sm text-zinc-950 placeholder-zinc-400 outline-none transition-colors focus:border-brand-400 focus:ring-2 focus:ring-brand-500/30 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder-zinc-600"
        />
        <p className="mt-1.5 text-xs text-zinc-600 dark:text-zinc-500">
          This will be your Jellyfin username — 3–32 characters.
        </p>
      </div>

      <div className="flex items-start gap-2.5 rounded-xl border border-brand-400/20 bg-brand-500/[0.07] px-4 py-3">
        <KeyIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand-600 dark:text-brand-300" />
        <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
          We&apos;ll generate a <span className="text-zinc-900 dark:text-zinc-200">strong password</span>{" "}
          for you and show it <span className="text-zinc-900 dark:text-zinc-200">once</span> after
          payment. Save it immediately — you can reset it later via the account
          portal.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-600 dark:text-rose-300">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="group flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition-all hover:shadow-indigo-500/50 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? (
          <>
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            Redirecting to Stripe…
          </>
        ) : (
          <>
            Continue to payment
            <ArrowRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </>
        )}
      </button>

      <p className="flex items-center justify-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-500">
        <LockIcon className="h-3.5 w-3.5" />
        Payments secured by Stripe · Cancel anytime
      </p>

      <p className="flex items-center justify-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-600">
        <CheckIcon className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
        No hidden fees · No contracts
      </p>
    </form>
  );
}
