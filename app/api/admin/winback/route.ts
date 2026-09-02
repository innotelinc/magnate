import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/route-auth";
import { db, type UserRow } from "@/lib/db";
import { createWinbackCheckout } from "@/lib/ai";

export const dynamic = "force-dynamic";

const schema = z.object({
  userId: z.number().int().positive(),
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
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
  }

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(
    parsed.data.userId,
  ) as UserRow | undefined;
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  try {
    const url = await createWinbackCheckout(user);
    return NextResponse.json({ url, coupon: user.winback_status ?? null });
  } catch (err) {
    console.error("winback checkout failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not create winback offer" },
      { status: 500 },
    );
  }
}