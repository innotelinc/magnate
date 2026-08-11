import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/route-auth";
import { getExportableSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const data = getExportableSettings();
  const exportPayload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: data,
  };

  const json = JSON.stringify(exportPayload, null, 2);

  return new NextResponse(json, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="jellyfin-sub-settings-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
