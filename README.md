# Innotel Media — Jellyfin Subscription Site

A modern subscription site for a self-hosted **Jellyfin** media server.
Users pick a monthly or yearly plan, pay through **Stripe**, and a Jellyfin
account is provisioned automatically. Plans are managed from an **admin
panel**; users manage their Jellyfin account on your existing **jfa-go**
portal (`accounts.innotel.us`).

## Features

- 💳 **Stripe billing** — hosted Checkout (cards, Apple Pay, Google Pay), one-time
  credential reveal after payment, Customer Portal for upgrades/downgrades/cancellations
- 📺 **Jellyfin provisioning** — creates the user via the Jellyfin API the moment
  payment is confirmed; disables access when a subscription is cancelled
- 🗓️ **3 subscription tiers** — Basic, Standard & Premium, each with monthly
  and yearly pricing; editable from the admin panel; prices sync to Stripe
  automatically (new prices are created when you change an amount)
- 🎬 **Premium request access** — Premium subscribers get exclusive access to a
  Jellyseerr request portal (`req.innotel.us`) for requesting movies & shows;
  the request link appears only on the success page for Premium purchases
- 🔐 **Admin panel** — edit/create/delete plans, view users, reveal (encrypted)
  credentials, enable/disable/delete Jellyfin users, re-provision failed accounts
- 🗄️ **Local SQLite database** — no external database service needed
- 🌐 **jfa-go integration** — account portal is linked everywhere; users reset
  passwords and manage devices there

## Plans

| Plan | Monthly | Yearly | Quality | Highlights |
| --- | --- | --- | --- | --- |
| Basic | $3.00 | $30.00 | 480p | 1 stream, watch on TV, phone & tablet |
| Standard | $7.00 | $70.00 | 1080p | 2 streams, watch on TV, phone & tablet |
| Premium | $10.00 | $100.00 | 4K HDR | 4 streams, priority support, **request access** |

- Yearly pricing equals 10 months of the monthly price (“2 months free”).
- There are **no free trials** — access starts when payment succeeds.
- Plans are seeded on first run and editable from the **admin panel** (prices
  sync to Stripe automatically).

## Architecture

```
Visitor ──▶ Landing page ──▶ /signup ──▶ Stripe Checkout
                                          │
                          webhook (checkout.session.completed)
                                          ▼
                               Jellyfin API (POST /Users/New)
                                          │
                                    SQLite (users, plans)
                                          ▼
                        Success page shows one-time credentials
```

## Requirements

- Node.js 20+ (local dev) or Docker (recommended for deployment)
- A Jellyfin server with an **API key**
- Stripe account (test mode is fine to start)
- An existing jfa-go instance (for the account portal link)
- A Jellyseerr (or similar) request portal for the Premium request perk — its
  access must be restricted to Premium Jellyfin users on the Jellyseerr side

## 1. Configuration

Copy `.env.sample` to `.env` and fill it in:

| Variable | Description |
| --- | --- |
| `APP_URL` | Public URL of this site (used in Stripe redirects) |
| `STRIPE_SECRET_KEY` | Secret key from [Stripe dashboard](https://dashboard.stripe.com/apikeys) |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` from your webhook endpoint (step 3) |
| `STRIPE_CURRENCY` | Currency for plan prices, e.g. `usd` (default) |
| `JELLYFIN_URL` | Your Jellyfin server, e.g. `https://media.innotel.us` |
| `JELLYFIN_API_KEY` | Jellyfin **Dashboard → Advanced → API Keys** |
| `JFA_GO_URL` | Your jfa-go portal, e.g. `https://accounts.innotel.us` |
| `REQUEST_URL` | Jellyseerr movie/TV request portal (Premium perk), e.g. `https://req.innotel.us` |
| `ADMIN_PASSWORD` | Password for the admin panel (`/admin`) |
| `SESSION_SECRET` | Long random string (encrypts stored credentials, signs sessions) |

> `SESSION_SECRET` is used to encrypt the generated passwords at rest. If you
> change it after users have signed up, you can no longer decrypt stored
> passwords.

## 2. Run

### Docker (recommended)

```bash
docker compose up -d --build
```

The site is served on port 3000 (persisted DB lives in `./data`). Point your
reverse proxy (Caddy, Nginx, Traefik…) at it and expose it as your chosen
domain, e.g. `https://subscribe.innotel.us`.

### Local development

```bash
npm install
npm run dev
```

## 3. Stripe setup

1. **Plans & prices**: open `/admin` after logging in and click **Save** on the
   seeded plans (or create your own). The server creates a Stripe **Product**
   and two recurring **Prices** (month & year) for each plan automatically. If
   you change a price later, a new Stripe price is created and the old one
   archived.
2. **Webhook endpoint**: in the Stripe dashboard go to
   **Developers → Webhooks → Add endpoint**:
   - URL: `https://YOUR-DOMAIN/api/webhook`
   - Events: subscribe to **all** of:
     - `checkout.session.completed`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.payment_succeeded`
     - `invoice.payment_failed`
   - Copy the signing secret (`whsec_…`) into `STRIPE_WEBHOOK_SECRET`.
3. **Local testing**: use the Stripe CLI for local webhook forwarding:

   ```bash
   stripe listen --forward-to localhost:3000/api/webhook
   stripe trigger checkout.session.completed
   ```

## 4. How the signup flow works

1. User picks a plan on the landing page (monthly/yearly toggle).
2. They enter an email + desired username and are taken to Stripe Checkout.
3. On payment success, a webhook provisions the Jellyfin account with a
   **generated strong password** (encrypted at rest in SQLite) and stores the
   Stripe customer/subscription IDs.
4. The success page reveals the username + password **once** (polling until the
   webhook completes). Users are pointed to Jellyfin and to the jfa-go portal
   (`accounts.innotel.us`) for future password resets. **Premium** purchases also
   get a link to the request portal (`req.innotel.us`).
5. `customer.subscription.deleted` → the Jellyfin user is **disabled** (not
   deleted) so re-subscribing is instant. The admin can fully delete users from
   the panel.

## 5. Admin panel

Visit `/admin` and sign in with `ADMIN_PASSWORD`.

- **Plans** — create, edit, delete (plans with subscribers can only be
  deactivated), mark as highlighted, toggle visibility, edit features.
- **Users** — every signup appears here, including `pending` ones. Actions:
  reveal credentials, enable/disable access, re-provision, delete (optionally
  also cancels the Stripe subscription).

The top of the dashboard shows a config check (Stripe / webhook / Jellyfin /
admin password) so you can spot missing setup at a glance.

## 6. Notes & security

- Passwords are generated server-side, shown once, and stored **AES-256-GCM
  encrypted**. The public claim endpoint returns them a single time.
- The webhook verifies Stripe signatures; events are deduplicated by event ID.
- Admin sessions are signed, httpOnly cookies with a 7-day expiry.
- Cancelled subscriptions disable access at the end of the billing period
  (Stripe sends the `deleted` event then) — grace for past-due invoices is
  Stripe's default behavior.
- Username uniqueness is checked against the live Jellyfin server before
  checkout; the webhook also handles rare race conditions gracefully.

## Project structure

```
app/                  Pages (landing, signup, success, cancel, manage, admin)
app/api/              Route handlers (checkout, webhook, claim, manage, admin CRUD)
components/           React components (pricing, forms, admin dashboard, icons)
lib/                  db.ts, stripe.ts, jellyfin.ts, crypto.ts, auth.ts, plans.ts
data/                 SQLite database (created at runtime, gitignored)
```

