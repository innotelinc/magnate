import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getStripe } from "@/lib/stripe";
import { authentikConfigured, findUser as findAuthentikUser } from "@/lib/authentik";
import { encrypt, generatePassword } from "@/lib/crypto";
import { getPlanBySlug } from "@/lib/plans";

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
  const { planSlug, interval, email, username } = parsed.data;

  const plan = getPlanBySlug(planSlug);
  if (!plan || !plan.active) {
    return NextResponse.json(
      { error: "That plan is not available." },
      { status: 404 },
    );
  }

  const priceId =
    interval === "month"
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

  try {
    const session = await getStripe().checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: email,
      client_reference_id: String(userId),
      metadata: {
        username,
        email,
        plan_slug: plan.slug,
        interval,
        user_id: String(userId),
      },
      subscription_data: {
        metadata: { username, user_id: String(userId) },
      },
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
