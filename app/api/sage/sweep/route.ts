import { NextResponse } from "next/server";
import { sageSweepAuthorized, sweepSageSessions } from "@/lib/sage";

export const dynamic = "force-dynamic";

/**
 * Revoke the Sage keys whose fifteen minutes are up.
 *
 * Called by the host's cron (`/etc/cron.d/magnate-sage-sweep`, every two
 * minutes) with the shared token from `SAGE_SWEEP_TOKEN`. Without that token the
 * route refuses everything: it deletes credentials, so an open endpoint would
 * let anyone end a session early or hammer the gateway.
 */
export async function POST(req: Request) {
  if (!sageSweepAuthorized(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const result = await sweepSageSessions();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("sage sweep failed", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
