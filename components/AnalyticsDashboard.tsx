"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ChartIcon,
  CrownIcon,
  LinkIcon,
  RefreshIcon,
  WandIcon,
} from "./icons";

/* ---------- types ---------- */

interface AtRiskUser {
  user_id: number;
  username: string;
  email: string;
  plan_name: string | null;
  status: string;
  payment_failed_count: number;
  last_payment_failed_at: string | null;
  current_period_end: number | null;
  score: number;
  level: "low" | "medium" | "high";
  signals: string[];
}

interface Recommendation {
  title: string;
  why: string;
}

interface Analytics {
  totals: {
    users: number;
    active: number;
    pending: number;
    pastDue: number;
    unpaid: number;
    cancelled30d: number;
  };
  mrrCents: number;
  planBreakdown: Array<{ name: string; count: number }>;
  signupsByDay: Array<{ day: string; count: number }>;
  revenueByDay: Array<{ day: string; amountCents: number }>;
  churnRatePct: number;
  atRisk: AtRiskUser[];
  recentSignups: Array<{
    id: number;
    username: string;
    email: string;
    plan_name: string | null;
    created_at: string;
  }>;
}

/* ---------- helpers ---------- */

const money = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);

const LEVEL_STYLES: Record<string, string> = {
  low: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/30 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/30",
  medium:
    "bg-amber-500/10 text-amber-600 ring-amber-500/30 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/30",
  high: "bg-rose-500/10 text-rose-600 ring-rose-500/30 dark:bg-rose-400/10 dark:text-rose-300 dark:ring-rose-400/30",
};

const STATUS_STYLES: Record<string, string> = {
  active:
    "bg-emerald-500/10 text-emerald-600 ring-emerald-500/30 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/30",
  past_due:
    "bg-orange-500/10 text-orange-600 ring-orange-500/30 dark:bg-orange-400/10 dark:text-orange-300 dark:ring-orange-400/30",
  unpaid:
    "bg-rose-500/10 text-rose-600 ring-rose-500/30 dark:bg-rose-400/10 dark:text-rose-300 dark:ring-rose-400/30",
};

