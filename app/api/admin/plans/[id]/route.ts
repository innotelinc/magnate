import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/route-auth";
import {
  deletePlan,
  getPlanById,
  planPublic,
  syncPlanToStripe,
  updatePlan,
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

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
  } catch {
    return unauthorized();
  }

  const { id } = await ctx.params;
  const planId = Number(id);
  const existing = getPlanById(planId);
  if (!existing) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
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

  const updated = updatePlan(planId, parsed.data);
  if (!updated) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }

  let sync: Awaited<ReturnType<typeof syncPlanToStripe>> = null;
  try {
    sync = await syncPlanToStripe(updated);
  } catch (err) {
    console.error("stripe sync failed", err);
  }

  return NextResponse.json({
    plan: planPublic(updated),
    stripeSynced: sync !== null,
    stripeWarning:
      sync === null
        ? "Stripe not configured — plan changes saved locally only."
        : undefined,
  });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
  } catch {
    return unauthorized();
  }

  const { id } = await ctx.params;
  const result = deletePlan(Number(id));
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
