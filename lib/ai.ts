/**
 * AI recommendations & churn prevention.
 *
 * Recommendations: pull a subscriber's recently-played item titles from
 * Jellyfin, then ask an OpenAI-compatible chat-completions endpoint for a
 * curated "watch next" list with one-line reasons. The provider is fully
 * configurable via AI_API_URL / AI_API_KEY / AI_MODEL, so any compatible
 * hosted or self-hosted model works.
 *
 * Churn prevention: a winback checkout flow that gives an at-risk subscriber
 * a fresh chance to keep their plan (new coupon + payment session).
 */

import { jellyfinUrl, jellyfinApiKey } from "./settings";
import { stripeConfigured, getStripe } from "./stripe";
import { db, type UserRow } from "./db";

/* ---------- config ---------- */

export function aiConfigured(): boolean {
  return Boolean(process.env.AI_API_KEY && process.env.AI_API_URL);
}

export function aiModel(): string {
  return process.env.AI_MODEL || "gpt-4o-mini";
}

function aiBaseUrl(): string {
  return (process.env.AI_API_URL || "https://api.openai.com/v1").replace(
    /\/+$/,
    "",
  );
}

function winbackPercent(): number {
  const raw = process.env.WINBACK_OFFER_PERCENT;
  const n = raw ? Number(raw) : 25;
  return Number.isFinite(n) && n > 0 ? Math.min(90, n) : 25;
}

/* ---------- Jellyfin history ---------- */

interface JellyfinUser {
  Id: string;
  Name: string;
}

interface JellyfinItem {
  Name: string;
}

/** Recently played item titles for a Jellyfin user (by username). */
export async function fetchJellyfinHistory(
  username: string,
): Promise<string[]> {
  const base = jellyfinUrl();
  const key = jellyfinApiKey();
  if (!base || !key) throw new Error("Jellyfin is not configured");

  const users = (await (
    await fetch(`${base}/Users?api_key=${encodeURIComponent(key)}`)
  ).json()) as JellyfinUser[];
  const user = users.find(
    (u) => u.Name.toLowerCase() === username.toLowerCase(),
  );
  if (!user) throw new Error(`No Jellyfin user named "${username}"`);

  const url =
    `${base}/Users/${user.Id}/Items?api_key=${encodeURIComponent(key)}` +
    `&Recursive=true&SortBy=DatePlayed&SortOrder=Descending&Filters=IsPlayed&Limit=30`;
  const data = (await (await fetch(url)).json()) as { Items: JellyfinItem[] };
  return (data.Items ?? [])
    .filter((i) => i.Name)
    .map((i) => i.Name);
}

/* ---------- AI recommendation generation ---------- */

export interface Recommendation {
  title: string;
  why: string;
}

/**
 * Generate a personalized "watch next" list for a Jellyfin user.
 * Throws when AI or Jellyfin isn't configured.
 */
export async function generateRecommendations(
  username: string,
): Promise<Recommendation[]> {
  if (!aiConfigured()) throw new Error("AI is not configured (AI_API_KEY)");

  const history = await fetchJellyfinHistory(username);
  if (history.length === 0) {
    throw new Error(
      "No viewing history found for this user — watch something first, then ask again.",
    );
  }

  const prompt = `You are a curatorial streaming recommender for a private media library.
The viewer has recently watched these titles:
${history.map((t) => `- ${t}`).join("\n")}

Recommend 6 hidden gems and crowd-pleasers from their library they are likely to enjoy next,
matching their taste. Do NOT repeat titles from the watched list. For each pick give the reason
in one short sentence.

Respond with strict JSON only, no markdown:
{"recommendations":[{"title":"...","why":"..."}]}`;

  const body = {
    model: aiModel(),
    temperature: 0.7,
    max_tokens: 900,
    messages: [{ role: "user", content: prompt }],
  };

  // Some providers reject response_format — try JSON mode, fall back to plain.
  let res = await fetch(`${aiBaseUrl()}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.AI_API_KEY}`,
    },
    body: JSON.stringify({ ...body, response_format: { type: "json_object" } }),
  });

  if (!res.ok) {
    res = await fetch(`${aiBaseUrl()}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.AI_API_KEY}`,
      },
      body: JSON.stringify(body),
    });
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`AI request failed (${res.status}): ${text.slice(0, 200)}`);
  }

  return parseRecommendations(await res.json());
}

function parseRecommendations(data: {
  choices?: Array<{ message?: { content?: string } }>;
}): Recommendation[] {
  const content = data.choices?.[0]?.message?.content ?? "{}";
  try {
    const json = JSON.parse(content) as { recommendations?: Recommendation[] };
    return Array.isArray(json.recommendations)
      ? json.recommendations.slice(0, 6).map((r) => ({
          title: String(r.title ?? ""),
          why: String(r.why ?? ""),
        }))
      : [];
  } catch {
    return [];
  }
}

/* ---------- churn prevention: winback flow ---------- */

/**
 * Create a Stripe checkout session that lets an at-risk user pay a reduced
 * first period to keep their subscription. Returns the hosted URL.
 */
export async function createWinbackCheckout(
  user: UserRow,
): Promise<string> {
  if (!stripeConfigured()) {
    throw new Error("Stripe is not configured");
  }
  const stripe = getStripe();

  const plan = user.plan_id
    ? (db
        .prepare(
          "SELECT name, slug, stripe_price_monthly_id FROM plans WHERE id = ?",
        )
        .get(user.plan_id) as
        | {
            name: string;
            slug: string;
            stripe_price_monthly_id: string | null;
          }
        | undefined)
    : undefined;

  const priceId = plan?.stripe_price_monthly_id;
  if (!priceId) {
    throw new Error("This user's plan isn't set up for billing.");
  }

  const coupon = await stripe.coupons.create({
    percent_off: winbackPercent(),
    duration: "once",
    name: `Winback ${user.username}`,
    metadata: { reason: "churn-prevention", user_id: String(user.id) },
  });

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: user.stripe_customer_id ?? undefined,
    line_items: [{ price: priceId, quantity: 1 }],
    discounts: [{ coupon: coupon.id }],
    metadata: {
      username: user.username,
      user_id: String(user.id),
      winback: "1",
    },
    subscription_data: {
      metadata: { username: user.username, user_id: String(user.id), winback: "1" },
    },
    success_url: `${process.env.APP_URL || "http://localhost:3000"}/manage?success=1`,
    cancel_url: `${process.env.APP_URL || "http://localhost:3000"}/manage`,
    allow_promotion_codes: false,
  });

  db.prepare("UPDATE users SET winback_status = ? WHERE id = ?").run(
    coupon.id,
    user.id,
  );

  return session.url!;
}