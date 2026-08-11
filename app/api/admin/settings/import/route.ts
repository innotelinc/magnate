import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/route-auth";
import { setSetting, deleteSetting } from "@/lib/settings";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const ALLOWED_KEYS = [
  "stripe_secret_key",
  "stripe_webhook_secret",
  "stripe_currency",
  "jellyfin_url",
  "jellyfin_api_key",
  "admin_password",
] as const;

const importSchema = z.object({
  version: z.number().optional(),
  exportedAt: z.string().optional(),
  settings: z.record(z.enum(ALLOWED_KEYS), z.string()),
});

export async function POST(req: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON file. Please upload a valid settings backup." },
      { status: 400 },
    );
  }

  const parsed = importSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: `Invalid backup format: ${parsed.error.issues[0]?.message ?? "unknown error"}` },
      { status: 400 },
    );
  }

  // Clear all existing DB overrides first, then apply imported values.
  const tx = db.transaction(() => {
    for (const key of ALLOWED_KEYS) {
      deleteSetting(key);
    }
    for (const [key, value] of Object.entries(parsed.data.settings)) {
      if (value && value.trim()) {
        setSetting(key, value);
      }
    }
  });

  try {
    tx();
  } catch {
    return NextResponse.json(
      { error: "Failed to import settings. The database may be locked." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    imported: Object.keys(parsed.data.settings).length,
  });
}
