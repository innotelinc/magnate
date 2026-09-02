/**
 * Affiliate & referral program.
 *
 * Every user gets a unique referral code on signup. When a new user signs up
 * with ?ref=CODE, the referrer earns a percentage (REFERRAL_REWARD_PERCENT,
 * default 10%) of the referred user's first payment. Credits are written to
 * the referrer's Stripe customer balance (spendable on future invoices) and
 * tracked in the local ledger.
 */

import { db, type UserRow } from "./db";
import { getStripe, stripeConfigured, stripeCurrency } from "./stripe";
import { getPlanById } from "./plans";

export function referralRewardPercent(): number {
  const raw = process.env.REFERRAL_REWARD_PERCENT;
  const n = raw ? Number(raw) : 10;
  return Number.isFinite(n) && n > 0 ? Math.min(100, n) : 0;
}

/** Optional Stripe coupon id applied to referred signups' first invoice. */
export function referralCouponId(): string | undefined {
  const id = process.env.REFERRAL_COUPON_ID?.trim();
  return id || undefined;
}

/** Normalize a referral code for comparison (case-insensitive). */
export function findUserByReferralCode(code: string): UserRow | undefined {
  const c = code.trim().toUpperCase();
  if (!c) return undefined;
  return db.prepare("SELECT * FROM users WHERE referral_code = ?").get(c) as
    | UserRow
    | undefined;
}

/**
 * Record that `targetUserId` signed up thanks to referral code `code`.
 * Returns the referrer user, or undefined if the code is invalid/self-referral.
 */
export function applyReferral(
  targetUserId: number,
  code: string,
): UserRow | undefined {
  const referrer = findUserByReferralCode(code);
  if (!referrer) return undefined;
  if (referrer.id === targetUserId) return undefined;

  const target = db
    .prepare("SELECT id, referred_by FROM users WHERE id = ?")
    .get(targetUserId) as { id: number; referred_by: string | null } | undefined;
  if (!target || target.referred_by) return undefined; // already attributed

  db.prepare("UPDATE users SET referred_by = ? WHERE id = ?").run(
    referrer.referral_code,
    targetUserId,
  );
  return referrer;
}

/**
 * Credit a referrer after the referred user's first successful payment.
 * Called from the checkout.session.completed webhook. Idempotent per referred
 * user (unique index on referral_events.referred_user_id).
 */
export async function creditReferrer(
  referredUser: UserRow,
  firstPaymentCents: number,
): Promise<void> {
  const code = referredUser.referred_by;
  if (!code) return;
  const referrer = findUserByReferralCode(code);
  if (!referrer) return;

  const amountCents = Math.round(
    (firstPaymentCents * referralRewardPercent()) / 100,
  );
  if (amountCents <= 0) return;

  const inserted = db
    .prepare(
      `INSERT OR IGNORE INTO referral_events (referrer_user_id, referred_user_id, amount_cents)
       VALUES (?, ?, ?)`,
    )
    .run(referrer.id, referredUser.id, amountCents);
  if (inserted.changes === 0) return; // already credited

  db.prepare(
    `UPDATE users SET
       referrals_count = referrals_count + 1,
       referral_earned_cents = referral_earned_cents + ?
     WHERE id = ?`,
  ).run(amountCents, referrer.id);

  // Deposit the credit on the referrer's Stripe customer balance so it
  // discounts their future invoices automatically.
  if (stripeConfigured() && referrer.stripe_customer_id) {
    try {
      const stripe = getStripe();
      await stripe.customers.createBalanceTransaction(
        referrer.stripe_customer_id,
        {
          amount: amountCents,
          currency: stripeCurrency().toLowerCase(),
          description: `Referral credit — ${referredUser.username} subscribed (${referralRewardPercent()}% of first payment)`,
        },
      );
    } catch (err) {
      // Ledger is recorded; Stripe credit is best-effort. Keep the webhook happy.
      console.error("failed to add referral credit to Stripe balance", err);
    }
  }
}

/** First-payment amount used for referral credit: the plan's price for the interval. */
export function firstPaymentCentsFor(
  userId: number,
  planId: number | null,
  interval: "month" | "year" | undefined,
): number {
  if (!planId && !interval) return 0;
  const plan = planId ? getPlanById(planId) : undefined;
  if (!plan) return 0;
  return interval === "year"
    ? plan.price_yearly_cents
    : plan.price_monthly_cents;
}