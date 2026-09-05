import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME, createAdminSession } from "@/lib/auth";
import {
  exchangeCode,
  getUserInfo,
  isAdminUser,
  oidcEnabled,
} from "@/lib/oidc";
import {
  OIDC_STATE_COOKIE,
  OIDC_VERIFIER_COOKIE,
} from "@/app/api/auth/authentik/login/route";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!oidcEnabled()) {
    return NextResponse.redirect(new URL("/admin/login", req.nextUrl.origin), 302);
  }

  const store = await cookies();
  const errParam = req.nextUrl.searchParams.get("error");
  if (errParam) {
    // User denied consent or something failed upstream — back to login.
    return NextResponse.redirect(
      new URL(`/admin/login?error=${encodeURIComponent(errParam)}`, req.nextUrl.origin),
      302,
    );
  }

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const storedState = store.get(OIDC_STATE_COOKIE)?.value;
  const verifier = store.get(OIDC_VERIFIER_COOKIE)?.value;
  const next = store.get("oidc_next")?.value ?? "/admin";
  const origin = req.nextUrl.origin;

  if (!code || !state || !storedState || !verifier || state !== storedState) {
    return NextResponse.redirect(
      new URL(`/admin/login?error=${encodeURIComponent("state_mismatch")}`, origin),
      302,
    );
  }

  // Clean up the one-time auth cookies no matter what happens next.
  store.set(OIDC_STATE_COOKIE, "", { maxAge: 0, path: "/" });
  store.set(OIDC_VERIFIER_COOKIE, "", { maxAge: 0, path: "/" });
  store.set("oidc_next", "", { maxAge: 0, path: "/" });

  let info;
  try {
    const tokens = await exchangeCode(origin, code, verifier);
    info = await getUserInfo(tokens.access_token);
  } catch (e) {
    console.error("[OIDC] Token/userinfo exchange failed:", e);
    return NextResponse.redirect(
      new URL(`/admin/login?error=${encodeURIComponent("exchange_failed")}`, origin),
      302,
    );
  }

  // Cerulean Authentik is the identity provider — only users on the admin
  // allowlist (or Authentik superusers) may hold the admin session cookie.
  if (!isAdminUser(info)) {
    return NextResponse.redirect(
      new URL(`/admin/login?error=${encodeURIComponent("not_authorized")}`, origin),
      302,
    );
  }

  const token = createAdminSession();
  const res = NextResponse.redirect(
    new URL(next.startsWith("/") && !next.startsWith("//") ? next : "/admin", origin),
    302,
  );
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });
  return res;
}