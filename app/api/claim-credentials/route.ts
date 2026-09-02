import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStripe } from "@/lib/stripe";
import { decrypt } from "@/lib/crypto";

export const dynamic = "force-dynamic";

/**
 * One-time retrieval of the generated credentials after a successful payment.
 * The success page polls this until the webhook has provisioned the account.
 */
export async function GET(req: Request) {
  const sessionId = new URL(req.url).searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ error: "Missing session_id" }, { status: 400 });
  }

  let session;
  try {
    session = await getStripe().checkout.sessions.retrieve(sessionId);
  } catch {
    return NextResponse.json({ error: "Invalid session" }, { status: 404 });
  }

  if (session.payment_status !== "paid" || session.mode !== "subscription") {
    return NextResponse.json({ ready: false });
  }

  const username = session.metadata?.username;
  if (!username) {
    return NextResponse.json({ error: "Session missing metadata" }, { status: 500 });
  }

  const user = db
    .prepare("SELECT * FROM users WHERE lower(username) = lower(?)")
    .get(username) as
    | {
        password_enc: string | null;
        credentials_claimed_at: string | null;
        plan_id: number | null;
        referral_code: string | null;
        referrals_count: number;
        referral_earned_cents: number;
      }
    | undefined;

  if (!user || !user.password_enc) {
    // Webhook hasn't provisioned yet — client should poll again.
    return NextResponse.json({ ready: false });
  }

  let password: string;
  try {
    password = decrypt(user.password_enc);
  } catch {
    return NextResponse.json(
      { error: "Could not decrypt credentials. Contact the admin." },
      { status: 500 },
    );
  }

  const alreadyClaimed = user.credentials_claimed_at != null;
  if (!alreadyClaimed) {
    db.prepare(
      "UPDATE users SET credentials_claimed_at = datetime('now') WHERE lower(username) = lower(?)",
    ).run(username);
  }

  // Used by the success page to gate Premium-only perks (e.g. request access).
  const plan = user.plan_id
    ? (db.prepare("SELECT slug FROM plans WHERE id = ?").get(user.plan_id) as
        | { slug: string }
        | undefined)
    : undefined;

  const referralBase = process.env.APP_URL || "http://localhost:3000";

  return NextResponse.json({
    ready: true,
    username,
    password,
    alreadyClaimed,
    planSlug: plan?.slug ?? null,
    // Affiliate & referral: the new subscriber's own shareable code.
    referralCode: user.referral_code ?? null,
    referralLink: user.referral_code
      ? `${referralBase}/?ref=${encodeURIComponent(user.referral_code)}`
      : null,
    referralsCount: user.referrals_count ?? 0,
    referralEarnedCents: user.referral_earned_cents ?? 0,
  });
}
