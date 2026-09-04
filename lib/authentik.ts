/**
 * Thin client for the Authentik API (v3).
 *
 * The stack is Authentik-first: subscribers' accounts and passwords live in
 * Authentik, and Jellyfin logins authenticate against it through the LDAP
 * outpost (see the arr repo). This landing page is responsible for creating
 * the Authentik user (if billing-api hasn't already) and setting the
 * generated password that the success page reveals once.
 *
 * Docs: https://docs.goauthentik.io/ and the API reference at
 * https://api.goauthentik.io/ (paths are relative to /api/v3).
 */

import { authentikBaseUrl, authentikBootstrapToken } from "./settings";

export interface AuthentikUser {
  pk: number;
  uuid: string;
  username: string;
  name: string;
  email: string;
  is_active: boolean;
}

export class AuthentikError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function authentikConfigured(): boolean {
  return Boolean(authentikBaseUrl() && authentikBootstrapToken());
}

function authHeaders(): Record<string, string> {
  const token = authentikBootstrapToken();
  if (!token) {
    throw new AuthentikError("AUTHENTIK_BOOTSTRAP_TOKEN is not configured", 0);
  }
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const base = authentikBaseUrl();
  if (!base) {
    throw new AuthentikError("AUTHENTIK_BASE_URL is not configured", 0);
  }
  let res: Response;
  try {
    res = await fetch(`${base.replace(/\/+$/, "")}/api/v3${path}`, {
      method,
      headers: authHeaders(),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new AuthentikError(
      `Could not reach Authentik at ${base}. Is it up?`,
      0,
    );
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new AuthentikError(
      `Authentik ${method} ${path} failed (${res.status}): ${text.slice(0, 300)}`,
      res.status,
    );
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Find an Authentik user by exact username. Returns null when missing. */
export async function findUser(
  username: string,
): Promise<AuthentikUser | null> {
  const data = await request<{ results: AuthentikUser[] }>(
    "GET",
    `/core/users/?username=${encodeURIComponent(username)}`,
  );
  return data.results[0] ?? null;
}

/** Find by email (used as a fallback when the username check misses). */
export async function findUserByEmail(
  email: string,
): Promise<AuthentikUser | null> {
  const data = await request<{ results: AuthentikUser[] }>(
    "GET",
    `/core/users/?email=${encodeURIComponent(email)}`,
  );
  return data.results[0] ?? null;
}

/**
 * Ensure an Authentik user exists, creating it when missing (idempotent).
 * Magnate is the sole provisioner — there is no separate billing-api.
 */
export async function ensureUser(
  username: string,
  email: string,
): Promise<AuthentikUser> {
  const existing =
    (await findUser(username)) ?? (email ? await findUserByEmail(email) : null);
  if (existing) return existing;
  return request<AuthentikUser>("POST", "/core/users/", {
    username,
    name: username,
    email: email || "",
    is_active: true,
  });
}

/** Set (reset) a user's password in Authentik. */
export async function setUserPassword(
  userId: number,
  password: string,
): Promise<void> {
  await request<void>("POST", `/core/users/${userId}/set_password/`, {
    password,
  });
}

/** Enable or disable an Authentik user (disabling blocks LDAP logins). */
export async function setUserActive(
  userId: number,
  active: boolean,
): Promise<void> {
  await request<void>("PATCH", `/core/users/${userId}/`, {
    is_active: active,
  });
}

/** Delete an Authentik user. */
export async function deleteUser(userId: number): Promise<void> {
  await request<void>("DELETE", `/core/users/${userId}/`);
}
