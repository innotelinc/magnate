/**
 * Creator/subscriber analytics + churn forecasting.
 *
 * Everything is derived from the local SQLite store (subscription statuses,
 * plan prices, and payment records captured from Stripe webhooks), so the
 * dashboard works without extra services.
 */

import { db } from "./db";

export interface RiskScore {
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

/** A user's monthly-equivalent revenue contribution in cents. */
export function monthlyEquivalentCents(
  priceMonthlyCents: number,
  priceYearlyCents: number,
): number {
  // Yearly plans contribute 1/12 of the yearly price per month. Doesn't
  // account for Stripe's proration/`current_period_end`, but it's a
  // consistent MRR proxy derived entirely from local data.
  return Math.max(
    priceMonthlyCents,
    Math.round(priceYearlyCents / 12),
  );
}

export interface Analytics {
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
  atRisk: RiskScore[];
  recentSignups: Array<{
    id: number;
    username: string;
    email: string;
    plan_name: string | null;
    created_at: string;
  }>;
}

/** Last N days as YYYY-MM-DD keys, oldest first. */
function lastDays(n: number, now = new Date()): string[] {
  const days: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

function scoreRisk(row: {
  id: number;
  username: string;
  email: string;
  plan_name: string | null;
  status: string;
  payment_failed_count: number;
  last_payment_failed_at: string | null;
  current_period_end: number | null;
}): RiskScore {
  const signals: string[] = [];
  let score = 0;

  if (row.status === "past_due") {
    score += 3;
    signals.push("past-due invoice");
  } else if (row.status === "unpaid") {
    score += 4;
    signals.push("unpaid subscription");
  }

  if (row.payment_failed_count > 1) {
    score += Math.min(4, row.payment_failed_count - 1);
    signals.push(`${row.payment_failed_count} failed payments`);
  }

  if (row.last_payment_failed_at) {
    const ageDays =
      (Date.now() - new Date(row.last_payment_failed_at).getTime()) / 86_400_000;
    if (ageDays <= 7) {
      score += 1;
      signals.push("payment failed this week");
    }
  }

  const level: RiskScore["level"] =
    score >= 4 ? "high" : score >= 2 ? "medium" : "low";

  return {
    ...row,
    user_id: row.id,
    score: Math.min(10, score),
    level,
    signals,
  };
}

export function getAnalytics(): Analytics {
  const totals = db
    .prepare(
      `SELECT
         COUNT(*) AS users,
         SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
         SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
         SUM(CASE WHEN status = 'past_due' THEN 1 ELSE 0 END) AS pastDue,
         SUM(CASE WHEN status = 'unpaid' THEN 1 ELSE 0 END) AS unpaid
       FROM users`,
    )
    .get() as {
    users: number;
    active: number;
    pending: number;
    pastDue: number;
    unpaid: number;
  };

  const cancelled30d = db
    .prepare(
      `SELECT COUNT(*) AS c FROM users
       WHERE status = 'cancelled' AND created_at >= datetime('now', '-30 days')`,
    )
    .get() as { c: number };

  // MRR + plan breakdown from active subscribers.
  const activeRows = db
    .prepare(
      `SELECT u.status, p.price_monthly_cents, p.price_yearly_cents, p.name
       FROM users u LEFT JOIN plans p ON p.id = u.plan_id
       WHERE u.status = 'active'`,
    )
    .all() as Array<{
    price_monthly_cents: number | null;
    price_yearly_cents: number | null;
    name: string | null;
  }>;

  const mrrCents = activeRows.reduce(
    (sum, r) =>
      sum +
      monthlyEquivalentCents(r.price_monthly_cents ?? 0, r.price_yearly_cents ?? 0),
    0,
  );

  const planBreakdown = new Map<string, number>();
  for (const r of activeRows) {
    const name = r.name ?? "Unknown";
    planBreakdown.set(name, (planBreakdown.get(name) ?? 0) + 1);
  }

  // Signups per day (30d).
  const days = lastDays(30);
  const signupRows = db
    .prepare(
      `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS count
       FROM users
       WHERE created_at >= datetime('now', '-30 days')
       GROUP BY day`,
    )
    .all() as Array<{ day: string; count: number }>;
  const signupMap = new Map(signupRows.map((r) => [r.day, r.count]));
  const signupsByDay = days.map((day) => ({
    day,
    count: signupMap.get(day) ?? 0,
  }));

  // Revenue per day from recorded payments (30d).
  const revenueRows = db
    .prepare(
      `SELECT substr(created_at, 1, 10) AS day, SUM(amount_cents) AS total
       FROM payments
       WHERE created_at >= datetime('now', '-30 days')
       GROUP BY day`,
    )
    .all() as Array<{ day: string; total: number }>;
  const revenueMap = new Map(revenueRows.map((r) => [r.day, r.total]));
  const revenueByDay = days.map((day) => ({
    day,
    amountCents: revenueMap.get(day) ?? 0,
  }));

  // Churn: cancellations over the past 30 days vs current active base.
  const baseActive = Math.max(totals.active, 1);
  const churnRatePct = Math.round((cancelled30d.c / baseActive) * 1000) / 10;

  // At-risk users (churn prevention queue).
  const candidateRows = db
    .prepare(
      `SELECT u.id, u.username, u.email, u.status, u.payment_failed_count,
              u.last_payment_failed_at, u.current_period_end, p.name AS plan_name
       FROM users u LEFT JOIN plans p ON p.id = u.plan_id
       WHERE u.status IN ('past_due', 'unpaid', 'active')
       ORDER BY
         CASE u.status WHEN 'unpaid' THEN 0 WHEN 'past_due' THEN 1 ELSE 2 END,
         u.payment_failed_count DESC`,
    )
    .all() as Array<{
    id: number;
    username: string;
    email: string;
    plan_name: string | null;
    status: string;
    payment_failed_count: number;
    last_payment_failed_at: string | null;
    current_period_end: number | null;
  }>;

  const atRisk = candidateRows
    .map(scoreRisk)
    .filter((r) => r.level !== "low")
    .sort((a, b) => b.score - a.score)
    .slice(0, 50);

  const recentSignups = db
    .prepare(
      `SELECT u.id, u.username, u.email, u.created_at, p.name AS plan_name
       FROM users u LEFT JOIN plans p ON p.id = u.plan_id
       ORDER BY u.created_at DESC LIMIT 10`,
    )
    .all() as Analytics["recentSignups"];

  return {
    totals: {
      users: totals.users ?? 0,
      active: totals.active ?? 0,
      pending: totals.pending ?? 0,
      pastDue: totals.pastDue ?? 0,
      unpaid: totals.unpaid ?? 0,
      cancelled30d: cancelled30d.c,
    },
    mrrCents,
    planBreakdown: [...planBreakdown.entries()].map(([name, count]) => ({
      name,
      count,
    })),
    signupsByDay,
    revenueByDay,
    churnRatePct,
    atRisk,
    recentSignups,
  };
}