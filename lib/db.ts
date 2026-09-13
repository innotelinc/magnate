import Database from "better-sqlite3";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const dbPath =
  process.env.DATABASE_PATH ||
  path.join(process.cwd(), "data", "magnate.db");

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

// `next build` imports this module from several parallel workers at once, and
// every one opens the same SQLite file. A generous busy timeout plus tolerating
// a transient lock failure on the WAL pragma keeps concurrent first-open from
// crashing the build with SQLITE_BUSY ("database is locked").
export const db = new Database(dbPath, { timeout: 15_000 });
try {
  db.pragma("busy_timeout = 15000");
  db.pragma("journal_mode = WAL");
} catch {
  // Another worker is initializing the same database right now. WAL is only an
  // optimization — the database works fine without it.
}
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    price_monthly_cents INTEGER NOT NULL DEFAULT 0,
    price_yearly_cents INTEGER NOT NULL DEFAULT 0,
    stripe_product_id TEXT,
    stripe_price_monthly_id TEXT,
    stripe_price_yearly_id TEXT,
    features TEXT NOT NULL DEFAULT '[]',
    highlighted INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tenants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    tagline TEXT NOT NULL DEFAULT 'Subscription Platform',
    description TEXT,
    domains TEXT NOT NULL DEFAULT '[]',
    footer_note TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    username TEXT NOT NULL UNIQUE,
    jellyfin_user_id TEXT,
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    plan_id INTEGER,
    status TEXT NOT NULL DEFAULT 'pending',
    current_period_end INTEGER,
    password_enc TEXT,
    credentials_claimed_at TEXT,
    provisioning_error TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (plan_id) REFERENCES plans(id)
  );

  CREATE TABLE IF NOT EXISTS credential_claims (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    checkout_session_id TEXT NOT NULL UNIQUE,
    username TEXT NOT NULL,
    password_enc TEXT NOT NULL,
    claimed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS admin_sessions (
    token TEXT PRIMARY KEY,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS webhook_events (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    processed_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS referral_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    referrer_user_id INTEGER NOT NULL,
    referred_user_id INTEGER NOT NULL,
    amount_cents INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS payments (
    invoice_id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    amount_cents INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'usd',
    period_start INTEGER,
    period_end INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- One-off purchases (server-to-server, consuming platforms like Rizz Aura).
  -- Keyed by the Stripe Checkout session id; consumers are told via the
  -- fulfillment webhook (settings.purchase_fulfillment_url), never by holding
  -- Stripe keys. Distinct from payments (subscription invoices) so recurring
  -- MRR analytics are not polluted by cash-shop revenue.
  CREATE TABLE IF NOT EXISTS one_time_purchases (
    session_id TEXT PRIMARY KEY,
    item_slug TEXT NOT NULL,
    item_name TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'usd',
    customer_email TEXT,
    metadata TEXT NOT NULL DEFAULT '{}',
    fulfilled_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

/* ---------- schema migrations (idempotent, safe on existing DBs) ---------- */

function ensureColumn(
  table: string,
  column: string,
  ddl: string,
): void {
  const has = () =>
    (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
      name: string;
    }>).some((c) => c.name === column);

  if (has()) return;
  try {
    db.prepare(`ALTER TABLE ${table} ADD COLUMN ${ddl}`).run();
  } catch (err) {
    // Concurrent build workers race the same ALTER. If another worker added
    // the column between our PRAGMA check and this statement, swallow it.
    if (has()) return;
    throw err;
  }
}

ensureColumn("users", "tenant_id", "tenant_id INTEGER NOT NULL DEFAULT 1");
ensureColumn("users", "referral_code", "referral_code TEXT");
ensureColumn("users", "referred_by", "referred_by TEXT");
ensureColumn(
  "users",
  "referrals_count",
  "referrals_count INTEGER NOT NULL DEFAULT 0",
);
ensureColumn(
  "users",
  "referral_earned_cents",
  "referral_earned_cents INTEGER NOT NULL DEFAULT 0",
);
ensureColumn(
  "users",
  "payment_failed_count",
  "payment_failed_count INTEGER NOT NULL DEFAULT 0",
);
ensureColumn("users", "last_payment_failed_at", "last_payment_failed_at TEXT");
ensureColumn("users", "winback_status", "winback_status TEXT");

// The service a plan belongs to. Empty ("generic") = the platform-wide
// membership the storefront sells; any other value is a product funnel: the
// master dashboard prices each service here, and that service's subscribe page
// reads its own price back through /api/plans?service=<slug>.
ensureColumn("plans", "service", "service TEXT NOT NULL DEFAULT 'generic'");

db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_users_referral_code
    ON users(referral_code);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_events_referred
    ON referral_events(referred_user_id);
  CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
  CREATE INDEX IF NOT EXISTS idx_payments_created ON payments(created_at);
`);

export interface Plan {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  price_monthly_cents: number;
  price_yearly_cents: number;
  stripe_product_id: string | null;
  stripe_price_monthly_id: string | null;
  stripe_price_yearly_id: string | null;
  features: string;
  highlighted: number;
  active: number;
  sort_order: number;
  service: string;
  created_at: string;
}

export interface UserRow {
  id: number;
  email: string;
  username: string;
  jellyfin_user_id: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  plan_id: number | null;
  status: string;
  current_period_end: number | null;
  password_enc: string | null;
  credentials_claimed_at: string | null;
  provisioning_error: string | null;
  tenant_id: number;
  referral_code: string | null;
  referred_by: string | null;
  referrals_count: number;
  referral_earned_cents: number;
  payment_failed_count: number;
  last_payment_failed_at: string | null;
  winback_status: string | null;
  created_at: string;
}

export interface Tenant {
  id: number;
  slug: string;
  name: string;
  tagline: string;
  description: string | null;
  domains: string;
  footer_note: string | null;
  active: number;
  created_at: string;
}

export function parseFeatures(plan: Pick<Plan, "features">): string[] {
  try {
    const parsed = JSON.parse(plan.features);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

/** Parse a tenant's comma/JSON-separated domain list into hostnames. */
export function parseTenantDomains(tenant: Pick<Tenant, "domains">): string[] {
  const raw = tenant.domains.trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    // fall through to comma-separated parsing
  }
  return raw
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

const DEFAULT_PLANS = [
  {
    // Basic/Standard/Premium ARE the Monarch streaming membership today — the
    // storefront grid is Monarch's funnel. The dashboard re-prices any of them.
    name: "Basic",
    slug: "basic",
    description: "Great for getting started on a single device.",
    price_monthly_cents: 300,
    price_yearly_cents: 3000,
    features: JSON.stringify([
      "Unlimited movies & TV shows",
      "Stream on 1 device at a time",
      "480p Standard Definition",
      "Watch on TV, phone & tablet",
    ]),
    service: "monarch",
    highlighted: 0,
    sort_order: 0,
  },
  {
    name: "Standard",
    slug: "standard",
    description: "Perfect for streaming on a couple of devices.",
    price_monthly_cents: 700,
    price_yearly_cents: 7000,
    features: JSON.stringify([
      "Unlimited movies & TV shows",
      "Stream on 2 devices at once",
      "1080p Full HD quality",
      "Watch on TV, phone & tablet",
    ]),
    service: "monarch",
    highlighted: 0,
    sort_order: 1,
  },
  {
    name: "Premium",
    slug: "premium",
    description: "The full experience for the whole household.",
    price_monthly_cents: 1000,
    price_yearly_cents: 10000,
    features: JSON.stringify([
      "Everything in Standard",
      "Stream on 4 devices at once",
      "4K HDR quality",
      "Priority support",
      "Early access to new content",
      "Exclusive movie & TV request access",
    ]),
    service: "monarch",
    highlighted: 1,
    sort_order: 2,
  },
  {
    name: "AI Agents",
    slug: "agents",
    // service="zeus": the Capstone voice-agents add-on is priced for (and sold
    // from) the Zeus funnel, not the generic storefront.
    service: "zeus",
    description: "AI voice agent add-on — sold from the Zeus voice & PBX billing page.",
    price_monthly_cents: 4900,
    price_yearly_cents: 49000,
    features: JSON.stringify([
      "Inbound DID routing for voice agents",
      "AI voice agent seat",
      "Workflow Studio access",
    ]),
    // highlighted=2 marks an add-on plan: purchasable via /signup?plan=agents
    // but hidden from the storefront pricing grid (listStorefrontPlans).
    highlighted: 2,
    sort_order: 100,
  },
];

/**
 * The services the master dashboard prices. Every service in the Innotel stack
 * that sells anything gets a row — the dashboard lists ALL of them (even ones
 * with no plan yet), and each service's subscribe page reads its price back via
 * /api/plans?service=<slug>. A service with no plan simply renders "not sold
 * here yet" on its page instead of a price.
 */
export const SERVICES: { slug: string; name: string; subscribe_url: string }[] = [
  { slug: "magnate", name: "Magnate (platform membership)", subscribe_url: "https://subscribe.innotel.us" },
  { slug: "monarch", name: "Monarch — streaming", subscribe_url: "https://subscribe.monarch.innotel.us" },
  { slug: "zeus", name: "Zeus — voice & PBX", subscribe_url: "https://subscribe.zeus.innotel.us" },
  { slug: "capstone", name: "Capstone — voice AI", subscribe_url: "https://subscribe.capstone.innotel.us" },
  { slug: "oasis", name: "Oasis — mail & collaboration", subscribe_url: "https://subscribe.oasis.innotel.us" },
  { slug: "onyx", name: "Onyx — object storage", subscribe_url: "https://subscribe.onyx.innotel.us" },
  { slug: "signara", name: "Signara — trust & signing", subscribe_url: "https://subscribe.signara.innotel.us" },
  { slug: "atlas", name: "Atlas — DevOps platform", subscribe_url: "https://subscribe.atlas.innotel.us" },
  { slug: "atheniq", name: "AthenIQ — learning", subscribe_url: "https://subscribe.atheniq.innotel.us" },
  { slug: "olympus", name: "Olympus — AI studio", subscribe_url: "https://subscribe.olympus.innotel.us" },
  { slug: "plutus", name: "PLUTUS — AI shopping channel", subscribe_url: "https://subscribe.plutus.innotel.us" },
  { slug: "distro", name: "Distro — builder platform", subscribe_url: "https://subscribe.distro.innotel.us" },
  { slug: "rizzaura", name: "Rizz Aura — community", subscribe_url: "https://subscribe.rizzaura.innotel.us" },
  { slug: "zapit", name: "ZapIt — short links", subscribe_url: "https://subscribe.zapit.innotel.us" },
];

const DEFAULT_TENANT = {
  slug: "magnate",
  name: "Magnate",
  tagline: "Billing Platform",
  description:
    "Magnate is the billing platform for the whole stack — media streaming, PBX hosting, AI voice agents and every other service on one account with one invoice. Managed memberships, recurring billing and one-off purchases across the platform.",
  domains: JSON.stringify([
    "magnate.innotel.us",
    "app.magnate.innotel.us",
    // The canonical public billing/storefront domain for the whole Innotel
    // stack (Stripe webhook + checkout redirects are registered here).
    "subscribe.innotel.us",
  ]),
  footer_note: "Payments processed securely by Stripe.",
  active: 1,
};

function seedPlans() {
  const count = db.prepare("SELECT COUNT(*) AS c FROM plans").get() as {
    c: number;
  };
  if (count.c > 0) return;
  // INSERT OR IGNORE keeps seeding idempotent even when multiple processes
  // (e.g. build workers) initialize the database at the same time.
  const insert = db.prepare(`
    INSERT OR IGNORE INTO plans (name, slug, description, price_monthly_cents, price_yearly_cents, features, highlighted, sort_order, service)
    VALUES (@name, @slug, @description, @price_monthly_cents, @price_yearly_cents, @features, @highlighted, @sort_order, @service)
  `);
  const tx = db.transaction(() => {
    for (const plan of DEFAULT_PLANS) insert.run(plan);
  });
  try {
    tx();
  } catch {
    // Another process seeded the plans first — nothing to do.
  }
}

/**
 * Align existing plan rows with the DEFAULT_PLANS spec's service ownership
 * (e.g. `agents` → "zeus"). Only touches rows whose service is still the
 * column default — a service the admin set in the dashboard is never
 * overridden. Idempotent, so it runs on every boot.
 */
function backfillPlanServices() {
  const update = db.prepare(
    "UPDATE plans SET service = @service WHERE slug = @slug AND service = 'generic'",
  );
  const tx = db.transaction(() => {
    for (const plan of DEFAULT_PLANS) {
      if (plan.service && plan.service !== "generic") {
        update.run({ slug: plan.slug, service: plan.service });
      }
    }
  });
  try {
    tx();
  } catch {
    // Another worker migrated first — nothing to do.
  }
}

function seedTenant() {
  const row = db
    .prepare("SELECT COUNT(*) AS c FROM tenants WHERE slug = ?")
    .get(DEFAULT_TENANT.slug) as { c: number };
  if (row.c > 0) return;
  db.prepare(
    `INSERT OR IGNORE INTO tenants (slug, name, tagline, description, domains, footer_note, active)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    DEFAULT_TENANT.slug,
    DEFAULT_TENANT.name,
    DEFAULT_TENANT.tagline,
    DEFAULT_TENANT.description,
    DEFAULT_TENANT.domains,
    DEFAULT_TENANT.footer_note,
    DEFAULT_TENANT.active,
  );
}

/* ---------- referral code backfill for pre-existing users ---------- */

// Unambiguous alphabet (no 0/O, 1/I/L) — safe to hand out in chat/print.
const REFERRAL_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateReferralCode(length = 8): string {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += REFERRAL_ALPHABET[bytes[i] % REFERRAL_ALPHABET.length];
  }
  return out;
}

function backfillReferralCodes() {
  const missing = db
    .prepare("SELECT id FROM users WHERE referral_code IS NULL")
    .all() as Array<{ id: number }>;
  const setCode = db.prepare(
    "UPDATE users SET referral_code = ? WHERE id = ?",
  );
  const tx = db.transaction((rows: Array<{ id: number }>) => {
    for (const row of rows) {
      for (let attempt = 0; attempt < 10; attempt++) {
        const code = generateReferralCode();
        const taken = db
          .prepare("SELECT id FROM users WHERE referral_code = ?")
          .get(code);
        if (!taken) {
          setCode.run(code, row.id);
          break;
        }
      }
    }
  });
  try {
    tx(missing);
  } catch {
    // Another process is backfilling concurrently — safe to skip.
  }
}

seedPlans();
seedTenant();
backfillPlanServices();
backfillReferralCodes();