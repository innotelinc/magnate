import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/route-auth";
import { listTenants, getTenantBySlug } from "@/lib/tenant";
import { db, type Tenant } from "@/lib/db";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  slug: z.string().min(2).max(64).regex(/^[a-z0-9-]+$/, "Slug: lowercase letters, numbers, dashes"),
  name: z.string().min(1).max(120),
  tagline: z.string().max(120).optional().default("Subscription Platform"),
  description: z.string().max(2000).optional().default(""),
  domains: z.string().max(1000).optional().default(""),
  footer_note: z.string().max(300).optional().default(""),
  active: z.boolean().optional().default(true),
});

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tenants = listTenants().map((t) => ({
    id: t.id,
    slug: t.slug,
    name: t.name,
    tagline: t.tagline,
    description: t.description,
    domains: t.domains,
    footer_note: t.footer_note,
    active: Boolean(t.active),
  }));
  return NextResponse.json({ tenants });
}

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
  const data = parsed.data;

  if (getTenantBySlug(data.slug)) {
    return NextResponse.json(
      { error: "A tenant with this slug already exists." },
      { status: 409 },
    );
  }

  const info = db
    .prepare(
      `INSERT INTO tenants (slug, name, tagline, description, domains, footer_note, active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      data.slug,
      data.name,
      data.tagline,
      data.description,
      data.domains,
      data.footer_note,
      data.active ? 1 : 0,
    );

  const row = db
    .prepare("SELECT * FROM tenants WHERE id = ?")
    .get(Number(info.lastInsertRowid)) as Tenant;

  return NextResponse.json({ tenant: row }, { status: 201 });
}