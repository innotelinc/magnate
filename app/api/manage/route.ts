import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getStripe, stripeConfigured } from "@/lib/stripe";

export const dynamic = "force-dynamic";

const schema = z.object({
  email: z.string().email(),
});

/** Open a Stripe Customer Portal session so users can manage/cancel their plan. */
export async function POST(req: Request) {
  if (!stripeConfigured()) {
    return NextResponse.json(
      { error: "Billing is not configured." },
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
      { error: "Please enter a valid email address." },
      { status: 400 },
    );
  }

  const user = db
    .prepare("SELECT * FROM users WHERE lower(email) = lower(?)")
    .get(parsed.data.email) as
    | { stripe_customer_id: string | null }
    | undefined;

  if (!user?.stripe_customer_id) {
    return NextResponse.json(
      { error: "No subscription found for that email address." },
      { status: 404 },
    );
  }

  try {
    const session = await getStripe().billingPortal.sessions.create({
      customer: user.stripe_customer_id,
      return_url: `${process.env.APP_URL || "http://localhost:3000"}/manage?success=1`,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("portal session creation failed", err);
    return NextResponse.json(
      { error: "Could not open the billing portal. Try again later." },
      { status: 500 },
    );
  }
}
