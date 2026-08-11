import { db, parseFeatures, type Plan } from "./db";
import { getStripe, stripeConfigured, stripeCurrency } from "./stripe";

export function listAllPlans(): Plan[] {
  return db
    .prepare("SELECT * FROM plans ORDER BY sort_order, id")
    .all() as Plan[];
}

export function listActivePlans(): Plan[] {
  return db
    .prepare("SELECT * FROM plans WHERE active = 1 ORDER BY sort_order, id")
    .all() as Plan[];
}

export function getPlanBySlug(slug: string): Plan | undefined {
  return db.prepare("SELECT * FROM plans WHERE slug = ?").get(slug) as
    | Plan
    | undefined;
}

export function getPlanById(id: number): Plan | undefined {
  return db.prepare("SELECT * FROM plans WHERE id = ?").get(id) as
    | Plan
    | undefined;
}

export function planPublic(plan: Plan) {
  return {
    id: plan.id,
    name: plan.name,
    slug: plan.slug,
    description: plan.description,
    priceMonthlyCents: plan.price_monthly_cents,
    priceYearlyCents: plan.price_yearly_cents,
    features: parseFeatures(plan),
    highlighted: Boolean(plan.highlighted),
    active: Boolean(plan.active),
  };
}

interface PlanInput {
  name: string;
  slug: string;
  description?: string | null;
  priceMonthlyCents: number;
  priceYearlyCents: number;
  features: string[];
  highlighted: boolean;
  active: boolean;
  sortOrder: number;
}

export function createPlan(input: PlanInput): Plan {
  const info = db
    .prepare(
      `INSERT INTO plans (name, slug, description, price_monthly_cents, price_yearly_cents, features, highlighted, active, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.name,
      input.slug,
      input.description ?? null,
      input.priceMonthlyCents,
      input.priceYearlyCents,
      JSON.stringify(input.features),
      input.highlighted ? 1 : 0,
      input.active ? 1 : 0,
      input.sortOrder,
    );
  return getPlanById(Number(info.lastInsertRowid))!;
}

export function updatePlan(
  id: number,
  input: Partial<PlanInput>,
): Plan | undefined {
  const existing = getPlanById(id);
  if (!existing) return undefined;
  db.prepare(
    `UPDATE plans SET
       name = ?, slug = ?, description = ?, price_monthly_cents = ?, price_yearly_cents = ?,
       features = ?, highlighted = ?, active = ?, sort_order = ?
     WHERE id = ?`,
  ).run(
    input.name ?? existing.name,
    input.slug ?? existing.slug,
    input.description !== undefined ? input.description : existing.description,
    input.priceMonthlyCents ?? existing.price_monthly_cents,
    input.priceYearlyCents ?? existing.price_yearly_cents,
    JSON.stringify(input.features ?? parseFeatures(existing)),
    input.highlighted !== undefined ? (input.highlighted ? 1 : 0) : existing.highlighted,
    input.active !== undefined ? (input.active ? 1 : 0) : existing.active,
    input.sortOrder ?? existing.sort_order,
    id,
  );
  return getPlanById(id);
}

export function deletePlan(id: number): { ok: boolean; error?: string } {
  const userCount = db
    .prepare("SELECT COUNT(*) AS c FROM users WHERE plan_id = ?")
    .get(id) as { c: number };
  if (userCount.c > 0) {
    return {
      ok: false,
      error: "This plan has subscribers. Deactivate it instead of deleting.",
    };
  }
  db.prepare("DELETE FROM plans WHERE id = ?").run(id);
  return { ok: true };
}

interface SyncResult {
  synced: boolean;
  stripeProductId?: string;
  stripePriceMonthlyId?: string;
  stripePriceYearlyId?: string;
}

/**
 * Ensure the plan has a Stripe Product + recurring Prices for month & year.
 * Creates new prices whenever the amount changes (prices are immutable).
 * Returns what changed, or null if Stripe isn't configured (DB-only mode).
 */
export async function syncPlanToStripe(plan: Plan): Promise<SyncResult | null> {
  if (!stripeConfigured()) return null;
  const stripe = getStripe();
  const currency = stripeCurrency();
  const meta = { plan_id: String(plan.id) };

  // 1. Product
  let productId = plan.stripe_product_id;
  if (!productId) {
    const product = await stripe.products.create({
      name: plan.name,
      metadata: meta,
    });
    productId = product.id;
    db.prepare("UPDATE plans SET stripe_product_id = ? WHERE id = ?").run(
      productId,
      plan.id,
    );
  } else {
    await stripe.products.update(productId, { name: plan.name }).catch(() => {});
  }

  // 2. Prices
  async function ensurePrice(
    interval: "month" | "year",
    amount: number,
    existingId: string | null,
    column: "stripe_price_monthly_id" | "stripe_price_yearly_id",
  ): Promise<string | undefined> {
    if (existingId) {
      try {
        const price = await stripe.prices.retrieve(existingId);
        if (price.unit_amount === amount && price.active) return existingId;
        // amount changed — archive old price, create a new one
        await stripe.prices.update(existingId, { active: false });
      } catch {
        // price no longer exists — create fresh
      }
    }
    const price = await stripe.prices.create({
      product: productId!,
      currency,
      unit_amount: amount,
      recurring: { interval },
      metadata: meta,
    });
    db.prepare(`UPDATE plans SET ${column} = ? WHERE id = ?`).run(
      price.id,
      plan.id,
    );
    return price.id;
  }

  const monthlyId = await ensurePrice(
    "month",
    plan.price_monthly_cents,
    plan.stripe_price_monthly_id,
    "stripe_price_monthly_id",
  );
  const yearlyId = await ensurePrice(
    "year",
    plan.price_yearly_cents,
    plan.stripe_price_yearly_id,
    "stripe_price_yearly_id",
  );

  return {
    synced: true,
    stripeProductId: productId,
    stripePriceMonthlyId: monthlyId,
    stripePriceYearlyId: yearlyId,
  };
}
