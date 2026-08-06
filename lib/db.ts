import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const dbPath =
  process.env.DATABASE_PATH ||
  path.join(process.cwd(), "data", "jellyfin.db");

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

const DEFAULT_PLANS = [
  {
    name: "Standard",
    slug: "standard",
    description: "Perfect for streaming on a couple of devices.",
    price_monthly_cents: 500,
    price_yearly_cents: 5000,
    features: JSON.stringify([
      "Unlimited movies & TV shows",
      "Stream on 2 devices at once",
      "1080p Full HD quality",
      "Watch on TV, phone & tablet",
    ]),
    highlighted: 0,
    sort_order: 1,
  },
  {
    name: "Premium",
    slug: "premium",
    description: "The full experience for the whole household.",
    price_monthly_cents: 800,
    price_yearly_cents: 8000,
    features: JSON.stringify([
      "Everything in Standard",
      "Stream on 4 devices at once",
      "4K HDR quality",
      "Priority support",
      "Early access to new content",
    ]),
    highlighted: 1,
    sort_order: 2,
  },
];

function seedPlans() {
  const count = db.prepare("SELECT COUNT(*) AS c FROM plans").get() as {
    c: number;
  };
  if (count.c > 0) return;
  // INSERT OR IGNORE keeps seeding idempotent even when multiple processes
  // (e.g. build workers) initialize the database at the same time.
  const insert = db.prepare(`
    INSERT OR IGNORE INTO plans (name, slug, description, price_monthly_cents, price_yearly_cents, features, highlighted, sort_order)
    VALUES (@name, @slug, @description, @price_monthly_cents, @price_yearly_cents, @features, @highlighted, @sort_order)
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

seedPlans();
