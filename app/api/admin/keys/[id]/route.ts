// Revoke a standing admin API key.
//
// Revocation is a timestamp, not a delete: the list keeps saying a key existed,
// when it was minted and when it stopped working. Deleting the row would erase
// the only record that it was ever out there, which is the first question asked
// when a key leaks.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/route-auth";
import { revokeAdminApiKey } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const keyId = Number(id);
  if (!Number.isInteger(keyId) || keyId <= 0) {
    return NextResponse.json({ error: "Invalid key id" }, { status: 400 });
  }
  if (!revokeAdminApiKey(keyId)) {
    return NextResponse.json(
      { error: "No live key with that id — it may already be revoked." },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true });
}
