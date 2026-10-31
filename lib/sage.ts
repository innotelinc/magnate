/**
 * Sage gateway sessions.
 *
 * A Sage purchase is neither a seat nor a month: it is one OmniRoute API key
 * that lives for fifteen minutes. The key is minted on the gateway the moment
 * Stripe says the money arrived, handed back to the buyer on the success page,
 * and deleted from the gateway when the window closes. Inside the window it can
 * be used as many times as the buyer likes — one chat turn, ten, a whole quiz —
 * and it stops the moment the window does.
 *
 * Why a timed key rather than a subscription: Sage is a course-taking agent used
 * in bursts (one class, one exam), and the thing being sold is model spend on
 * our shared gateway. A key with a spend cap and a short life is the smallest
 * honest unit, and revoking it is a single DELETE — no account to disable, no
 * password to rotate, nothing left behind.
 *
 * The spend cap is a share of what the session cost: a $19 session may spend
 * $7.60 on models, a $3 session $1.20. That is the margin, written down here
 * rather than discovered per invoice. It is enforced by the gateway
 * (`dailyUsageLimitUsd`), and because the key dies with the window the daily
 * limit is, in practice, the session limit.
 *
 * The minted key is stored in the row it belongs to. That is deliberate: the
 * buyer has to see it on the success page, and it is worthless after fifteen
 * minutes — a credential that cannot outlive the request that created it is not
 * the kind of secret this database needs to protect from itself.
 */

import crypto from "node:crypto";
import { db } from "./db";
import { getPlanBySlug } from "./plans";
import {
  gatewayAdminPassword,
  gatewayUrl,
  sageSessionMinutes,
  sageSweepToken,
} from "./settings";

export const SAGE_SERVICE = "sage";

/** Share of the session price that may be spent on models. */
export const SAGE_SPEND_SHARE = 0.4;

/** Ceiling on sessions in one purchase, so a fat finger is not a $10k invoice. */
export const SAGE_MAX_SESSIONS = 10;

export function isSageService(service?: string | null): boolean {
  return (service ?? "").trim().toLowerCase() === SAGE_SERVICE;
}

export interface SageSessionRow {
  id: number;
  code: string;
  stripe_session_id: string;
  seat: number;
  plan_slug: string;
  plan_name: string;
  customer_email: string | null;
  amount_cents: number;
  currency: string;
  gateway_key_id: string | null;
  gateway_key: string | null;
  gateway_key_name: string | null;
  state: string;
  issued_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  error: string | null;
  created_at: string;
}

/** `2026-10-31 14:07:59` — the shape SQLite's datetime() compares against. */
function utcStamp(date: Date): string {
  return date.toISOString().replace("T", " ").slice(0, 19);
}

export function sageGatewayConfigured(): boolean {
  return gatewayUrl() !== "";
}

/**
 * Thin client over the OmniRoute dashboard API.
 *
 * Same three calls the control plane makes (docs/gateway-api-inventory.md):
 * `POST /api/auth/login` for a session cookie, `POST /api/keys` to mint,
 * `DELETE /api/keys/<id>` to revoke. The dashboard sits behind SSO at the public
 * hostname, but its `/api/*` routes answer to that cookie, which is why a
 * password has to be configured: without one this stays off rather than minting
 * unauthenticated against whatever the edge happens to expose.
 */
class GatewayAdmin {
  private cookie: string | null = null;

  private base(): string {
    const url = gatewayUrl();
    if (!url) throw new Error("GATEWAY_URL is not configured");
    return url.replace(/\/+$/, "");
  }

