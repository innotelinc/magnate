import { NextResponse, type NextRequest } from "next/server";
import {
  discoverOidc,
  makePkcePair,
  makeState,
  oidcEnabled,
  redirectUri,
} from "@/lib/oidc";

export const dynamic = "force-dynamic";

export const OIDC_STATE_COOKIE = "oidc_state";
export const OIDC_VERIFIER_COOKIE = "oidc_verifier";

/** Only allow same-site relative paths to avoid open redirects. */
function safeNext(value: string | null): string {
  if (!value) return "/admin";
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  return "/admin";
}

export async function GET(req: NextRequest) {
  if (!oidcEnabled()) {
    return NextResponse.redirect(new URL("/admin/login", req.nextUrl.origin), 302);
  }

  const next = safeNext(req.nextUrl.searchParams.get("next"));

  let disc;
  try {
    disc = await discoverOidc();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "OIDC discovery failed" },
      { status: 500 },
    );
  }

  const { verifier, challenge } = makePkcePair();
  const state = makeState();

  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.AUTHENTIK_CLIENT_ID ?? "",
    redirect_uri: redirectUri(req.nextUrl.origin),
    scope: "openid profile email",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });

  const res = NextResponse.redirect(
    new URL(`${disc.authorization_endpoint}?${params.toString()}`),
    302,
  );
  const cookieOpts = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: req.nextUrl.protocol === "https:",
    path: "/",
    maxAge: 60 * 10, // 10 minutes — the whole auth dance should finish fast
  };
  res.cookies.set(OIDC_STATE_COOKIE, state, cookieOpts);
  res.cookies.set(OIDC_VERIFIER_COOKIE, verifier, cookieOpts);
  if (next && next !== "/admin") {
    res.cookies.set("oidc_next", next, cookieOpts);
  }
  return res;
}