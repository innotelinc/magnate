import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/route-auth";
import { db } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { createUser, findUserByName, setUserEnabled } from "@/lib/jellyfin";
import { getPlanById } from "@/lib/plans";

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

const createSchema = z.object({
  email: z.string().email().max(255),
  username: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9_][a-zA-Z0-9._-]*$/, "Username must start with a letter/number and contain only letters, numbers, dots, dashes, and underscores."),
  password: z.string().min(4).max(128),
  planId: z.number().int().positive().optional().nullable(),
  provisionJellyfin: z.boolean().optional().default(true),
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

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const { email, username, password, planId, provisionJellyfin } = parsed.data;

  // Check for duplicate email / username.
  const existing = db
    .prepare("SELECT id FROM users WHERE lower(email) = lower(?) OR lower(username) = lower(?)")
    .get(email, username) as { id: number } | undefined;
  if (existing) {
    return NextResponse.json(
      { error: "A user with that email or username already exists." },
      { status: 409 },
    );
  }

  // Validate plan exists if provided.
  if (planId && !getPlanById(planId)) {
    return NextResponse.json(
      { error: "The selected plan does not exist." },
      { status: 400 },
    );
  }

  // Encrypt password for storage.
  const passwordEnc = encrypt(password);

  let jellyfinUserId: string | null = null;
  let provisioningError: string | null = null;

  if (provisionJellyfin) {
    try {
      // Check if user already exists in Jellyfin.
      let jfUser = await findUserByName(username);
      if (!jfUser) {
        jfUser = await createUser(username, password);
      }
      await setUserEnabled(jfUser.Id, true);
      jellyfinUserId = jfUser.Id;
    } catch (err) {
      provisioningError =
        err instanceof Error ? err.message : "Jellyfin provisioning failed";
      // Continue anyway — user is created in local DB.
    }
  }

  const info = db
    .prepare(
      `INSERT INTO users (email, username, jellyfin_user_id, plan_id, status, password_enc)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      email,
      username,
      jellyfinUserId,
      planId ?? null,
      jellyfinUserId ? "active" : "pending",
      passwordEnc,
    );

  const user = db
    .prepare(
      `SELECT u.*, p.name AS plan_name, p.slug AS plan_slug
       FROM users u
       LEFT JOIN plans p ON p.id = u.plan_id
       WHERE u.id = ?`,
    )
    .get(Number(info.lastInsertRowid)) as Record<string, unknown> | undefined;

  return NextResponse.json({
    ok: true,
    user: user
      ? {
          ...user,
          hasStoredPassword: Boolean(user.password_enc),
          credentialsClaimed: Boolean(user.credentials_claimed_at),
        }
      : null,
    provisioningError,
  }, { status: 201 });
}
