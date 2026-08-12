import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/route-auth";
import { db } from "@/lib/db";
import { verifyAdminPassword } from "@/lib/auth";
import { setSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

export async function POST(req: Request) {
  let token: string;
  try {
    token = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const issues = parsed.error.issues;
    const msg = issues.some((i) => i.path[0] === "currentPassword")
      ? "Enter your current password."
      : "New password must be at least 8 characters.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const { currentPassword, newPassword } = parsed.data;

  if (!verifyAdminPassword(currentPassword)) {
    return NextResponse.json(
      { error: "Current password is incorrect." },
      { status: 401 },
    );
  }

  try {
    // DB override takes precedence over the ADMIN_PASSWORD env var.
    setSetting("admin_password", newPassword);
    // Invalidate every other session so the new password takes effect
    // everywhere except this one.
    db.prepare("DELETE FROM admin_sessions WHERE token != ?").run(token);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("admin password change failed", err);
    return NextResponse.json(
      { error: "Failed to change the admin password. See server logs." },
      { status: 500 },
    );
  }
}
