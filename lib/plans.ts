import { db, parseFeatures, type Plan } from "./db";
import { getStripe, stripeConfigured, stripeCurrency } from "./stripe";

export function listAllPlans(): Plan[] {
  return db
    .prepare("SELECT * FROM plans ORDER BY sort_order, id")
    .all() as Plan[];
}

/**
 * The plans of ONE service, for that service's subscribe page.
 * `service` is the column set by the master dashboard; "generic" is the
 * platform-wide membership the storefront sells.
 */
export function listPlansForService(service: string): Plan[] {
  return db
    .prepare(
      "SELECT * FROM plans WHERE service = ? AND active = 1 ORDER BY sort_order, id",
    )
    .all(service) as Plan[];
}

export function listActivePlans(): Plan[] {
  return db
    .prepare("SELECT * FROM plans WHERE active = 1 ORDER BY sort_order, id")
    .all() as Plan[];
}

/** Every plan grouped by owning service — the master dashboard's overview. */
export function listPlansByService(): Record<string, Plan[]> {
  const grouped: Record<string, Plan[]> = {};
  for (const plan of listActivePlans()) {
    const key = plan.service || "generic";
    (grouped[key] ??= []).push(plan);
  }
  return grouped;
}

/**
 * Plans shown in the platform's own storefront grid.
 *
 * There is deliberately NO shared catalog: a plan belongs to exactly one
 * service (`plans.service`), and every service prices itself on its own
 * subscribe page via `listPlansForService()`. This function therefore returns
 * only platform-level plans (service unset/empty/'generic') — never another
 * service's prices, which would present e.g. Monarch's $3/mo as the price of
 * the platform. Add-on plans (`highlighted = 2`) are excluded too: they are
 * purchased through their own service's funnel.
 *
 * Today the table holds no platform-level plans, so this returns an empty
 * list and the storefront renders its "every service prices itself" panel.
 */
