/**
 * The Jellyfin promotion.
 *
 * Jellyfin is free two ways:
 *
 *   1. Everyone gets a 7-day free trial on the Jellyfin subscription itself.
 *      That is a real Stripe trial applied at checkout (see
 *      app/api/checkout/route.ts) — the subscription starts `trialing`, and the
 *      first invoice is only raised when the trial ends.
 *
 *   2. Any *other* purchase grants 3 months of Jellyfin at no charge. That is a
 *      dated grant here (`users.jellyfin_grant_until`), not a second Stripe
 *      subscription: a $0 add-on has nothing to bill and nothing to cancel, so
 *      it does not need a subscription of its own. Expiry is a read-time check
 *      in /api/entitlements, so no scheduled job can be missed.
 *
 * Keeping the grant as a timestamp rather than a plan also leaves the
 * one-plan-per-account model (`users.plan_id`) untouched: someone on a Monarch
 * plan still holds *that* plan, and the grant rides alongside it.
 */
import { db } from "./db";

export const JELLYFIN_SERVICE = "jellyfin";

/** The general trial, in days, applied to a Jellyfin subscription at checkout. */
export const JELLYFIN_TRIAL_DAYS = 7;

/** How long "free with any purchase" lasts. */
export const JELLYFIN_ADDON_DAYS = 90;

/** Whether a plan's `service` column is the Jellyfin funnel. */
export function isJellyfinService(service: string | null | undefined): boolean {
  return (service ?? "").trim().toLowerCase() === JELLYFIN_SERVICE;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Extend a user's free Jellyfin access to at least `days` from now. Never
 * shortens an existing grant — two purchases in a row extend, not reset.
 * Returns the new expiry (unix seconds), or 0 when the user does not exist.
 */
export function grantJellyfinAddon(
  userId: number,
  days = JELLYFIN_ADDON_DAYS,
): number {
  const row = db
    .prepare("SELECT jellyfin_grant_until FROM users WHERE id = ?")
    .get(userId) as { jellyfin_grant_until: number | null } | undefined;
  if (!row) return 0;
  const until = Math.max(row.jellyfin_grant_until ?? 0, nowSeconds() + days * 86_400);
  db.prepare("UPDATE users SET jellyfin_grant_until = ? WHERE id = ?").run(
    until,
    userId,
  );
  return until;
}

/**
 * Grant the add-on to whichever user owns `email` (case-insensitive), if any.
 * Used for one-off cash-shop purchases, which are not tied to a Magnate account
 * the way a subscription checkout is — a purchase from an address with no
 * account grants nothing, which is correct: there is nobody to grant it to.
 */
export function grantJellyfinAddonForEmail(email: string | null | undefined): number {
  if (!email) return 0;
  const row = db
    .prepare("SELECT id FROM users WHERE lower(email) = lower(?)")
    .get(email) as { id: number } | undefined;
  if (!row) return 0;
  return grantJellyfinAddon(row.id);
}

/** A user's free-Jellyfin expiry (unix seconds), or null when they have none. */
export function jellyfinGrantUntil(userId: number): number | null {
  const row = db
    .prepare("SELECT jellyfin_grant_until FROM users WHERE id = ?")
    .get(userId) as { jellyfin_grant_until: number | null } | undefined;
  return row?.jellyfin_grant_until ?? null;
}
