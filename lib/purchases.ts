/**
 * One-off purchases (server-to-server cash-shop items).
 *
 * Consuming platforms (e.g. Rizz Aura) never hold Stripe keys: they ask
 * POST /api/purchases for a hosted Checkout session, Magnate owns the Stripe
 * account + revenue ledger, and on payment completion Magnate pushes a signed
 * fulfillment callback to the platform's hook (settings.purchase_fulfillment_url).
 *
 * The platform defines the item (slug, name, unit amount) per request — the
 * same way it would have called Stripe directly — so SKUs and variable-price
 * mechanics (e.g. "rank is what you pay" board slots) stay platform-owned.
 * Stripe metadata keys are namespaced `mag_*`; platform metadata passes through
 * untouched and is echoed back in the fulfillment payload.
 */

import crypto from "node:crypto";
import { db } from "./db";
import { purchaseFulfillmentSecret, purchaseFulfillmentUrl } from "./settings";

export interface OneTimePurchase {
  session_id: string;
  item_slug: string;
  item_name: string;
  amount_cents: number;
  currency: string;
  customer_email: string | null;
  metadata: string;
  fulfilled_at: string | null;
  created_at: string;
}

export interface PurchaseCompletion {
  sessionId: string;
  itemSlug: string;
  itemName: string;
  amountCents: number;
  currency: string;
  customerEmail: string | null;
  /** Platform-supplied metadata (already sanitized, mag_* keys stripped). */
  metadata: Record<string, string>;
}

/** Strip Magnate-internal metadata keys before storing / echoing platform data. */
export function cleanMetadata(
  metadata: Record<string, string> | null | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(metadata ?? {})) {
    if (k.startsWith("mag_")) continue;
    out[k] = String(v);
  }
  return out;
}

function sign(body: string): string | null {
  const secret = purchaseFulfillmentSecret();
  if (!secret) return null;
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

/**
 * Record a completed one-time Checkout and push the fulfillment callback to
 * the consuming platform.
 *
 * Idempotent: the ledger row is INSERT OR IGNORE by session id, and the
 * callback is re-sent on retry only when the previous attempt failed (the
 * webhook handler does not mark the Stripe event processed until this
 * resolves, so a thrown error makes Stripe retry).
 */
export async function recordPurchaseAndFulfill(
  completion: PurchaseCompletion,
): Promise<void> {
  const metadataJson = JSON.stringify(completion.metadata);
  db.prepare(
    `INSERT OR IGNORE INTO one_time_purchases
       (session_id, item_slug, item_name, amount_cents, currency, customer_email, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    completion.sessionId,
    completion.itemSlug,
    completion.itemName,
    completion.amountCents,
    completion.currency,
    completion.customerEmail,
    metadataJson,
  );

  const fulfillmentUrl = purchaseFulfillmentUrl();
  if (!fulfillmentUrl) {
    // No hook configured — the payment is still ledgered on Magnate; the
    // consuming platform simply won't be notified.
    return;
  }

  const payload = {
    type: "purchase.completed",
    session_id: completion.sessionId,
    item: { slug: completion.itemSlug, name: completion.itemName },
    amount_cents: completion.amountCents,
    currency: completion.currency,
    customer_email: completion.customerEmail,
    metadata: completion.metadata,
  };
  const body = JSON.stringify(payload);
  const signature = sign(body);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(fulfillmentUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(signature
          ? { "X-Magnate-Signature": signature }
          : { "X-Magnate-Signature": "unsigned" }),
      },
      body,
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(
        `purchase fulfillment to ${fulfillmentUrl} failed with HTTP ${res.status}`,
      );
    }
  } finally {
    clearTimeout(timer);
  }

  db.prepare("UPDATE one_time_purchases SET fulfilled_at = datetime('now') WHERE session_id = ?").run(
    completion.sessionId,
  );
}

export function purchaseBySession(sessionId: string): OneTimePurchase | undefined {
  return db
    .prepare("SELECT * FROM one_time_purchases WHERE session_id = ?")
    .get(sessionId) as OneTimePurchase | undefined;
}
