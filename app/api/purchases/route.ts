// Magnate — one-off purchase Checkout (server-to-server, cash-shop items).
//
// Consuming platforms (e.g. Rizz Aura) create hosted Stripe Checkout sessions
// for one-time items under Magnate's Stripe account. Magnate owns the revenue
// ledger; the platform is notified on completion through its fulfillment hook
// (settings.purchase_fulfillment_url) and never holds Stripe keys.
//
// Contract:
//   POST /api/purchases
//   {
//     item: { slug: "slot", name: "Aura Board Slot — Lil Bro Inc.",
//             unitAmountCents: 500 },
//     metadata?: { sku: "slot", name: "...", target: "...", ... },  // passthrough
//     customerEmail?: "buyer@example.com",
//     successUrl?: "https://app.rizz.innotel.us/?paid=1&session={CHECKOUT_SESSION_ID}",
//     cancelUrl?:  "https://app.rizz.innotel.us/?paid=0",
//   }
//   → 200 { url, id, item } · 400 invalid · 401 bad/missing token ·
//     500 billing not configured
//
// Gate: same optional bearer token as the entitlements API
// (ENTITLEMENTS_API_TOKEN). Unset = open (self-hosted/trusted net).
import { NextResponse } from "next/server";
import { z } from "zod";
import { getStripe, stripeConfigured, stripeCurrency } from "@/lib/stripe";

export const dynamic = "force-dynamic";

const itemSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/, "Item slug must be lowercase letters, numbers or dashes."),
  name: z.string().min(1).max(80),
  unitAmountCents: z.number().int().min(50).max(50_000_000),
});

const schema = z.object({
  item: itemSchema,
  metadata: z.record(z.string(), z.string()).optional().default({}),
  customerEmail: z.string().email().max(254).optional(),
  successUrl: z.string().url().max(2048).optional(),
  cancelUrl: z.string().url().max(2048).optional(),
});

const MAX_METADATA_ENTRIES = 24;

function purchasesToken(): string | undefined {
  return process.env.ENTITLEMENTS_API_TOKEN || undefined;
}

export async function POST(req: Request) {
  const token = purchasesToken();
  if (token) {
    const auth = req.headers.get("authorization") ?? "";
    const bearer = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
    if (bearer !== token) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  if (!stripeConfigured()) {
    return NextResponse.json(
      { error: "Stripe billing is not configured on Magnate." },
      { status: 500 },
    );
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
  const { item, customerEmail, successUrl, cancelUrl } = parsed.data;

  // Sanitize the platform's metadata: values are strings already (zod), but
  // cap entry count and key/value lengths to Stripe's limits (Stripe allows
  // 50 keys; keys ≤ 40 chars, values ≤ 500 chars) and namespace Magnate's own
  // fields `mag_*` so they can never collide with platform keys.
  const metadata: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed.data.metadata)) {
    if (Object.keys(metadata).length >= MAX_METADATA_ENTRIES) break;
    const key = k.slice(0, 40);
    if (!key) continue;
    metadata[key] = v.slice(0, 500);
  }
  metadata.mag_item_slug = item.slug;
  metadata.mag_item_name = item.name;

  const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");

  try {
    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: stripeCurrency().toLowerCase(),
            unit_amount: item.unitAmountCents,
            product_data: { name: item.name },
          },
        },
      ],
      ...(customerEmail ? { customer_email: customerEmail } : {}),
      metadata,
      success_url: successUrl ?? `${appUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl ?? `${appUrl}/cancel`,
    });
    return NextResponse.json({ url: session.url, id: session.id, item });
  } catch (err) {
    console.error("purchase session creation failed", err);
    return NextResponse.json(
      { error: "Could not start the checkout. Please try again." },
      { status: 500 },
    );
  }
}
