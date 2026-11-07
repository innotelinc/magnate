import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getPlanBySlug } from "@/lib/plans";
import {
  SAGE_SERVICE,
  isSageService,
  mintSageSessions,
  publicSageSession,
  sessionsForCheckout,
} from "@/lib/sage";
import { gatewayUrl } from "@/lib/settings";

export const dynamic = "force-dynamic";

/**
 * Turn a verified App Store purchase into a Sage session key.
 *
 * The Sage server verifies the StoreKit 2 signed transaction itself — certificate
 * chain to Apple's root, bundle id, product, quantity, revocation — and only then
 * calls this route. So what arrives here has already been checked by the party
 * that owns the app, and the only thing left to decide is whether to pay out.
 *
 * Paying out is the same act as a Stripe purchase: one OmniRoute key with a spend
 * cap and a window that the purchase names — five minutes for the trial, fifteen
 * for the standard and intensive sessions. The row is keyed on `iap:<transactionId>`
 * instead of a Stripe session id, which means the unique index on
 * (stripe_session_id, seat) supplies the idempotency — a replayed receipt finds
 * the seat it already owns rather than minting a second key. The Sage server also
 * refuses repeats it remembers, but only this table survives a restart.
 *
 * There is no money to record here: StoreKit took it, and Apple's receipt is the
 * ledger. What is stored is the key, the plan and the window, so a buyer whose
 * app crashed mid-purchase can still be given what they paid for.
 */

const schema = z.object({
  /** The consumable Apple sold, e.g. `us.inotnel.sage.session.trial`. */
  productId: z.string().min(1).max(120),
  planSlug: z.string().min(1).max(64),
  /** Apple's transaction id: the idempotency key for the whole route. */
  transactionId: z.string().min(1).max(64),
  email: z.string().email().max(254).nullish(),
  bundleId: z.string().min(1).max(64).optional(),
  environment: z.enum(["Production", "Sandbox"]).optional(),
  purchasedAt: z.string().max(40).optional(),
  /**
   * How long the window lasts, when the product bought says so. The five-minute
   * trial and the fifteen-minute sessions share this route, so the length comes
   * with the receipt instead of being assumed.
   */
  minutes: z.number().int().min(1).max(240).optional(),
});

function mintToken(): string {
  return (process.env.SAGE_IAP_MINT_TOKEN || process.env.IAP_MINT_TOKEN || "").trim();
}

/**
 * A shared secret, not a user credential: the caller is the Sage server. Without
 * one configured the route stays shut, because an open mint endpoint is an open
 * key dispenser.
 */
function authorised(req: Request): boolean {
  const expected = mintToken();
  if (!expected) return false;
  const given = (req.headers.get("authorization") ?? "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  if (given.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

function bundleId(): string {
  return (process.env.SAGE_IAP_BUNDLE_ID || "us.innotel.sage").trim();
}

function answer(pub: ReturnType<typeof publicSageSession>) {
  return NextResponse.json(
    {
      key: pub.key,
      code: pub.code,
      planName: pub.planName,
      expiresAt: pub.expiresAt,
      secondsLeft: pub.secondsLeft,
      // The endpoint the key belongs to, so the app never installs a key without
      // the base URL that makes it work.
      gatewayUrl: `${gatewayUrl().replace(/\/+$/, "")}/v1`,
    },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function POST(req: Request) {
  if (!mintToken()) {
    return NextResponse.json(
      { error: "In-app purchases are not configured on this instance." },
      { status: 503 },
    );
  }
  if (!authorised(req)) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }

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
  const {
    planSlug,
    transactionId,
    email,
    bundleId: claimedBundle,
    minutes,
  } = parsed.data;

  // The signature check upstream already proved the bundle; this is the cheap
  // second look that catches a server pointed at the wrong app's products.
  if (claimedBundle && claimedBundle !== bundleId()) {
    return NextResponse.json(
      { error: `This route sells ${bundleId()}, not ${claimedBundle}.` },
      { status: 400 },
    );
  }

  const plan = getPlanBySlug(planSlug);
  if (!plan || !plan.active || !isSageService(plan.service) || plan.service !== SAGE_SERVICE) {
    return NextResponse.json(
      { error: "That Sage session is not available." },
      { status: 404 },
    );
  }

  const seatKey = `iap:${transactionId}`;

  // A receipt that has already been paid out either still owns a live key — in
  // which case answering with it is the honest replay — or it does not, and then
  // it must not be paid twice.
  const prior = sessionsForCheckout(seatKey)[0];
  if (prior) {
    const pub = publicSageSession(prior);
    if (pub.active && pub.key) return answer(pub);
    return NextResponse.json(
      {
        error:
          "This purchase has already been redeemed. Its session has ended; buy another one to get a new key.",
      },
      { status: 409 },
    );
  }

  try {
    const rows = await mintSageSessions({
      stripeSessionId: seatKey,
      planSlug: plan.slug,
      email: email ?? null,
      quantity: 1,
      // No amount to divide: the price is the App Store's, and the spend cap
      // follows the plan's catalogue price.
      amountCents: 0,
      currency: "usd",
      // Undefined means the instance's default window.
      minutes,
    });
    const row = rows[0];
    if (!row) throw new Error("the mint returned no session");
    const pub = publicSageSession(row);
    if (!pub.active || !pub.key) {
      throw new Error(row.error || "the session was minted without a live key");
    }
    return answer(pub);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // A buyer has already been charged by Apple at this point, so the failure is
    // reported with its reason: the app shows it and the key can be reissued.
    console.error("sage iap mint failed", seatKey, message);
    return NextResponse.json(
      { error: `Could not issue a session key: ${message}` },
      { status: 502 },
    );
  }
}
