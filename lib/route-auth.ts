import { cookies } from "next/headers";
import { COOKIE_NAME, validateAdminToken } from "./auth";

/** Returns the admin token if the request has a valid session, else null. */
export async function getAdminToken(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value ?? null;
  return token && validateAdminToken(token) ? token : null;
}

export async function requireAdmin(): Promise<string> {
  const token = await getAdminToken();
  if (!token) throw new Error("Unauthorized");
  return token;
}
