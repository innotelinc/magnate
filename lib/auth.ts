import crypto from "node:crypto";
import { db } from "./db";
import { adminPassword } from "./settings";

const COOKIE_NAME = "admin_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export { COOKIE_NAME };

/**
 * Admin sign-in is Authentik-only by default: the panel is the storefront's
 * back office, and identity is Cerulean's Authentik (the stack's IdentityOps
 * platform), so keeping a second local password was a second identity store.
 *
 * BREAKGLASS_LOGIN=1 re-enables the password path. It exists for recovery —
 * when Authentik is unreachable — and is meant to be set, used, then unset.
 * Both halves honour it: the login page hides the password form, and
 * /api/admin/login refuses to mint a session while it is off.
 */
export function breakglassLoginEnabled(): boolean {
  const v = (process.env.BREAKGLASS_LOGIN ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

export function verifyAdminPassword(password: string): boolean {
  const expected = adminPassword();
  if (!expected) return false;
  const a = Buffer.from(String(password));
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function createAdminSession(): string {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  db.prepare(
    "INSERT INTO admin_sessions (token, expires_at) VALUES (?, ?)",
  ).run(token, expiresAt);
  return token;
}

export function destroyAdminSession(token: string): void {
  db.prepare("DELETE FROM admin_sessions WHERE token = ?").run(token);
}

export function validateAdminToken(token: string | null | undefined): boolean {
  if (!token) return false;
  const row = db
    .prepare("SELECT expires_at FROM admin_sessions WHERE token = ?")
    .get(token) as { expires_at: string } | undefined;
  if (!row) return false;
  return new Date(row.expires_at).getTime() > Date.now();
}

/* ---------- standing admin API keys (automation) ---------- */

/**
 * A standing admin API key is the *other* way to be an admin here.
 *
 * The panel is a person at a browser: Cerulean signs them in, the session lasts
 * a week, and when it is gone they sign in again. Automation has no browser, and
 * the only alternative was to re-enable break-glass, sign in with a password and
 * restart the app — for every routine change, forever. So a key is a credential
 * that does not expire, is not tied to a machine, and can be revoked on its own.
 *
 * What is stored is a SHA-256 of the key and never the key: a database copy, a
 * backup, an export is then not a set of working credentials, and the value
 * exists in exactly one place after it is minted — wherever it was written down.
 */
const ADMIN_KEY_PREFIX = "mag_admin_";

export interface AdminApiKey {
  id: number;
  name: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

const KEY_COLUMNS = "id, name, created_at, last_used_at, revoked_at";

function hashAdminApiKey(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Mint a key and return its value — the only time it is ever readable.
 *
 * No expiry, deliberately: a key that stops working should stop because someone
 * revoked it, not because it quietly timed out and the automation started
 * failing in a way nobody can see from the dashboard.
 */
export function mintAdminApiKey(name: string): { key: AdminApiKey; token: string } {
  const token = ADMIN_KEY_PREFIX + crypto.randomBytes(32).toString("hex");
  const info = db
    .prepare("INSERT INTO admin_api_keys (name, token_hash) VALUES (?, ?)")
    .run(name.trim(), hashAdminApiKey(token));
  const key = db
    .prepare(`SELECT ${KEY_COLUMNS} FROM admin_api_keys WHERE id = ?`)
    .get(Number(info.lastInsertRowid)) as AdminApiKey;
  return { key, token };
}

/**
 * The name of the live key this token is, or null when it is not one.
 *
 * Records the use — at most hourly, so a busy automation does not turn every
 * request into a write — because an unused standing key is exactly the one worth
 * revoking and there is no other way to tell it from a key in constant use.
 */
export function adminApiKeyName(token: string | null | undefined): string | null {
  if (!token || !token.startsWith(ADMIN_KEY_PREFIX)) return null;
  const row = db
    .prepare(
      "SELECT id, name FROM admin_api_keys WHERE token_hash = ? AND revoked_at IS NULL",
    )
    .get(hashAdminApiKey(token)) as { id: number; name: string } | undefined;
  if (!row) return null;
  db.prepare(
    `UPDATE admin_api_keys SET last_used_at = datetime('now')
      WHERE id = ? AND (last_used_at IS NULL OR last_used_at < datetime('now', '-1 hour'))`,
  ).run(row.id);
  return row.name;
}

/** Every key ever minted, newest first. Revoked ones are listed, not hidden. */
export function listAdminApiKeys(): AdminApiKey[] {
  return db
    .prepare(`SELECT ${KEY_COLUMNS} FROM admin_api_keys ORDER BY id DESC`)
    .all() as AdminApiKey[];
}

/** Revoke a key. Returns false when there is no live key with that id. */
export function revokeAdminApiKey(id: number): boolean {
  const info = db
    .prepare(
      "UPDATE admin_api_keys SET revoked_at = datetime('now') WHERE id = ? AND revoked_at IS NULL",
    )
    .run(id);
  return info.changes > 0;
}
