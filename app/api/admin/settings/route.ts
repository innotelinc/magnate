import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/route-auth";
import { getSettingsForAdmin, setSetting, deleteSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

const ALLOWED_KEYS = [
  "stripe_secret_key",
  "stripe_webhook_secret",
  "stripe_currency",
  "jellyfin_url",
  "jellyfin_api_key",
  "admin_password",
] as const;

const settingsSchema = z.record(
  z.enum(ALLOWED_KEYS),
  z.string(),
);

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(getSettingsForAdmin());
}

export async function PUT(req: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  for (const [key, value] of Object.entries(parsed.data)) {
    // Empty string means "delete the DB override, fall back to env var".
    if (value === "") {
      // Allow deletion by writing an empty string for non-sensitive keys,
      // but for sensitive keys we just delete the row (restores env fallback).
      deleteSetting(key);
    } else {
      setSetting(key, value);
    }
  }

  return NextResponse.json({ ok: true });
}
