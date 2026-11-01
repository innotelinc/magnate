import { NextResponse, type NextRequest } from "next/server";

/**
 * One published address: `magnate.innotel.us`.
 *
 * `app.magnate.innotel.us` is the legacy name — it is what the first deployments,
 * the Stripe webhook endpoint and several services' `.env` files were configured
 * with, so it cannot simply stop answering. It redirects page views to the
 * canonical host and keeps serving everything else, because a redirect answers a
 * POST with a body that never arrived:
 *
 *   * `/api/*` is exempt outright — Stripe posts webhooks here with a signature
 *     over the exact body, and the Sage sweep and callback routes are POSTs.
 *   * Only GET and HEAD are redirected; anything else passes through untouched.
 *
 * This was a proxy rule first. NPM rejects `set` in a host's advanced config, so
 * the rule lives here, where it is testable and versioned with the app.
 */
const CANONICAL_HOST = "magnate.innotel.us";
const LEGACY_HOST = "app.magnate.innotel.us";

export function middleware(req: NextRequest) {
  const host = (req.headers.get("host") || "").split(":")[0].trim().toLowerCase();
  if (host !== LEGACY_HOST) return NextResponse.next();

  const { pathname, search } = req.nextUrl;
  if (pathname === "/api" || pathname.startsWith("/api/")) return NextResponse.next();
  if (req.method !== "GET" && req.method !== "HEAD") return NextResponse.next();

  return NextResponse.redirect(`https://${CANONICAL_HOST}${pathname}${search}`, 308);
}

export const config = {
  // Skip the build's own static assets: redirecting them would make the legacy
  // host's HTML fetch each asset over a second round trip.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
