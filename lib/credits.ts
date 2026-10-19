/**
 * Credit top-ups: money taken on Magnate, credits granted on the plane.
 *
 * A per-unit plan sells *quantities* of something the product meters — Engineer
 * sells credits, one per project. Magnate owns the payment and the revenue
 * ledger; the plane (Distro) owns the credit balance and refuses or accepts the
 * spend. So the seam between them is a grant: once a payment for N units has
 * cleared, this module tells the plane to add N credits to the buyer's account.
 *
 * WHY THE GRANT CARRIES A REFERENCE
 * ---------------------------------
 * Stripe delivers a webhook at least once, and retries a failed one. The grant
 * therefore names the payment it came from (`checkout:<session>` for the first
 * one, `invoice:<id>` for a renewal), and the plane's ledger dedupes on that
 * reference: a replayed event grants nothing the second time. That property
 * lives in the plane; this module's job is to always send the reference.
 *
 * WHY IT THROWS WHEN THE PLANE IS DOWN
 * ------------------------------------
 * The buyer has already been charged. Swallowing a failed grant would leave
 * them paid-for but credit-less, with nothing to retry; throwing leaves the
 * Stripe event unprocessed so Stripe redelivers it. A Magnate with no plane
 * configured is a different case — that deployment simply does not meter
 * credits, so the grant is skipped and said to be skipped.
 */

import type { Plan } from "./db";

/** What the plane answers for a grant. */
export interface GrantResult {
  /** Credits the plane actually added: 0 for a replay. */
  granted: number;
  /** True when the same reference had already been granted. */
  duplicate: boolean;
  /** The buyer's balance afterwards, when the plane reports one. */
  balance: number | null;
  /** True when no plane is configured, so nothing was asked or granted. */
  skipped: boolean;
}

/** A grant that could not be delivered. Thrown so the caller can make the payment retry. */
export class GrantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GrantError";
  }
}

interface PlaneConfig {
  url: string;
  token: string;
}

/** The plane's address and service credential, or null when this Magnate has none. */
function planeConfig(): PlaneConfig | null {
  const url = (process.env.CONTROL_PLANE_INTERNAL_URL || "").trim().replace(/\/+$/, "");
  const token = (process.env.CONTROL_INTERNAL_TOKEN || "").trim();
  if (!url || !token) return null;
  return { url, token };
}

/** True when this deployment can grant credits at all. */
export function creditsConfigured(): boolean {
  return planeConfig() !== null;
}

/**
 * How many credits a paid amount of a plan buys, or null when the plan is not
 * sold in credits.
 *
 * A plan is a credit plan when it names `credit` as its billing unit and is
 * attached to a service — the service name is the product key in the plane's
 * ledger (`engineer`). `units` is the checkout quantity; anything that is not a
 * positive whole number is not a purchase we can count.
 */
export function creditsForPlan(plan: Plan | undefined, units: number): { product: string; credits: number } | null {
  if (!plan) return null;
  const unit = String(plan.billing_unit || "").trim().toLowerCase();
  const product = String(plan.service || "").trim().toLowerCase();
  if (unit !== "credit" || !product || product === "generic") return null;
  const credits = Math.trunc(Number(units));
  if (!Number.isFinite(credits) || credits <= 0) return null;
  return { product, credits };
}

/**
 * Add credits to one account on the plane.
 *
 * `reference` must identify the payment — it is what makes a retried webhook
 * free. Throws `GrantError` when the plane refuses or cannot be reached.
 */
export async function grantCredits(grant: {
  email: string;
  product: string;
  credits: number;
  reference: string;
  reason?: string;
}): Promise<GrantResult> {
  const email = grant.email.trim().toLowerCase();
  if (!email) throw new GrantError("cannot grant credits to an empty address");
  if (!Number.isFinite(grant.credits) || grant.credits <= 0) {
    throw new GrantError("cannot grant a non-positive number of credits");
  }

  const plane = planeConfig();
  if (plane === null) {
    console.warn(
      `credit grant skipped (no control plane configured): ${grant.credits} ${grant.product} for ${email}`,
    );
    return { granted: 0, duplicate: false, balance: null, skipped: true };
  }

  let response: Response;
  try {
    response = await fetch(`${plane.url}/api/internal/credits/grant`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-control-internal-token": plane.token,
      },
      body: JSON.stringify({
        user: email,
        product: grant.product,
        credits: grant.credits,
        reference: grant.reference,
        reason: grant.reason ?? `magnate ${grant.reference}`,
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    throw new GrantError(`could not reach the control plane to grant credits: ${(error as Error).message}`);
  }

  const text = await response.text().catch(() => "");
  let payload: Record<string, unknown> = {};
  try {
    payload = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const reason = typeof payload.error === "string" && payload.error !== "" ? payload.error : `HTTP ${response.status}`;
    throw new GrantError(`the control plane refused the credit grant: ${reason}`);
  }

  return {
    granted: typeof payload.granted === "number" ? payload.granted : 0,
    duplicate: payload.duplicate === true,
    balance: typeof payload.balance === "number" ? payload.balance : null,
    skipped: false,
  };
}
