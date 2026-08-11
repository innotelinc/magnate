import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/route-auth";
import { settingsStatus } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(settingsStatus());
}
