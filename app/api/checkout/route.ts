import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getStripe } from "@/lib/stripe";
import { authentikConfigured, findUser as findAuthentikUser } from "@/lib/authentik";
import { encrypt, generatePassword } from "@/lib/crypto";
import { billingUnitOf, getPlanBySlug, isPerUnit } from "@/lib/plans";
import { applyReferral, referralCouponId } from "@/lib/referrals";
import { normalizeGenieSubdomain } from "@/lib/genie";
import {
  JELLYFIN_TRIAL_DAYS,
  isJellyfinService,
} from "@/lib/jellyfin";

export const dynamic = "force-dynamic";

const schema = z.object({
  planSlug: z.string().min(1).max(64),
  interval: z.enum(["month", "year"]),
  email: z.string().email().max(254),
  username: z
    .string()
    .min(3)
    .max(32)
    .regex(
      /^[a-zA-Z0-9](?:[a-zA-Z0-9._-]{1,30}[a-zA-Z0-9])?$/,
      "Username must be 3–32 characters using letters, numbers, dots, dashes or underscores (no leading/trailing punctuation).",
    ),
  refCode: z.string().trim().min(5).max(24).optional(),
  // The Genie plan sells a name under the preview wildcard; every other plan
  // ignores it. Validated here so a bad name is refused before payment.
  subdomain: z.string().trim().max(63).optional(),
  // How many units of a per-unit plan ("3 classes"). Ignored by a plan sold as
  // a whole subscription, where the line item is one of the plan.
  units: z.number().int().min(1).max(1000).optional(),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }
  const { planSlug, interval, email, username, refCode, subdomain } = parsed.data;

  const plan = getPlanBySlug(planSlug);
  if (!plan || !plan.active) {
    return NextResponse.json(
      { error: "That plan is not available." },
      { status: 404 },
    );
  }

  // A per-unit plan is bought in multiples of its unit, monthly — the unit price
  // is a recurring monthly one, so there is no yearly figure to charge and a
  // request for one is refused rather than quietly billed by the month. The
  // count is what the line item multiplies: a plan priced per class is not the
  // price of the account, and charging it once would under-bill every buyer who
  // asked for more than one.
  const perUnit = isPerUnit(plan);
  const unit = billingUnitOf(plan);
  if (perUnit && interval !== "month") {
    return NextResponse.json(
      {
        error: `This plan is billed per ${unit}, monthly — yearly billing isn't available.`,
      },
      { status: 400 },
    );
  }
  const units = perUnit ? (parsed.data.units ?? 1) : 1;

  // The Genie plan's whole value is the name, so it is required for that service
  // and meaningless for the rest.
  let genieSubdomain: string | null = null;
  if ((plan.service ?? "").toLowerCase() === "genie") {
    const normalized = normalizeGenieSubdomain(subdomain ?? "");
    if (normalized.error) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }
    genieSubdomain = normalized.name ?? null;
  }

  const priceId = perUnit
    ? plan.stripe_price_per_unit_id
    : interval === "month"
      ? plan.stripe_price_monthly_id
      : plan.stripe_price_yearly_id;
  if (!priceId) {
    return NextResponse.json(
      {
        error: "This plan isn't set up for billing yet. Please try another plan.",
      },
      { status: 500 },
    );
  }

  // Email must not already belong to an active subscription.
  // Abandoned signups (pending, no subscription) may retry with the same email.
  const emailTaken = db
    .prepare("SELECT stripe_subscription_id FROM users WHERE lower(email) = lower(?)")
    .get(email) as { stripe_subscription_id: string | null } | undefined;
  if (emailTaken?.stripe_subscription_id) {
    return NextResponse.json(
      {
        error:
          "An account with this email already exists. Manage your subscription on the manage page.",
      },
      { status: 409 },
    );
  }

  // Username must be free in Authentik, the account store (LDAP-created
  // Jellyfin accounts are covered transitively — every subscriber has an
  // Authentik account). Local users are already checked above.
  if (authentikConfigured()) {
    try {
      const existing = await findAuthentikUser(username);
      if (existing) {
        return NextResponse.json(
          { error: "That username is already taken." },
          { status: 409 },
        );
      }
    } catch {
      // Authentik unreachable — defer uniqueness checks to provisioning.
    }
  }

  // Generate credentials up-front so the success page can reveal them after payment.
  const password = generatePassword();
  const passwordEnc = encrypt(password);
  const existingUser = db
    .prepare("SELECT id FROM users WHERE lower(username) = lower(?)")
    .get(username) as { id: number } | undefined;

  let userId: number;
  try {
    if (existingUser) {
      userId = existingUser.id;
      db.prepare(
        "UPDATE users SET email = ?, plan_id = ?, password_enc = ?, status = 'pending', provisioning_error = NULL WHERE id = ?",
      ).run(email, plan.id, passwordEnc, userId);
    } else {
      const info = db
        .prepare(
          "INSERT INTO users (email, username, plan_id, password_enc, status) VALUES (?, ?, ?, ?, 'pending')",
        )
        .run(email, username, plan.id, passwordEnc);
      userId = Number(info.lastInsertRowid);
    }
  } catch {
    // Rare race: another signup claimed this username between the check and now.
    return NextResponse.json(
      { error: "That username was just taken. Please pick another." },
      { status: 409 },
    );
  }

  // Affiliate/referral: attribute the signup and optionally apply a first-
  // invoice discount coupon to the referred customer.
  let refApplied = false;
  if (refCode) {
    const referrer = applyReferral(userId, refCode);
    if (referrer) refApplied = true;
  }
  const couponId = referralCouponId();

  try {
    const session = await getStripe().checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: units }],
      customer_email: email,
      client_reference_id: String(userId),
      metadata: {
        username,
        email,
        plan_slug: plan.slug,
        interval,
        user_id: String(userId),
        ref_applied: refApplied ? "1" : "0",
        ...(genieSubdomain ? { subdomain: genieSubdomain } : {}),
        // What was actually bought, so the count is readable on the session and
        // on the subscription rather than only in the line item's total.
        ...(perUnit ? { billing_unit: unit, units: String(units) } : {}),
      },
      subscription_data: {
        metadata: {
          username,
          user_id: String(userId),
          ...(genieSubdomain ? { subdomain: genieSubdomain } : {}),
          ...(perUnit ? { billing_unit: unit, units: String(units) } : {}),
        },
        // Jellyfin is free for 7 days for everyone: a real Stripe trial, so the
        // subscription starts `trialing` and no invoice is raised until it ends.
        ...(isJellyfinService(plan.service)
          ? { trial_period_days: JELLYFIN_TRIAL_DAYS }
          : {}),
      },
      ...(refApplied && couponId
        ? { discounts: [{ coupon: couponId }] }
        : {}),
      success_url: `${process.env.APP_URL || "http://localhost:3000"}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.APP_URL || "http://localhost:3000"}/cancel`,
      allow_promotion_codes: true,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("checkout session creation failed", err);
    return NextResponse.json(
      {
        error:
          "Could not start the checkout. Please make sure billing is configured and try again.",
      },
      { status: 500 },
    );
  }
}
