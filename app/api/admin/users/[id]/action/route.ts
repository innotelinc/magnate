import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/route-auth";
import { db, type UserRow } from "@/lib/db";
import {
  deleteUser as jellyfinDeleteUser,
  findUserByName,
  createUser,
  setUserEnabled,
} from "@/lib/jellyfin";
import { decrypt } from "@/lib/crypto";

export const dynamic = "force-dynamic";

const schema = z.object({
  action: z.enum(["enable", "disable", "delete", "reveal", "reprovision"]),
  cancelStripeSubscription: z.boolean().optional().default(false),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(Number(id)) as
    | UserRow
    | undefined;
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
  const { action, cancelStripeSubscription } = parsed.data;

  try {
    switch (action) {
      case "enable": {
        if (!user.jellyfin_user_id) throw new Error("User has no Jellyfin ID");
        await setUserEnabled(user.jellyfin_user_id, true);
        db.prepare(
          "UPDATE users SET status = 'active', provisioning_error = NULL WHERE id = ?",
        ).run(user.id);
        break;
      }
      case "disable": {
        if (!user.jellyfin_user_id) throw new Error("User has no Jellyfin ID");
        await setUserEnabled(user.jellyfin_user_id, false);
        db.prepare("UPDATE users SET status = 'disabled' WHERE id = ?").run(
          user.id,
        );
        break;
      }
      case "reprovision": {
        // Re-run Jellyfin provisioning (useful if the webhook failed earlier).
        if (!user.password_enc) throw new Error("No stored password");
        const password = decrypt(user.password_enc);
        let jfUser = user.jellyfin_user_id
          ? { Id: user.jellyfin_user_id }
          : await findUserByName(user.username);
        if (!jfUser) {
          jfUser = await createUser(user.username, password);
        }
        await setUserEnabled(jfUser.Id, true);
        db.prepare(
          `UPDATE users SET jellyfin_user_id = ?, status = 'active', provisioning_error = NULL WHERE id = ?`,
        ).run(jfUser.Id, user.id);
        break;
      }
      case "reveal": {
        if (!user.password_enc) {
          return NextResponse.json(
            { error: "No password stored for this user." },
            { status: 404 },
          );
        }
        return NextResponse.json({
          username: user.username,
          password: decrypt(user.password_enc),
        });
      }
      case "delete": {
        if (user.jellyfin_user_id) {
          await jellyfinDeleteUser(user.jellyfin_user_id).catch((err) => {
            console.error("jellyfin delete failed", err);
            throw new Error(
              `Jellyfin delete failed (${err.status || "network"}). The user may not exist anymore — delete again to remove locally.`,
            );
          });
        }
        if (
          cancelStripeSubscription &&
          user.stripe_subscription_id
        ) {
          const { getStripe, stripeConfigured } = await import("@/lib/stripe");
          if (stripeConfigured()) {
            await getStripe().subscriptions.cancel(
              user.stripe_subscription_id,
            );
          }
        }
        db.prepare("DELETE FROM users WHERE id = ?").run(user.id);
        break;
      }
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`admin action ${action} failed`, err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Action failed. See server logs.",
      },
      { status: 500 },
    );
  }
}