/** Tiny SVG bar chart — no chart dependency needed. */
function BarChart({
  data,
  format,
  height = 96,
}: {
  data: Array<{ day: string; value: number }>;
  format: (v: number) => string;
  height?: number;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const width = 560;
  const barW = Math.max(4, width / data.length - 4);
  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-24 w-full"
        role="img"
      >
        {data.map((d, i) => {
          const h = (d.value / max) * (height - 14);
          const x = i * (barW + 4);
          return (
            <g key={d.day}>
              <title>{`${d.day}: ${format(d.value)}`}</title>
              <rect
                x={x}
                y={height - h}
                width={barW}
                height={Math.max(2, h)}
                rx={2}
                className="fill-brand-500/70 dark:fill-brand-400/70"
              />
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-zinc-500">
        <span>{data[0]?.day ?? ""}</span>
        <span>{data[data.length - 1]?.day ?? ""}</span>
      </div>
    </div>
  );
}

/* ---------- component ---------- */

export default function AnalyticsDashboard() {
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // user_id + ":" + action
  const [recsFor, setRecsFor] = useState<AtRiskUser | null>(null);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [recError, setRecError] = useState<string | null>(null);
  const [recLoading, setRecLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/analytics");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load analytics");
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analytics");
    }
  }, []);

  useEffect(() => {
    // Defer the first load so we don't synchronously set state in the effect.
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function runWinback(user: AtRiskUser) {
    setBusy(`w:${user.user_id}`);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/winback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.user_id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to create winback offer");
      setNotice(
        `Winback offer created for ${user.username} — sharing the Stripe link in a new tab.`,
      );
      window.open(json.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Winback failed");
    } finally {
      setBusy(null);
    }
  }

  async function runRecommendations(user: AtRiskUser) {
    setRecsFor(user);
    setRecLoading(true);
    setRecError(null);
    setRecs([]);
    try {
      const res = await fetch("/api/admin/recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: user.username }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to generate watchlist");
      setRecs(json.recommendations ?? []);
    } catch (err) {
      setRecError(err instanceof Error ? err.message : "Recommendations failed");
    } finally {
      setRecLoading(false);
    }
  }

  if (error) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <p className="text-sm text-rose-600 dark:text-rose-300">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto flex max-w-6xl items-center justify-center px-4 py-24 sm:px-6">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-950/15 border-t-brand-400 dark:border-white/10" />
      </div>
    );
  }

  const atRiskCount = data.atRisk.filter((r) => r.level === "high").length;
  const revenue14 = data.revenueByDay.slice(-14).map((d) => ({
    day: d.day.slice(5),
    value: d.amountCents / 100,
  }));
  const signups14 = data.signupsByDay.slice(-14).map((d) => ({
    day: d.day.slice(5),
    value: d.count,
  }));

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight">
            <ChartIcon className="h-6 w-6 text-brand-600 dark:text-brand-300" />
            Analytics
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Revenue, subscribers and churn — derived from your local billing data.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin"
            className="rounded-lg border border-zinc-950/15 px-3.5 py-2 text-sm font-medium transition-colors hover:border-zinc-950/30 dark:border-white/15 dark:hover:border-white/30"
          >
            ← Dashboard
          </Link>
          <button
            onClick={load}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-950/15 px-3.5 py-2 text-sm font-medium transition-colors hover:border-zinc-950/30 dark:border-white/15 dark:hover:border-white/30"
          >
            <RefreshIcon className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {notice && (
        <div className="mt-4 rounded-xl border border-zinc-950/10 bg-black/[0.04] px-4 py-3 text-sm text-zinc-800 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-300">
          {notice}
        </div>
      )}

      {/* stat cards */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Active subscribers", value: String(data.totals.active), sub: `${data.totals.users} total accounts` },
          { label: "Monthly run-rate", value: money(data.mrrCents), sub: "active plans, monthly-equivalent" },
          { label: "Churn (30d)", value: `${data.churnRatePct}%`, sub: `${data.totals.cancelled30d} cancelled` },
          { label: "At-risk subscribers", value: String(data.atRisk.length), sub: `${atRiskCount} high risk`, danger: atRiskCount > 0 },
        ].map((c) => (
          <div key={c.label} className="glass rounded-2xl p-5">
            <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              {c.label}
            </p>
            <p
              className={`mt-2 text-3xl font-bold tracking-tight ${
                c.danger ? "text-rose-600 dark:text-rose-300" : ""
              }`}
            >
              {c.value}
            </p>
            <p className="mt-1 text-xs text-zinc-500">{c.sub}</p>
          </div>
        ))}
      </div>

      {/* charts */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="glass rounded-2xl p-5">
          <h2 className="text-sm font-semibold">Revenue — last 14 days</h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Total: {money(data.revenueByDay.reduce((s, d) => s + d.amountCents, 0))}
          </p>
          <div className="mt-4">
            <BarChart data={revenue14} format={(v) => `$${v}`} />
          </div>
        </div>
        <div className="glass rounded-2xl p-5">
          <h2 className="text-sm font-semibold">New signups — last 14 days</h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Total: {data.signupsByDay.reduce((s, d) => s + d.count, 0)}
          </p>
          <div className="mt-4">
            <BarChart data={signups14} format={(v) => String(v)} />
          </div>
        </div>
      </div>

      {/* plan breakdown + recent */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="glass rounded-2xl p-5">
          <h2 className="text-sm font-semibold">Subscribers by plan</h2>
          <ul className="mt-4 space-y-3">
            {data.planBreakdown.map((p) => (
              <li key={p.name} className="flex items-center justify-between text-sm">
                <span className="text-zinc-700 dark:text-zinc-300">{p.name}</span>
                <span className="flex items-center gap-2">
                  <span className="w-24 h-2 rounded-full bg-zinc-950/10 dark:bg-white/10">
                    <span
                      className="block h-full rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500"
                      style={{
                        width: `${Math.round((p.count / Math.max(data.totals.active, 1)) * 100)}%`,
                      }}
                    />
                  </span>
                  <span className="w-8 text-right font-semibold">{p.count}</span>
                </span>
              </li>
            ))}
            {data.planBreakdown.length === 0 && (
              <li className="text-sm text-zinc-500">No active subscribers yet.</li>
            )}
          </ul>
        </div>
        <div className="glass rounded-2xl p-5">
          <h2 className="text-sm font-semibold">Recent signups</h2>
          <ul className="mt-4 space-y-2.5">
            {data.recentSignups.map((u) => (
              <li
                key={u.id}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{u.username}</p>
                  <p className="truncate text-xs text-zinc-500">{u.email}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs font-medium">{u.plan_name ?? "—"}</p>
                  <p className="text-[10px] text-zinc-500">{u.created_at.slice(0, 10)}</p>
                </div>
              </li>
            ))}
            {data.recentSignups.length === 0 && (
              <li className="text-sm text-zinc-500">No signups yet.</li>
            )}
          </ul>
        </div>
      </div>

      {/* churn prevention queue */}
      <div className="mt-6 glass rounded-2xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <CrownIcon className="h-4 w-4 text-brand-600 dark:text-brand-300" />
              Churn prevention queue
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              Users flagged by risk signals (failed payments, past-due status).
            </p>
          </div>
        </div>

        {data.atRisk.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500">
            No at-risk subscribers right now.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {data.atRisk.map((u) => (
              <div
                key={u.user_id}
                className="rounded-xl border border-zinc-950/10 p-4 dark:border-white/10"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{u.username}</p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ring-1 ${LEVEL_STYLES[u.level]}`}
                      >
                        {u.level} risk
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ring-1 ${STATUS_STYLES[u.status] ?? ""}`}
                      >
                        {u.status}
                      </span>
                      {u.payment_failed_count > 0 && (
                        <span className="rounded-full bg-zinc-500/10 px-2 py-0.5 text-[10px] font-medium text-zinc-600 ring-1 ring-zinc-500/20 dark:text-zinc-300">
                          {u.payment_failed_count} failed payment
                          {u.payment_failed_count > 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-zinc-500">
                      {u.email} · {u.plan_name ?? "no plan"}
                      {u.last_payment_failed_at
                        ? ` · failed ${u.last_payment_failed_at.slice(0, 10)}`
                        : ""}
                    </p>
                    {u.signals.length > 0 && (
                      <p className="mt-1 text-xs text-zinc-500">
                        Signals: {u.signals.join(", ")}
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={() => runRecommendations(u)}
                      disabled={busy !== null}
                      className="flex items-center gap-1.5 rounded-lg border border-zinc-950/15 px-3 py-2 text-xs font-medium transition-colors hover:border-zinc-950/30 disabled:opacity-50 dark:border-white/15 dark:hover:border-white/30"
                    >
                      <WandIcon className="h-3.5 w-3.5" />
                      AI watchlist
                    </button>
                    <button
                      onClick={() => runWinback(u)}
                      disabled={busy !== null}
                      className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-3 py-2 text-xs font-semibold text-white shadow-lg shadow-indigo-500/30 transition-all hover:brightness-110 disabled:opacity-50"
                    >
                      <LinkIcon className="h-3.5 w-3.5" />
                      {busy === `w:${u.user_id}` ? "Creating…" : "Winback offer"}
                    </button>
                  </div>
                </div>

                {/* AI watchlist result */}
                {recsFor?.user_id === u.user_id && (
                  <div className="mt-3 border-t border-zinc-950/10 pt-3 dark:border-white/10">
                    {recLoading ? (
                      <p className="flex items-center gap-2 text-xs text-zinc-500">
                        <span className="h-3 w-3 animate-spin rounded-full border border-zinc-950/20 border-t-brand-400 dark:border-white/20" />
                        Asking your AI model for a personalized watchlist…
                      </p>
                    ) : recError ? (
                      <p className="text-xs text-rose-600 dark:text-rose-300">
                        {recError}
                      </p>
                    ) : (
                      <ul className="space-y-1.5">
                        {recs.map((r, i) => (
                          <li key={`${r.title}-${i}`} className="flex gap-2 text-xs">
                            <span className="shrink-0 rounded bg-brand-500/15 px-1.5 py-0.5 font-semibold text-brand-600 dark:text-brand-300">
                              {i + 1}
                            </span>
                            <span className="text-zinc-700 dark:text-zinc-300">
                              <span className="font-medium">{r.title}</span>{" "}
                              <span className="text-zinc-500">— {r.why}</span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}