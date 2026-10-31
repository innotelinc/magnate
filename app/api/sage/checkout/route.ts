import { NextResponse } from "next/server";
import { z } from "zod";
import { getStripe, stripeConfigured } from "@/lib/stripe";
import { stripeCurrency } from "@/lib/settings";
import { getPlanBySlug } from "@/lib/plans";
import { SAGE_MAX_SESSIONS, SAGE_SERVICE, isSageService } from "@/lib/sage";

export const dynamic = "force-dynamic";

const schema = z.object({
  planSlug: z.string().min(1).max(64),
  email: z.string().email().max(254),
  // One session is fifteen minutes of gateway access; a buyer may take several
  // in one payment instead of paying the card fee once per session.
  sessions: z.number().int().min(1).max(SAGE_MAX_SESSIONS).default(1),
});

/**
 * Buy Sage sessions.
 *
 * A one-time payment, not a subscription: the deliverable is an OmniRoute API
 * key with a fifteen-minute life, minted by the webhook once Stripe confirms the
 * money. The price comes from the plan's per-session amount
 * (`price_per_unit_cents`), so the catalog stays the single place a price is
 * set — nothing is hard-coded here.
 */
export async function POST(req: Request) {
  if (!stripeConfigured()) {
    return NextResponse.json(
      { error: "Billing is not configured." },
      { status: 503 },
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
  const { planSlug, email, sessions } = parsed.data;

  const plan = getPlanBySlug(planSlug);
  if (!plan || !plan.active || !isSageService(plan.service)) {
    return NextResponse.json(
      { error: "That Sage session is not available." },
      { status: 404 },
    );
  }

  const unitCents = plan.price_per_unit_cents ?? 0;
  if (!unitCents || unitCents <= 0) {
    return NextResponse.json(
      { error: "This session is not priced yet." },
      { status: 500 },
    );
  }

  const appUrl = process.env.APP_URL || "http://localhost:3000";

  try {
    // The price is sent inline rather than as a Stripe Price: a Sage plan is
    // priced per session and never renews, so there is nothing to keep in sync
    // with the catalog, and a re-price takes effect on the next checkout.
    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: stripeCurrency(),
            unit_amount: unitCents,
            product_data: {
              name: plan.name,
              description:
                plan.description ??
                `Sage ${SAGE_SERVICE} session — fifteen minutes of gateway access.`,
            },
          },
          quantity: sessions,
        },
      ],
      customer_email: email,
      metadata: {
        // `mag_` is the reserved namespace (see lib/purchases.ts): the webhook
        // reads these before stripping them, and the purchase ledger never
        // stores internal keys.
        mag_sage_plan: plan.slug,
        mag_sage_sessions: String(sessions),
        mag_sage_email: email,
      },
      success_url: `${appUrl}/success?session_id={CHECKOUT_SESSION_ID}&kind=sage`,
      cancel_url: `${appUrl}/sage`,
      allow_promotion_codes: true,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("sage session checkout failed", err);
    return NextResponse.json(
      {
        error:
          "Could not start the checkout. Please make sure billing is configured and try again.",
      },
      { status: 500 },
    );
  }
}
