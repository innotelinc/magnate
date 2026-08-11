import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { db, type UserRow } from "@/lib/db";
import { getStripe, stripeConfigured } from "@/lib/stripe";
import { createUser, findUserByName, setUserEnabled } from "@/lib/jellyfin";
import { decrypt } from "@/lib/crypto";
import { getPlanBySlug } from "@/lib/plans";
import { stripeWebhookSecret } from "@/lib/settings";

export const dynamic = "force-dynamic";

function markEventProcessed(eventId: string, type: string) {
  db.prepare(
    "INSERT OR IGNORE INTO webhook_events (id, type) VALUES (?, ?)",
  ).run(eventId, type);
}

function eventAlreadyProcessed(eventId: string): boolean {
  return Boolean(
    db.prepare("SELECT id FROM webhook_events WHERE id = ?").get(eventId),
  );
}

function getUserByUsername(username: string): UserRow | undefined {
  return db
    .prepare("SELECT * FROM users WHERE lower(username) = lower(?)")
    .get(username) as UserRow | undefined;
}

function getUserBySubscription(subId: string): UserRow | undefined {
  return db
    .prepare("SELECT * FROM users WHERE stripe_subscription_id = ?")
    .get(subId) as UserRow | undefined;
}


function mapStatus(status: Stripe.Subscription.Status): string {
  switch (status) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
      return "past_due";
    case "unpaid":
      return "unpaid";
    case "canceled":
    case "incomplete_expired":
      return "cancelled";
    default:
      return "pending";
  }
}

/** Billing period end lives on the subscription's items in the current API. */
function getPeriodEnd(sub: {
  items?: { data?: Array<{ current_period_end?: number | null }> };
}): number | null {
  return sub.items?.data?.[0]?.current_period_end ?? null;
}

/** Provision a Jellyfin account for a paid checkout. */
async function provisionUser(session: Stripe.Checkout.Session): Promise<void> {
  const username = session.metadata?.username;
  const planSlug = session.metadata?.plan_slug;
  if (!username) throw new Error("checkout session missing username metadata");

  const user = getUserByUsername(username);
  if (user && user.jellyfin_user_id) return; // already provisioned

  const plan = planSlug ? getPlanBySlug(planSlug) : undefined;

  // Fall back to a freshly generated password if the checkout pre-row is missing
  // (e.g. the webhook fired for a session created before this deploy).
  let passwordEnc = user?.password_enc ?? null;
  if (!passwordEnc) {
    const { encrypt, generatePassword } = await import("@/lib/crypto");
    passwordEnc = encrypt(generatePassword());
  }
  const password = decrypt(passwordEnc);

  // Create the user in Jellyfin (idempotent-ish: reuse if it already exists).
  let jellyfinUser;
  try {
    jellyfinUser = await createUser(username, password);
  } catch (err) {
    jellyfinUser = await findUserByName(username);
    if (!jellyfinUser) throw err;
  }

  await setUserEnabled(jellyfinUser.Id, true);

  const subscriptionId =
    typeof session.subscription === "string" ? session.subscription : undefined;
  let status = "active";
  let currentPeriodEnd: number | null = null;
  if (subscriptionId) {
    const sub = await getStripe().subscriptions.retrieve(subscriptionId);
    status = mapStatus(sub.status);
    currentPeriodEnd = getPeriodEnd(sub);
  }

  const customerId =
    typeof session.customer === "string" ? session.customer : undefined;

  let userId = user?.id;
  if (!userId) {
    const info = db
      .prepare(
        "INSERT INTO users (email, username, password_enc, status) VALUES (?, ?, ?, 'pending')",
      )
      .run(
        session.metadata?.email ?? `${username}@local`,
        username,
        passwordEnc,
      );
    userId = Number(info.lastInsertRowid);
  }

  db.prepare(
    `UPDATE users SET
       jellyfin_user_id = ?, stripe_customer_id = ?, stripe_subscription_id = ?,
       plan_id = ?, status = ?, current_period_end = ?, provisioning_error = NULL
     WHERE id = ?`,
  ).run(
    jellyfinUser.Id,
    customerId ?? null,
    subscriptionId ?? null,
    plan?.id ?? user?.plan_id ?? null,
    status,
    currentPeriodEnd,
    userId,
  );
}

async function handleSubscriptionUpdated(
  subscription: Stripe.Subscription,
): Promise<void> {
  const user = getUserBySubscription(subscription.id);
  if (!user) return;
  const status = mapStatus(subscription.status);
  db.prepare(
    "UPDATE users SET status = ?, current_period_end = ? WHERE id = ?",
  ).run(status, getPeriodEnd(subscription), user.id);

  // Re-enable access when the subscription becomes active again.
  if (status === "active" && user.jellyfin_user_id) {
    try {
      await setUserEnabled(user.jellyfin_user_id, true);
    } catch {
      // best-effort
    }
  }
}

async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription,
): Promise<void> {
  const user = getUserBySubscription(subscription.id);
  if (!user) return;
  db.prepare("UPDATE users SET status = 'cancelled' WHERE id = ?").run(user.id);
  // Revoke access — disable rather than delete so re-subscribing is painless.
  if (user.jellyfin_user_id) {
    try {
      await setUserEnabled(user.jellyfin_user_id, false);
    } catch {
      // best-effort
    }
  }
}

export async function POST(req: Request) {
  if (!stripeConfigured() || !stripeWebhookSecret()) {
    return NextResponse.json(
      { error: "Stripe webhook is not configured" },
      { status: 500 },
    );
  }

  const payload = await req.text();
  const sig = req.headers.get("stripe-signature");

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(
      payload,
      sig ?? "",
      stripeWebhookSecret() ?? "",
    );
  } catch (err) {
    console.error("webhook signature verification failed", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (eventAlreadyProcessed(event.id)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "subscription") {
          await provisionUser(session);
        }
        break;
      }
      case "customer.subscription.updated": {
        await handleSubscriptionUpdated(
          event.data.object as Stripe.Subscription,
        );
        break;
      }
      case "customer.subscription.deleted": {
        await handleSubscriptionDeleted(
          event.data.object as Stripe.Subscription,
        );
        break;
      }
      case "invoice.payment_succeeded": {
        const invoice = event.data.object as unknown as {
          subscription?: string | null;
          lines?: { data?: Array<{ period?: { end?: number } }> };
        };
        if (typeof invoice.subscription === "string") {
          const user = getUserBySubscription(invoice.subscription);
          if (user) {
            db.prepare(
              "UPDATE users SET status = 'active', current_period_end = ? WHERE id = ?",
            ).run(invoice.lines?.data?.[0]?.period?.end ?? null, user.id);
            if (user.jellyfin_user_id) {
              try {
                await setUserEnabled(user.jellyfin_user_id, true);
              } catch {
                /* best-effort */
              }
            }
          }
        }
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as unknown as {
          subscription?: string | null;
        };
        if (typeof invoice.subscription === "string") {
          const user = getUserBySubscription(invoice.subscription);
          if (user) {
            db.prepare("UPDATE users SET status = 'past_due' WHERE id = ?").run(
              user.id,
            );
          }
        }
        break;
      }
      default:
        // Acknowledge events we don't care about.
        break;
    }

    markEventProcessed(event.id, event.type);
    return NextResponse.json({ received: true });
  } catch (err) {
    // Returning an error makes Stripe retry the webhook later.
    console.error(`webhook handler failed for ${event.type}`, err);
    return NextResponse.json(
      { error: "Handler failed" },
      { status: 500 },
    );
  }
}
