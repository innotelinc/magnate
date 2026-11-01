import { NextResponse } from "next/server";
import { publicSageSession, sessionByClaimToken } from "@/lib/sage";
import { gatewayUrl } from "@/lib/settings";

export const dynamic = "force-dynamic";

/**
 * Redeem a claim token for the key it was minted for.
 *
 * The confirmation page offers the buyer `https://sage.innotel.tech/#claim=<token>`,
 * and the Sage server asks here on the app's behalf — server to server, so the
 * app's origin never has to be allowed through CORS to read billing data.
 *
 * The token is not a second credential: it names one seat, it answers only while
 * that seat's window is open, and the key it returns is one the buyer has already
 * paid for and could copy off the same page. It exists so the handoff does not
 * depend on a person selecting text on a phone.
 */
export async function GET(req: Request) {
  const token = (new URL(req.url).searchParams.get("token") ?? "").trim();
  if (!token || token.length > 64) {
    return NextResponse.json({ error: "Missing claim code" }, { status: 400 });
  }

  const row = sessionByClaimToken(token);
  if (!row) {
    return NextResponse.json(
      { error: "That claim code is not one of ours. Copy it from your receipt." },
      { status: 404 },
    );
  }

  const pub = publicSageSession(row);
  if (!pub.active || !pub.key) {
    return NextResponse.json(
      {
        error:
          "This session has already ended. Buy another one to get a new key.",
      },
      { status: 410 },
    );
  }

  return NextResponse.json(
    {
      ready: true,
      key: pub.key,
      code: pub.code,
      planName: pub.planName,
      expiresAt: pub.expiresAt,
      secondsLeft: pub.secondsLeft,
      // The endpoint the key belongs to, so a key is never installed without the
      // base URL that makes it work.
      gatewayUrl: `${gatewayUrl().replace(/\/+$/, "")}/v1`,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
