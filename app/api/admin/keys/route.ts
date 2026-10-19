// Standing admin API keys — the credential automation uses.
//
// The panel is a person at a browser and its session lasts a week; a pipeline
// that has to create a plan is neither. Without this, every routine catalog
// change meant re-enabling break-glass, signing in with the local password and
// restarting the app. With it, the work is `Authorization: Bearer <key>`.
//
// The key is returned exactly once, when it is minted: the row keeps only its
// SHA-256, so nobody — not this endpoint, not the dashboard, not a copy of the
// database — can hand it back afterwards. A lost key is revoked and replaced.
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/route-auth";
import { listAdminApiKeys, mintAdminApiKey } from "@/lib/auth";

export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().trim().min(1).max(64),
});

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

/** Every key ever minted, revoked ones included — a key nobody remembers is one to revoke. */
export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return unauthorized();
  }
  return NextResponse.json({ keys: listAdminApiKeys() });
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
  } catch {
    return unauthorized();
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Name the key — that is how it is found again in the list." },
      { status: 400 },
    );
  }

  const { key, token } = mintAdminApiKey(parsed.data.name);
  return NextResponse.json({
    key,
    token,
    warning:
      "This is the only time the key is shown. Store it where this deployment keeps its secrets.",
  });
}
