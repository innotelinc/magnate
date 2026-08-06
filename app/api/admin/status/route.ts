import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/route-auth";
import { stripeConfigured } from "@/lib/stripe";
import { jellyfinConfigured } from "@/lib/jellyfin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    stripeConfigured: stripeConfigured(),
    stripeWebhookConfigured: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    jellyfinConfigured: jellyfinConfigured(),
    jellyfinUrl: process.env.JELLYFIN_URL || "https://media.innotel.us",
    adminPasswordSet: Boolean(process.env.ADMIN_PASSWORD),
    stripeCurrency: process.env.STRIPE_CURRENCY || "usd",
  });
}
