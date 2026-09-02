import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/route-auth";
import { getTenantById } from "@/lib/tenant";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  tagline: z.string().max(120).optional(),
  description: z.string().max(2000).optional(),
  domains: z.string().max(1000).optional(),
  footer_note: z.string().max(300).optional(),
  active: z.boolean().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const tenant = getTenantById(Number(id));
  if (!tenant) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }
  const d = parsed.data;

  db.prepare(
    `UPDATE tenants SET
       name = ?, tagline = ?, description = ?, domains = ?, footer_note = ?, active = ?
     WHERE id = ?`,
  ).run(
    d.name ?? tenant.name,
    d.tagline ?? tenant.tagline,
    d.description !== undefined ? d.description : tenant.description,
    d.domains !== undefined ? d.domains : tenant.domains,
    d.footer_note !== undefined ? d.footer_note : tenant.footer_note,
    d.active !== undefined ? (d.active ? 1 : 0) : tenant.active,
    tenant.id,
  );

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const tenant = getTenantById(Number(id));
  if (!tenant) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const usersOnTenant = db
    .prepare("SELECT COUNT(*) AS c FROM users WHERE tenant_id = ?")
    .get(tenant.id) as { c: number };
  if (usersOnTenant.c > 0) {
    return NextResponse.json(
      { error: "This tenant has subscribers. Deactivate it instead of deleting." },
      { status: 409 },
    );
  }

  db.prepare("DELETE FROM tenants WHERE id = ?").run(tenant.id);
  return NextResponse.json({ ok: true });
}