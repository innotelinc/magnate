import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/route-auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = db
    .prepare(
      `SELECT u.*, p.name AS plan_name, p.slug AS plan_slug
       FROM users u
       LEFT JOIN plans p ON p.id = u.plan_id
       ORDER BY u.created_at DESC`,
    )
    .all() as Array<Record<string, unknown>>;

  return NextResponse.json({
    users: rows.map((u) => ({
      ...u,
      hasStoredPassword: Boolean(u.password_enc),
      credentialsClaimed: Boolean(u.credentials_claimed_at),
    })),
  });
}
