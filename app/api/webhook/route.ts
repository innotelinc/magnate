import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { db, type UserRow } from "@/lib/db";
import { getStripe, stripeConfigured } from "@/lib/stripe";
import {
  ensureUser,
  findUser,
  findUserByEmail,
  setUserActive,
  setUserPassword,
} from "@/lib/authentik";
import { decrypt } from "@/lib/crypto";
import { getPlanBySlug } from "@/lib/plans";
import { stripeWebhookSecret } from "@/lib/settings";
import {
  creditReferrer,
  firstPaymentCentsFor,
} from "@/lib/referrals";

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

/** Provision the Authentik account for a paid checkout. Returns the user id. */
async function provisionUser(
  session: Stripe.Checkout.Session,
): Promise<number | undefined> {
  const username = session.metadata?.username;
  const planSlug = session.metadata?.plan_slug;
  if (!username) throw new Error("checkout session missing username metadata");

  const user = getUserByUsername(username);
  // Authentik is the account store: the user + password must be provisioned
  // there so the LDAP login works. (Jellyfin accounts are created automatically
  // on first login by the LDAP plugin.)
  const email = session.metadata?.email ?? user?.email ?? `${username}@local`;
  const plan = planSlug ? getPlanBySlug(planSlug) : undefined;

  const akUser = await ensureUser(username, email);

  // Fall back to a freshly generated password if the checkout pre-row is missing
  // (e.g. the webhook fired for a session created before this deploy).
  let passwordEnc = user?.password_enc ?? null;
  if (!passwordEnc) {
    const { encrypt, generatePassword } = await import("@/lib/crypto");
    passwordEnc = encrypt(generatePassword());
  }
  const password = decrypt(passwordEnc);
  await setUserPassword(akUser.pk, password);

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
      .run(email, username, passwordEnc);
    userId = Number(info.lastInsertRowid);
  }

  db.prepare(
    `UPDATE users SET
       jellyfin_user_id = NULL, stripe_customer_id = ?, stripe_subscription_id = ?,
       plan_id = ?, status = ?, current_period_end = ?, provisioning_error = NULL
     WHERE id = ?`,
  ).run(
    customerId ?? null,
    subscriptionId ?? null,
    plan?.id ?? user?.plan_id ?? null,
    status,
    currentPeriodEnd,
    userId,
  );

  // Reactivation: a returning subscriber's Authentik account may still be
  // disabled from a previous cancellation — re-enable it once billing is
  // active so "re-subscribing is instant".
  if (status === "active" && !akUser.is_active) {
    await setUserActive(akUser.pk, true);
  }
  return userId;
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

  // Magnate owns access enforcement (there is no separate billing-api): sync
  // the Authentik account with billing state — a disabled user cannot log in
  // via the LDAP outpost, which is exactly the "access revoked" behavior.
  const akUser =
    (await findUser(user.username)) ??
    (user.email ? await findUserByEmail(user.email) : null);
  if (!akUser) return;
  if (status === "cancelled" || status === "unpaid") {
    await setUserActive(akUser.pk, false);
  } else if (status === "active" && !akUser.is_active) {
    await setUserActive(akUser.pk, true);
  }
}

async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription,
): Promise<void> {
  const user = getUserBySubscription(subscription.id);
  if (!user) return;
  db.prepare("UPDATE users SET status = 'cancelled' WHERE id = ?").run(user.id);
  // Magnate owns access enforcement (there is no separate billing-api): revoke
  // access immediately by disabling the Authentik user, which blocks the
  // LDAP login. Re-subscribing re-enables it (see provisionUser).
  const akUser =
    (await findUser(user.username)) ??
    (user.email ? await findUserByEmail(user.email) : null);
  if (akUser) await setUserActive(akUser.pk, false);
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
          const userId = await provisionUser(session);
          // Referral program: credit the referrer a % of the first payment.
          if (userId && session.metadata?.ref_applied === "1") {
            const user = db
              .prepare("SELECT * FROM users WHERE id = ?")
              .get(userId) as UserRow | undefined;
            if (user?.referred_by) {
              const planId =
                typeof user.plan_id === "number" ? user.plan_id : null;
              const interval =
                session.metadata?.interval === "year" ? "year" : "month";
              await creditReferrer(
                user,
                firstPaymentCentsFor(user.id, planId, interval),
              );
            }
          }
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
          id?: string;
          subscription?: string | null;
          amount_paid?: number;
          currency?: string;
          lines?: {
            data?: Array<{ period?: { start?: number; end?: number } }>;
          };
        };
        if (typeof invoice.subscription === "string") {
          const user = getUserBySubscription(invoice.subscription);
          if (user) {
            db.prepare(
              "UPDATE users SET status = 'active', current_period_end = ?, payment_failed_count = 0, last_payment_failed_at = NULL WHERE id = ?",
            ).run(invoice.lines?.data?.[0]?.period?.end ?? null, user.id);
            // Revenue ledger for the analytics dashboard.
            if (invoice.id && invoice.amount_paid && invoice.amount_paid > 0) {
              db.prepare(
                `INSERT OR IGNORE INTO payments
                   (invoice_id, user_id, amount_cents, currency, period_start, period_end)
                 VALUES (?, ?, ?, ?, ?, ?)`,
              ).run(
                invoice.id,
                user.id,
                invoice.amount_paid,
                (invoice.currency ?? "usd").toLowerCase(),
                invoice.lines?.data?.[0]?.period?.start ?? null,
                invoice.lines?.data?.[0]?.period?.end ?? null,
              );
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
            db.prepare(
              `UPDATE users SET
                 status = 'past_due',
                 payment_failed_count = payment_failed_count + 1,
                 last_payment_failed_at = datetime('now')
               WHERE id = ?`,
            ).run(user.id);
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