  async login(): Promise<void> {
    const password = gatewayAdminPassword();
    if (!password) throw new Error("GATEWAY_ADMIN_PASSWORD is not configured");
    const res = await fetch(`${this.base()}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
      redirect: "manual",
    });
    if (!res.ok) {
      throw new Error(
        `gateway login failed (${res.status}): ${(await res.text()).slice(0, 160)}`,
      );
    }
    const setCookie = res.headers.get("set-cookie") || "";
    const match = setCookie.match(/(^|,\s*)([^=;]+=[^;]+)/);
    if (!match) throw new Error("gateway login did not return a session cookie");
    this.cookie = match[2];
  }

  private async call(
    method: string,
    path: string,
    body?: unknown,
    retry = true,
  ): Promise<Record<string, unknown>> {
    const res = await fetch(`${this.base()}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(this.cookie ? { Cookie: this.cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    // A stale cookie is the one failure worth retrying: log in again once.
    if ((res.status === 401 || res.status === 403) && retry) {
      this.cookie = null;
      await this.login();
      return this.call(method, path, body, false);
    }
    const text = await res.text();
    let data: Record<string, unknown> = {};
    try {
      data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      data = {};
    }
    if (!res.ok) {
      const message =
        (data.error as { message?: string } | undefined)?.message ||
        (typeof data.error === "string" ? data.error : "") ||
        (typeof data.message === "string" ? data.message : "") ||
        text.slice(0, 160) ||
        res.statusText;
      throw new Error(`gateway ${method} ${path} -> ${res.status}: ${message}`);
    }
    return data;
  }

  async createKey(
    name: string,
    spendCapUsd: number,
  ): Promise<{ id: string; key: string; name: string }> {
    if (!this.cookie) await this.login();
    const body: Record<string, unknown> = {
      name,
      modelAccessMode: "all",
    };
    if (spendCapUsd > 0) body.dailyUsageLimitUsd = spendCapUsd;
    const data = await this.call("POST", "/api/keys", body);
    const id = typeof data.id === "string" ? data.id : "";
    const key = typeof data.key === "string" ? data.key : "";
    if (!id || !key) {
      throw new Error("gateway answered the key request without a key");
    }
    return { id, key, name: typeof data.name === "string" ? data.name : name };
  }

  async revokeKey(id: string): Promise<void> {
    if (!this.cookie) await this.login();
    try {
      await this.call("DELETE", `/api/keys/${encodeURIComponent(id)}`);
    } catch {
      // The dashboard had a second revocation surface (v1 registered keys);
      // try it before giving up, the same way the control plane does.
      await this.call(
        "POST",
        `/api/v1/registered-keys/${encodeURIComponent(id)}/revoke`,
      );
    }
  }
}

export interface MintSageInput {
  stripeSessionId: string;
  planSlug: string;
  email: string | null;
  quantity: number;
  amountCents: number;
  currency: string;
}

/**
 * Mint one key per session bought.
 *
 * Idempotent by `(stripe_session_id, seat)`: Stripe redelivers the webhook until
 * it is marked processed, and a replay must not spend a second key on a seat
 * that already has one. A seat whose mint failed is retried in place.
 */
export async function mintSageSessions(
  input: MintSageInput,
): Promise<SageSessionRow[]> {
  const plan = getPlanBySlug(input.planSlug);
  if (!plan) {
    throw new Error(`sage plan ${input.planSlug} is not in the catalog`);
  }
  if (!isSageService(plan.service)) {
    throw new Error(`plan ${plan.slug} is not a Sage plan`);
  }
  if (!sageGatewayConfigured()) {
    throw new Error("GATEWAY_URL is not configured");
  }

  const quantity = Math.min(
    Math.max(Math.trunc(input.quantity) || 1, 1),
    SAGE_MAX_SESSIONS,
  );
  const minutes = sageSessionMinutes();
  const perSessionCents = Math.round(
    input.amountCents / Math.max(quantity, 1),
  ) || plan.price_per_unit_cents;
  const spendCapUsd =
    Math.round((plan.price_per_unit_cents || perSessionCents) * SAGE_SPEND_SHARE) /
    100;

  const gateway = new GatewayAdmin();
  const minted: SageSessionRow[] = [];

  for (let seat = 1; seat <= quantity; seat++) {
    const existing = db
      .prepare(
        "SELECT * FROM sage_sessions WHERE stripe_session_id = ? AND seat = ?",
      )
      .get(input.stripeSessionId, seat) as SageSessionRow | undefined;
    if (existing?.state === "active" && existing.gateway_key) {
      minted.push(existing);
      continue;
    }

    const code =
      existing?.code ??
      `sage-${crypto.randomBytes(5).toString("hex")}`;
    const name = `${code}-${plan.slug}`;

    if (!existing) {
      db.prepare(
        `INSERT OR IGNORE INTO sage_sessions
           (code, stripe_session_id, seat, plan_slug, plan_name, customer_email, amount_cents, currency)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        code,
        input.stripeSessionId,
        seat,
        plan.slug,
        plan.name,
        input.email,
        perSessionCents,
        input.currency,
      );
    }

    try {
      const created = await gateway.createKey(name, spendCapUsd);
      const now = new Date();
      const expires = new Date(now.getTime() + minutes * 60_000);
      db.prepare(
        `UPDATE sage_sessions SET
           gateway_key_id = ?, gateway_key = ?, gateway_key_name = ?,
           state = 'active', issued_at = ?, expires_at = ?, revoked_at = NULL, error = NULL
         WHERE stripe_session_id = ? AND seat = ?`,
      ).run(
        created.id,
        created.key,
        created.name,
        utcStamp(now),
        utcStamp(expires),
        input.stripeSessionId,
        seat,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      db.prepare(
        "UPDATE sage_sessions SET state = 'failed', error = ? WHERE stripe_session_id = ? AND seat = ?",
      ).run(message, input.stripeSessionId, seat);
      throw new Error(`could not mint Sage session ${seat}: ${message}`);
    }

    const row = db
      .prepare(
        "SELECT * FROM sage_sessions WHERE stripe_session_id = ? AND seat = ?",
      )
      .get(input.stripeSessionId, seat) as SageSessionRow | undefined;
    if (row) minted.push(row);
  }

  return minted;
}

export function sessionsForCheckout(stripeSessionId: string): SageSessionRow[] {
  return db
    .prepare(
      "SELECT * FROM sage_sessions WHERE stripe_session_id = ? ORDER BY seat",
    )
    .all(stripeSessionId) as SageSessionRow[];
}

export interface PublicSageSession {
  code: string;
  planSlug: string;
  planName: string;
  /** The key itself, while the session is live; null once it is gone. */
  key: string | null;
  active: boolean;
  expiresAt: string | null;
  secondsLeft: number;
}

export function publicSageSession(row: SageSessionRow): PublicSageSession {
  const expires = row.expires_at ? new Date(`${row.expires_at}Z`) : null;
  const secondsLeft = expires
    ? Math.max(0, Math.round((expires.getTime() - Date.now()) / 1000))
    : 0;
  const active = row.state === "active" && secondsLeft > 0;
  return {
    code: row.code,
    planSlug: row.plan_slug,
    planName: row.plan_name,
    key: active ? row.gateway_key : null,
    active,
    expiresAt: row.expires_at,
    secondsLeft,
  };
}

/**
 * Delete the keys whose window has closed.
 *
 * Called by the cron route every couple of minutes and lazily when the success
 * page asks about a session, so a purchase is swept even on a host where the
 * cron was never installed. A revoke that fails leaves the row `active` with the
 * reason recorded, and the next sweep tries again — the key is still capped by
 * the gateway's spend limit, so a retry loop is the right failure here rather
 * than a key that silently lives forever.
 */
export async function sweepSageSessions(): Promise<{
  revoked: number;
  failed: number;
}> {
  const due = db
    .prepare(
      `SELECT * FROM sage_sessions
       WHERE state = 'active' AND expires_at IS NOT NULL
         AND datetime(expires_at) <= datetime('now')`,
    )
    .all() as SageSessionRow[];
  if (due.length === 0) return { revoked: 0, failed: 0 };

  const gateway = new GatewayAdmin();
  let revoked = 0;
  let failed = 0;
  for (const row of due) {
    try {
      if (row.gateway_key_id) await gateway.revokeKey(row.gateway_key_id);
      db.prepare(
        "UPDATE sage_sessions SET state = 'expired', revoked_at = datetime('now'), error = NULL WHERE id = ?",
      ).run(row.id);
      revoked += 1;
    } catch (err) {
      failed += 1;
      db.prepare("UPDATE sage_sessions SET error = ? WHERE id = ?").run(
        `revoke failed: ${err instanceof Error ? err.message : String(err)}`,
        row.id,
      );
    }
  }
  return { revoked, failed };
}

/** Whether a request may run the sweep. No token configured = nobody may. */
export function sageSweepAuthorized(req: Request): boolean {
  const expected = sageSweepToken();
  if (!expected) return false;
  const given = req.headers.get("x-sage-sweep-token") ?? "";
  if (given.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}
