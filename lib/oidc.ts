import crypto from "node:crypto";

/**
 * Authentik OIDC (authorization-code + PKCE) client for the admin portal.
 *
 * The Magnate admin panel delegates its login to Cerulean's Authentik (the
 * auth & trust stack): every sign-in goes through Authentik, and the callback
 * grants an admin session to users whose email is in AUTHENTIK_ADMIN_EMAILS
 * (falling back to AUTHENTIK_ADMIN_EMAIL, then the issuer admin account).
 *
 * Required env vars for SSO to be active:
 *   AUTHENTIK_ISSUER_URL    e.g. https://auth.cerulean.innotel.us/application/o/magnate-admin
 *   AUTHENTIK_CLIENT_ID
 *   AUTHENTIK_CLIENT_SECRET
 * Optional:
 *   AUTHENTIK_ADMIN_EMAILS  comma-separated emails allowed into the admin panel
 */

export function oidcEnabled(): boolean {
  return Boolean(
    process.env.AUTHENTIK_ISSUER_URL &&
      process.env.AUTHENTIK_CLIENT_ID &&
      process.env.AUTHENTIK_CLIENT_SECRET,
  );
}

export function oidcIssuerBase(): string {
  return (process.env.AUTHENTIK_ISSUER_URL ?? "").replace(/\/+$/, "");
}

/**
 * Public redirect URI registered on the Authentik application. An explicit
 * AUTHENTIK_REDIRECT_URI wins (needed when the container can't derive the
 * public origin from the request, e.g. behind a proxy that rewrites Host);
 * otherwise it's built from the request origin.
 */
export function redirectUri(origin: string): string {
  const explicit = (process.env.AUTHENTIK_REDIRECT_URI ?? "").trim();
  if (explicit) return explicit;
  return `${origin.replace(/\/+$/, "")}/api/auth/authentik/callback`;
}

interface OidcDiscovery {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  end_session_endpoint?: string;
  issuer: string;
}

let _discovery: Promise<OidcDiscovery> | null = null;

/** Fetch (and memoize) the OIDC discovery document from Authentik. */
export function discoverOidc(): Promise<OidcDiscovery> {
  if (!_discovery) {
    _discovery = (async () => {
      const url = `${oidcIssuerBase()}/.well-known/openid-configuration`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`OIDC discovery failed (${res.status}) for ${url}`);
      }
      const doc = (await res.json()) as OidcDiscovery;
      if (!doc.authorization_endpoint || !doc.token_endpoint) {
        throw new Error(`OIDC discovery document missing endpoints at ${url}`);
      }
      return doc;
    })();
  }
  return _discovery;
}

/** PKCE challenge pair — verifier goes in an httpOnly cookie, S256 in the URL. */
export function makePkcePair(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(48).toString("base64url");
  const challenge = crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64url");
  return { verifier, challenge };
}

export function makeState(): string {
  return crypto.randomBytes(24).toString("base64url");
}

export interface OidcUserInfo {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  preferred_username?: string;
  given_name?: string;
  family_name?: string;
}

/** Exchange the authorization code for tokens using the stored PKCE verifier. */
export async function exchangeCode(
  origin: string,
  code: string,
  verifier: string,
): Promise<{ access_token: string; id_token: string }> {
  const disc = await discoverOidc();
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(origin),
    client_id: process.env.AUTHENTIK_CLIENT_ID ?? "",
    code_verifier: verifier,
  });
  const res = await fetch(disc.token_endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(
        `${process.env.AUTHENTIK_CLIENT_ID ?? ""}:${process.env.AUTHENTIK_CLIENT_SECRET ?? ""}`,
      ).toString("base64")}`,
    },
    body: params.toString(),
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Token exchange failed (${res.status}): ${detail.slice(0, 300)}`);
  }
  return (await res.json()) as { access_token: string; id_token: string };
}

/** Fetch the userinfo document (name/email/subject) for the access token. */
export async function getUserInfo(accessToken: string): Promise<OidcUserInfo> {
  const disc = await discoverOidc();
  const res = await fetch(disc.userinfo_endpoint, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Userinfo request failed (${res.status})`);
  }
  return (await res.json()) as OidcUserInfo;
}

/**
 * True when the Authentik user is allowed into the admin panel: their email
 * matches AUTHENTIK_ADMIN_EMAILS (comma-separated) or, when that is unset,
 * AUTHENTIK_ADMIN_EMAIL. Superusers from Authentik (e.g. akadmin) are always
 * allowed. The admin session cookie is only issued for these users.
 */
export function isAdminUser(info: OidcUserInfo): boolean {
  const email = (info.email ?? "").toLowerCase();
  if (!email) return false;
  const allowlist = (process.env.AUTHENTIK_ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (allowlist.length > 0) {
    return allowlist.includes(email);
  }
  const fallback = (process.env.AUTHENTIK_ADMIN_EMAIL ?? "").toLowerCase();
  return Boolean(fallback && email === fallback);
}