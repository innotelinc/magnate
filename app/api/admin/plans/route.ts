import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/route-auth";
import {
  createPlan,
  listAllPlans,
  planPublic,
  syncPlanToStripe,
} from "@/lib/plans";

export const dynamic = "force-dynamic";

const planSchema = z.object({
  name: z.string().min(1).max(64),
  slug: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers or dashes."),
  description: z.string().max(300).optional().nullable(),
  priceMonthlyCents: z.number().int().min(0).max(100000000),
  priceYearlyCents: z.number().int().min(0).max(100000000),
  features: z.array(z.string().max(200)).max(12),
  highlighted: z.boolean().optional().default(false),
  active: z.boolean().optional().default(true),
  sortOrder: z.number().int().optional().default(0),
});

async function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return unauthorized();
  }
  return NextResponse.json({ plans: listAllPlans().map(planPublic) });
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
  } catch {
    return unauthorized();
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = planSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const plan = createPlan(parsed.data);
  let sync: Awaited<ReturnType<typeof syncPlanToStripe>> = null;
  try {
    sync = await syncPlanToStripe(plan);
  } catch (err) {
    console.error("stripe sync failed", err);
  }

  return NextResponse.json({
    plan: planPublic(plan),
    stripeSynced: sync !== null,
    stripeWarning: sync === null ? "Stripe not configured — plan saved locally." : undefined,
  });
}
