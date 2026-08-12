/**
 * Thin client for the Jellyfin HTTP API.
 * Docs: https://api.jellyfin.org/
 */

import { jellyfinUrl, jellyfinApiKey } from "./settings";

function getBaseUrl(): string {
  return jellyfinUrl().replace(/\/+$/, "");
}

export function jellyfinConfigured(): boolean {
  return Boolean(jellyfinApiKey());
}

function authHeaders(): Record<string, string> {
  const key = jellyfinApiKey();
  if (!key) {
    throw new Error("JELLYFIN_API_KEY is not configured");
  }
  return {
    Authorization: `MediaBrowser Token="${key}"`,
    "Content-Type": "application/json",
  };
}

export interface JellyfinUser {
  Id: string;
  Name: string;
  ServerId: string;
}

export class JellyfinError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  let res: Response;
  try {
    const baseUrl = getBaseUrl();
    res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: authHeaders(),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new JellyfinError(
      `Could not reach Jellyfin at ${getBaseUrl()}. Is the server up?`,
      0,
    );
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new JellyfinError(
      `Jellyfin ${method} ${path} failed (${res.status}): ${text.slice(0, 200)}`,
      res.status,
    );
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function getServerInfo(): Promise<{ VersionName: string }> {
  return request<{ VersionName: string }>("GET", "/System/Info/Public");
}

export async function listUsers(): Promise<JellyfinUser[]> {
  return request<JellyfinUser[]>("GET", "/Users");
}

export async function findUserByName(
  name: string,
): Promise<JellyfinUser | null> {
  const users = await listUsers();
  const needle = name.trim().toLowerCase();
  return (
    users.find((u) => u.Name.trim().toLowerCase() === needle) ?? null
  );
}

export async function createUser(
  name: string,
  password: string,
): Promise<JellyfinUser> {
  const user = await request<JellyfinUser & { HasPassword?: boolean }>(
    "POST",
    "/Users/New",
    {
      Name: name,
      Password: password,
    },
  );
  // Jellyfin 10.11 ignores the password in POST /Users/New (the created user
  // comes back with HasPassword: false). Set it explicitly so the generated
  // credentials actually work.
  if (!user.HasPassword) {
    await setUserPassword(user.Id, password);
  }
  return user;
}

/** Set (reset) a user's password. An empty CurrentPw works for admin resets. */
export async function setUserPassword(
  userId: string,
  password: string,
): Promise<void> {
  await request<void>("POST", `/Users/${userId}/Password`, {
    CurrentPw: "",
    NewPw: password,
    ResetPassword: false,
  });
}

export async function setUserEnabled(
  userId: string,
  enabled: boolean,
): Promise<void> {
  // Jellyfin 10.11 dropped GET /Users/{id}/Policy (it 405s) — the policy is
  // embedded in the user object. Fetch it from there so we don't clobber other
  // settings, and use IsDisabled (there is no `Enabled` field).
  const user = await request<{ Policy?: Record<string, unknown> }>(
    "GET",
    `/Users/${userId}`,
  );
  await request<void>("POST", `/Users/${userId}/Policy`, {
    ...(user.Policy ?? {}),
    IsAdministrator: false,
    IsDisabled: !enabled,
  });
}

export async function deleteUser(userId: string): Promise<void> {
  await request<void>("DELETE", `/Users/${userId}`);
}
