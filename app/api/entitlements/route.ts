// Magnate v2.1 — entitlement API (server-to-server).
//
// Consumed by the ecosystem's agent pipelines (Capstone) and any platform
// that gates a feature on Magnate billing. Magnate owns the entitlement
// decision; consumers never hold Stripe keys.
//
// Contract:
//   GET /api/entitlements?plan=<slug|id>&phone=<e164>&user=<username|email>
//   200 {"entitled": true|false|null, "reason": "ok"|"...", "plan": name,
//        "slug": ..., "phone": ..., "user": ..., "status": ...,
//        "expires_at": epoch|null}
//   400 invalid params · 401 bad/missing token · 404 plan not found
//
// Levels:
//   - No `plan`         → connectivity probe (entitled: null).
//   - `plan` only       → plan-level check: an active plan is entitled.
//   - `plan` + `user`   → subscription-level check: the user must have an
//     active, unexpired subscription.
//
// Optional gate: set ENTITLEMENTS_API_TOKEN; clients must then send
// `Authorization: Bearer <token>`. Unset = open (self-hosted/trusted net).
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getPlanBySlug, getPlanById } from "@/lib/plans";

export const dynamic = "force-dynamic";

const schema = z.object({
  plan: z.string().min(1).max(64).optional(),
  phone: z.string().max(32).optional(),
  user: z.string().max(254).optional(),
});

function entitlementsToken(): string | undefined {
  return process.env.ENTITLEMENTS_API_TOKEN || undefined;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = schema.safeParse({
    plan: url.searchParams.get("plan") ?? undefined,
    phone: url.searchParams.get("phone") ?? undefined,
    user: url.searchParams.get("user") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { entitled: false, reason: "invalid_params" },
      { status: 400 },
    );
  }
  const { plan: planRef, phone, user } = parsed.data;

  // Server-to-server gate: when a token is configured, require it.
  const token = entitlementsToken();
  if (token) {
    const auth = req.headers.get("authorization") ?? "";
    const bearer = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
    if (bearer !== token) {
      return NextResponse.json(
        { entitled: false, reason: "unauthorized" },
        { status: 401 },
      );
    }
  }

  const echo = { phone: phone ?? null, user: user ?? null };

  // Connectivity probe — the endpoint is reachable and the gate passed.
  if (!planRef) {
    return NextResponse.json({
      ...echo,
      entitled: null,
      reason: "ok",
      plan: null,
      slug: null,
      expires_at: null,
    });
  }

  const plan = /^\d+$/.test(planRef)
    ? getPlanById(Number(planRef))
    : getPlanBySlug(planRef);
  if (!plan) {
    return NextResponse.json(
      {
        ...echo,
        entitled: false,
        reason: "plan_not_found",
        plan: planRef,
        slug: planRef,
        expires_at: null,
      },
      { status: 404 },
    );
  }

  if (!plan.active) {
    return NextResponse.json({
      ...echo,
      entitled: false,
      reason: "plan_inactive",
      plan: plan.name,
      slug: plan.slug,
      expires_at: null,
    });
  }

  if (user) {
    const row = db
      .prepare(
        "SELECT username, email, plan_id, status, current_period_end FROM users WHERE lower(username) = lower(?) OR lower(email) = lower(?)",
      )
      .get(user, user) as
      | {
          username: string;
          email: string;
          plan_id: number | null;
          status: string;
          current_period_end: number | null;
        }
      | undefined;
    if (!row) {
      return NextResponse.json({
        ...echo,
        entitled: false,
        reason: "user_not_found",
        plan: plan.name,
        slug: plan.slug,
        expires_at: null,
      });
    }
    const now = Math.floor(Date.now() / 1000);
    const notExpired =
      row.current_period_end === null || row.current_period_end > now;
    const entitled = row.status === "active" && notExpired;
    return NextResponse.json({
      ...echo,
      entitled,
      reason: entitled ? "ok" : "subscription_not_active",
      plan: plan.name,
      slug: plan.slug,
      status: row.status,
      expires_at: row.current_period_end ?? null,
    });
  }

  // Plan-level check (no subscriber identity): an active plan is entitled.
  return NextResponse.json({
    ...echo,
    entitled: true,
    reason: "ok",
    plan: plan.name,
    slug: plan.slug,
    expires_at: null,
  });
}