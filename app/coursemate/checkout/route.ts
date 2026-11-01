import { NextResponse } from "next/server";
import { z } from "zod";
import { getStripe, stripeConfigured } from "@/lib/stripe";
import { coursemateKeyDays, stripeCurrency } from "@/lib/settings";
import { getPlanBySlug } from "@/lib/plans";
import { COURSEMATE_MAX_KEYS, isCourseMateService } from "@/lib/coursemate";

export const dynamic = "force-dynamic";

const schema = z.object({
  planSlug: z.string().min(1).max(64),
  email: z.string().email().max(254),
  keys: z.number().int().min(1).max(COURSEMATE_MAX_KEYS).default(1),
});

/**
 * Buy CourseMate keys.
 *
 * One payment, not a subscription: the deliverable is an OmniRoute API key with
 * a deadline, minted by the webhook once Stripe confirms the money. The price
 * comes from the plan's per-key amount (`price_per_unit_cents`), so the catalog
 * stays the single place a price is set and nothing is hard-coded here.
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
  const { planSlug, email, keys } = parsed.data;

  const plan = getPlanBySlug(planSlug);
  if (!plan || !plan.active || !isCourseMateService(plan.service)) {
    return NextResponse.json(
      { error: "That CourseMate key is not available." },
      { status: 404 },
    );
  }

  const unitCents = plan.price_per_unit_cents ?? 0;
  if (!unitCents || unitCents <= 0) {
    return NextResponse.json(
      { error: "This key is not priced yet." },
      { status: 500 },
    );
  }

  const appUrl = process.env.APP_URL || "http://localhost:3000";
  const days = coursemateKeyDays();

  try {
    // Priced inline rather than as a Stripe Price: a key never renews, so there
    // is nothing to keep in sync with the catalog and a re-price takes effect on
    // the next checkout.
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
                `CourseMate API key — ${days} days on gateway.innotel.us.`,
            },
          },
          quantity: keys,
        },
      ],
      customer_email: email,
      metadata: {
        // The `mag_` namespace is reserved (see lib/purchases.ts): the webhook
        // reads these before stripping them and the ledger never stores them.
        mag_coursemate_plan: plan.slug,
        mag_coursemate_keys: String(keys),
        mag_coursemate_email: email,
      },
      success_url: `${appUrl}/success?session_id={CHECKOUT_SESSION_ID}&kind=coursemate`,
      cancel_url: `${appUrl}/coursemate`,
      allow_promotion_codes: true,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("coursemate key checkout failed", err);
    return NextResponse.json(
      {
        error:
          "Could not start the checkout. Please make sure billing is configured and try again.",
      },
      { status: 500 },
    );
  }
}
