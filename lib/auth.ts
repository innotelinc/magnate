import crypto from "node:crypto";
import { db } from "./db";
import { adminPassword } from "./settings";

const COOKIE_NAME = "admin_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export { COOKIE_NAME };

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
