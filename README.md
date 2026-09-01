# Innotel Media — Jellyfin Subscription Site

A modern subscription site for a self-hosted **Jellyfin** media server.
Users pick a monthly or yearly plan, pay through **Stripe**, and their
account is provisioned in **Authentik** — the stack's identity provider.
Jellyfin logins authenticate against Authentik through the **LDAP outpost**,
so a paid subscriber's credentials are the same everywhere. Plans are managed
from an **admin panel**; users manage their own account (password resets) in
Authentik's self-service portal.

## About

**Innotel Media** is a private, self-hosted streaming service built on
[Jellyfin](https://jellyfin.org). We run and manage our own media server and
subscription infrastructure — Stripe handles payments, Authentik is the
identity provider (users & passwords, with Jellyfin authenticating against it
through the LDAP outpost), and Jellyseerr handles movie & TV requests for
Premium subscribers. No ads, no tracking: just a fast, private library for you and
your family.

## Features

- 💳 **Stripe billing** — hosted Checkout (cards, Apple Pay, Google Pay), one-time
  credential reveal after payment, Customer Portal for upgrades/downgrades/cancellations
- 📺 **Authentik-first accounts** — the moment payment is confirmed the
  subscriber's Authentik account is created with a generated password; Jellyfin
  authenticates against Authentik via the LDAP outpost, and disabling the
  Authentik user blocks their Jellyfin login immediately
- 🗓️ **3 subscription tiers** — Basic, Standard & Premium, each with monthly
  and yearly pricing; editable from the admin panel; prices sync to Stripe
  automatically (new prices are created when you change an amount)
- 🎬 **Premium request access** — Premium subscribers get exclusive access to a
  Jellyseerr request portal (`req.innotel.us`) for requesting movies & shows;
  the request link appears only on the success page for Premium purchases
- 🔐 **Admin panel** — edit/create/delete plans, view users, reveal (encrypted)
  credentials, enable/disable/delete Authentik users, re-provision failed accounts
- 🗄️ **Local SQLite database** — no external database service needed
- 🌐 **Authentik self-service portal** — linked everywhere; users reset passwords
  and manage devices in Authentik's `/if/user/` page

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
- An Authentik instance with a **bootstrap token** (accounts & passwords live
  there; Jellyfin authenticates via the LDAP outpost)
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
| `AUTHENTIK_BASE_URL` | Authentik API, e.g. `https://auth.innotel.us` |
| `AUTHENTIK_BOOTSTRAP_TOKEN` | Authentik bootstrap token (same one the ARR stack's billing-api uses) |
| `JFA_GO_URL` | Account portal link — Authentik self-service user settings (password resets), e.g. `https://auth.innotel.us/if/user/` |
| `REQUEST_URL` | Jellyseerr movie/TV request portal (Premium perk), e.g. `https://req.innotel.us` |
| `ADMIN_PASSWORD` | Password for the admin panel (`/admin`) |
| `SESSION_SECRET` | Long random string (encrypts stored credentials, signs sessions) |

> `SESSION_SECRET` is used to encrypt the generated passwords at rest. If you
> change it after users have signed up, you can no longer decrypt stored
> passwords.

## 2. Run

### Docker (recommended)

Build from source:

```bash
docker compose up -d --build
```

Or pull the prebuilt image published to **GitHub Container Registry** for each
[release](https://github.com/innotelinc/jellyfin-subscription-platform/releases).
Because the repo is private, authenticate to GHCR first with a token that has
`read:packages`:

```bash
echo YOUR_GH_PAT | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
docker pull ghcr.io/innotelinc/jellyfin-subscription-platform:v1.0.0
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
3. On payment success, a webhook provisions the **Authentik** account with a
   **generated strong password** (encrypted at rest in SQLite) and stores the
   Stripe customer/subscription IDs.
4. The success page reveals the username + password **once** (polling until the
   webhook completes). Users are pointed to Jellyfin — where the LDAP plugin
   auto-creates their account on first login — and to Authentik's self-service
   portal for future password resets. **Premium** purchases also get a link to
   the request portal (`req.innotel.us`).
5. `customer.subscription.deleted` → the Authentik user is set **inactive**,
   which blocks their LDAP login immediately; re-subscribing is instant. The
   admin can fully delete users from the panel.

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

## Releases & Docker image

Each tagged release is published as a container image to GitHub Container
Registry:

```
ghcr.io/innotelinc/jellyfin-subscription-platform:v1.0.0
```

The image runs as a non-root `node` user and expects `/app/data` to be writable for
uid 1000 (the startup entrypoint handles this automatically). After the GHCR
login above, run it directly:

```bash
docker run -d --name jellyfin-subscription \
  -p 3000:3000 \
  -v "$(pwd)/data:/app/data" \
  --env-file .env \
  ghcr.io/innotelinc/jellyfin-subscription-platform:v1.0.0
```

## Project structure

```
app/                  Pages (landing, signup, success, cancel, manage, admin)
app/api/              Route handlers (checkout, webhook, claim, manage, admin CRUD)
components/           React components (pricing, forms, admin dashboard, icons)
lib/                  db.ts, stripe.ts, authentik.ts, crypto.ts, auth.ts, plans.ts
data/                 SQLite database (created at runtime, gitignored)
```

## Troubleshooting

### AppArmor errors during Docker build (`apparmor failed to apply profile`)

If you see this error on a host with broken AppArmor compatibility:

```
runc run failed: unable to start container process: error during container init:
unable to apply apparmor profile: apparmor failed to apply profile
```

**Recommended fix — remove AppArmor from the host:**

```bash
# Check if AppArmor is installed
sudo dpkg -l | grep apparmor

# Purge AppArmor packages (Debian/Ubuntu)
sudo apt purge -y apparmor apparmor-utils apparmor-profiles apparmor-profiles-extra

# Reboot to fully unload the AppArmor kernel module
sudo reboot
```

After reboot, rebuild with `docker compose up --build -d`.

**Alternative — disable via Docker daemon config** (if you'd rather keep AppArmor installed):

```bash
sudo cp docker-daemon.json /etc/docker/daemon.json
sudo systemctl restart docker
```

Then rebuild with `docker compose up --build -d`.

