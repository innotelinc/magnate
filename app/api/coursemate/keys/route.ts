import { NextResponse } from "next/server";
import {
  publicSageSession,
  sessionsForCheckout,
  sweepSageSessions,
} from "@/lib/sage";

export const dynamic = "force-dynamic";

/**
 * The keys bought under one Stripe checkout, for the success page.
 *
 * Addressed by the Checkout session id — the unguessable reference Stripe puts
 * in the redirect. A key is returned only while its window is open: once it has
 * expired the reader gets `active: false` and no key, because showing a dead
 * credential invites a support ticket.
 *
 * The rows live in the same table as Sage's (`sage_sessions`), which is why the
 * sweep and the row reader are Sage's: one window, one revocation path.
 */
export async function GET(req: Request) {
  const sessionId = new URL(req.url).searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ error: "Missing session_id" }, { status: 400 });
  }

  const rows = sessionsForCheckout(sessionId);
  const ready = rows.some(
    (row) => row.state === "active" || row.state === "expired",
  );
  if (!ready) {
    // The webhook has not minted yet (or every key failed) — poll again.
    return NextResponse.json({
      ready: false,
      failed: rows.some((row) => row.state === "failed"),
      error: rows.find((row) => row.error)?.error ?? null,
    });
  }

  // Lazy sweep: the cron covers the estate, this covers a host where the cron
  // was never installed — a key whose window closed while somebody was looking
  // at the success page is revoked on the next poll.
  const expiredHere = rows.some((row) => {
    if (row.state !== "active" || !row.expires_at) return false;
    return new Date(`${row.expires_at}Z`).getTime() <= Date.now();
  });
  if (expiredHere) {
    try {
      await sweepSageSessions();
    } catch (err) {
      console.error("coursemate sweep during status read failed", err);
    }
  }

  const fresh = sessionsForCheckout(sessionId);
  return NextResponse.json({
    ready: true,
    keys: fresh.map(publicSageSession),
  });
}
