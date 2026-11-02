/**
 * CourseMate keys.
 *
 * CourseMate is sold the same way Sage is: no account, no seat, no stored card —
 * one OmniRoute API key, minted when Stripe confirms the money and deleted from
 * the gateway when its window closes. The only difference is the window. A Sage
 * session is fifteen minutes of one exercise; a CourseMate key has to survive a
 * term of lectures, so it lives `coursemateKeyDays()` days.
 *
 * Everything else is shared with Sage (`mintKeySessions` in lib/sage.ts): the
 * same table, the same spend cap as a share of the price, the same idempotency
 * on (checkout session, unit) so a Stripe replay cannot spend a second key, and
 * the same sweep. That is deliberate — a second copy of the mint would be a
 * second place for a revocation bug to live.
 *
 * The server that spends these keys is cm.innotel.us. It has no account list:
 * it asks the gateway whether the bearer is a live key, which is exactly what a
 * minted key is.
 */

import { mintKeySessions, type SageSessionRow } from "./sage";
import { coursemateKeyDays } from "./settings";

export const COURSEMATE_SERVICE = "coursemate";

/** Share of the key price that may be spent on models. */
export const COURSEMATE_SPEND_SHARE = 0.4;

/** Ceiling on keys in one purchase, so a fat finger is not a large invoice. */
export const COURSEMATE_MAX_KEYS = 5;

export function isCourseMateService(service?: string | null): boolean {
  return (service ?? "").trim().toLowerCase() === COURSEMATE_SERVICE;
}

/** The key's life in minutes — the unit the shared mint stores its deadline in. */
export function coursemateWindowMinutes(): number {
  return Math.max(1, Math.round(coursemateKeyDays() * 24 * 60));
}

export interface MintCourseMateInput {
  stripeSessionId: string;
  planSlug: string;
  email: string | null;
  quantity: number;
  amountCents: number;
  currency: string;
}

/**
 * Mint one key per unit bought.
 *
 * Called by the Stripe webhook once payment confirms, and only by it: the buyer
 * must not be able to mint a key without the money, so nothing under /api is
 * wired to this.
 */
export async function mintCourseMateKeys(
  input: MintCourseMateInput,
): Promise<SageSessionRow[]> {
  return mintKeySessions({
    ...input,
    quantity: Math.min(
      Math.max(Math.trunc(input.quantity) || 1, 1),
      COURSEMATE_MAX_KEYS,
    ),
    service: COURSEMATE_SERVICE,
    minutes: coursemateWindowMinutes(),
  });
}
