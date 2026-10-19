import { cookies, headers } from "next/headers";
import {
  COOKIE_NAME,
  adminApiKeyName,
  validateAdminToken,
} from "./auth";

/**
 * The browser's signed-in session token, or null.
 *
 * This is the *person at a browser* gate, and it accepts nothing else: the
 * panel's pages use it to decide whether to render, and changing the admin
 * password uses it because the password is what a browser signs in with. A
 * standing API key deliberately does not open those two.
 */
export async function getAdminToken(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value ?? null;
  return token && validateAdminToken(token) ? token : null;
}

/**
 * Admin rights for a request, from either credential:
 *
 *   * the session cookie a person signed in with, or
 *   * a standing admin API key in `Authorization: Bearer <key>` — the credential
 *     automation uses, which is what makes routine catalog work possible without
 *     break-glass and without anyone at a screen.
 *
 * Both are admin, and neither is weaker: a key can create a plan, re-price one,
 * read the status and manage users, exactly as a session can. The difference is
 * only in what it cannot do — sign in as a person, or change the admin password.
 *
 * Returns a description of the credential ("the session token", or
 * `key:<name>`) rather than the key itself, so a caller cannot accidentally
 * treat a key as a session.
 */
export async function requireAdmin(): Promise<string> {
  const session = await getAdminToken();
  if (session) return session;

  const header = (await headers()).get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ")
    ? header.slice("Bearer ".length).trim()
    : "";
  const name = adminApiKeyName(bearer);
  if (name !== null) return `key:${name}`;

  throw new Error("Unauthorized");
}