export function listStorefrontPlans(): Plan[] {
  return db
    .prepare(
      "SELECT * FROM plans WHERE active = 1 AND highlighted != 2 " +
        "AND (service IS NULL OR TRIM(service) = '' OR service = 'generic') " +
        "ORDER BY sort_order, id",
    )
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

/**
 * Highlight storage: 0 = plain storefront plan, 1 = “Most popular” storefront
 * plan, 2 = add-on plan (sold from its own product funnel, hidden from the
 * storefront pricing grid by listStorefrontPlans).
 */
export type HighlightKind = 0 | 1 | 2;

export function toHighlightInt(opts: {
  addon?: boolean;
  highlighted?: boolean;
}): number {
  if (opts.addon) return 2;
  return opts.highlighted ? 1 : 0;
}

/**
 * The unit a plan is sold in, or "" when it is sold as one subscription.
 *
 * Trimmed because the column arrives through `ALTER TABLE … DEFAULT ''` and a
 * unit of spaces would name a unit nobody can read.
 */
export function billingUnitOf(plan: Plan): string {
  return (plan.billing_unit ?? "").trim();
}

/**
 * Whether this plan is billed per unit (e.g. per class) rather than as one
 * subscription.
 *
 * Both halves have to be there: a unit names what the count *is*, and a price
 * says what one costs. A plan with a unit but no price is a plan whose per-unit
 * amount is not decided yet — billing it would charge zero per unit, so it is
 * not treated as a per-unit plan until an amount is set.
 */
export function isPerUnit(plan: Plan): boolean {
  return billingUnitOf(plan) !== "" && plan.price_per_unit_cents > 0;
}

export function planPublic(plan: Plan) {
  return {
    id: plan.id,
    name: plan.name,
    slug: plan.slug,
    description: plan.description,
    priceMonthlyCents: plan.price_monthly_cents,
    priceYearlyCents: plan.price_yearly_cents,
    // How the plan is sold, for the catalog's readers: consumers quote the price
    // beside the unit (`$27.50 per class`) instead of inventing one, and a plan
    // sold as a whole subscription says so by naming no unit.
    billingUnit: billingUnitOf(plan),
    pricePerUnitCents: plan.price_per_unit_cents ?? 0,
    perUnit: isPerUnit(plan),
    features: parseFeatures(plan),
    highlighted: plan.highlighted === 1,
    addon: plan.highlighted === 2,
    active: Boolean(plan.active),
    service: plan.service || "generic",
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
  addon: boolean;
  active: boolean;
  sortOrder: number;
  /** Which service this plan is sold for ("generic" = platform membership). */
  service?: string;
  /** The unit the plan is sold in multiples of (e.g. "class"); "" = one plan. */
  billingUnit?: string;
  /** What one unit costs per month, in cents; 0 = no per-unit price set. */
  pricePerUnitCents?: number;
}

export function createPlan(input: PlanInput): Plan {
  const info = db
    .prepare(
      `INSERT INTO plans (name, slug, description, price_monthly_cents, price_yearly_cents, features, highlighted, active, sort_order, service, billing_unit, price_per_unit_cents)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.name,
      input.slug,
      input.description ?? null,
      input.priceMonthlyCents,
      input.priceYearlyCents,
      JSON.stringify(input.features),
      toHighlightInt({ addon: input.addon, highlighted: input.highlighted }),
      input.active ? 1 : 0,
      input.sortOrder,
      input.service ?? "generic",
      (input.billingUnit ?? "").trim(),
      input.pricePerUnitCents ?? 0,
    );
  return getPlanById(Number(info.lastInsertRowid))!;
}

export function updatePlan(
  id: number,
  input: Partial<PlanInput>,
): Plan | undefined {
  const existing = getPlanById(id);
  if (!existing) return undefined;
  const nextHighlight =
    input.addon !== undefined || input.highlighted !== undefined
      ? toHighlightInt({
          addon:
            input.addon ?? (existing.highlighted === 2),
          highlighted:
            input.highlighted ?? (existing.highlighted === 1),
        })
      : existing.highlighted;
  db.prepare(
    `UPDATE plans SET
       name = ?, slug = ?, description = ?, price_monthly_cents = ?, price_yearly_cents = ?,
       features = ?, highlighted = ?, active = ?, sort_order = ?, service = ?,
       billing_unit = ?, price_per_unit_cents = ?
     WHERE id = ?`,
  ).run(
    input.name ?? existing.name,
    input.slug ?? existing.slug,
    input.description !== undefined ? input.description : existing.description,
    input.priceMonthlyCents ?? existing.price_monthly_cents,
    input.priceYearlyCents ?? existing.price_yearly_cents,
    JSON.stringify(input.features ?? parseFeatures(existing)),
    nextHighlight,
    input.active !== undefined ? (input.active ? 1 : 0) : existing.active,
    input.sortOrder ?? existing.sort_order,
    input.service ?? existing.service ?? "generic",
    input.billingUnit !== undefined
      ? input.billingUnit.trim()
      : billingUnitOf(existing),
    input.pricePerUnitCents ?? existing.price_per_unit_cents ?? 0,
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
  /** The recurring price for one unit, when the plan is sold per unit. */
  stripePricePerUnitId?: string;
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
    column:
      | "stripe_price_monthly_id"
      | "stripe_price_yearly_id"
      | "stripe_price_per_unit_id",
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

  // A per-unit plan bills the unit count against one recurring price, so the
  // amount that has to exist in Stripe is `price_per_unit_cents` — monthly, the
  // only interval a per-unit plan has. The plan-level month/year figures are
  // left out deliberately: they are zero on such a plan, and creating a $0
  // price in the live account is a price something could be billed against.
  if (isPerUnit(plan)) {
    const perUnitId = await ensurePrice(
      "month",
      plan.price_per_unit_cents,
      plan.stripe_price_per_unit_id,
      "stripe_price_per_unit_id",
    );
    return {
      synced: true,
      stripeProductId: productId,
      stripePricePerUnitId: perUnitId,
    };
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
