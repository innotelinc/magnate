<div align="center">

# 💎 Magnate — Subscription & Streaming Platform

**Premium, self-hosted memberships and billing for creators — Stripe checkout, Authentik accounts, and a professional streaming experience on your own infrastructure.**

Magnate turns subscriptions into revenue you own: a storefront with Stripe checkout and
instant account provisioning, recurring billing with prorated upgrades, an admin panel
with MRR analytics and churn prevention, affiliate referrals, AI watchlists, and
multi-tenant white-label storefronts — all fronted by Jellyfin media delivery.

[![CI](https://github.com/innotelinc/magnate/actions/workflows/ci.yml/badge.svg)](https://github.com/innotelinc/magnate/actions/workflows/ci.yml)
[![Release](https://github.com/innotelinc/magnate/actions/workflows/release.yml/badge.svg)](https://github.com/innotelinc/magnate/actions/workflows/release.yml)

</div>

> **About Magnate** — the self-hosted subscription and streaming platform for creators
> and organizations: manage memberships, process recurring Stripe billing, and deliver a
> professional Jellyfin streaming experience on your own infrastructure — with
> Authentik-first accounts, affiliate referrals, AI churn prevention, and white-label
> tenants. **Landing page:** [innotelinc.github.io/magnate](https://innotelinc.github.io/magnate)

---

## ✨ Features

- **Storefront** — plan pages, Stripe checkout, instant account provisioning
- **Authentik-first accounts** — passwords and SSO live in Authentik; Jellyfin
  authenticates against it via the LDAP outpost
- **Billing** — monthly/yearly plans, Stripe Customer Portal, cancellation &
  prorated upgrades
- **Admin panel** — plans, users, settings, marketing analytics, churn queue
- **Affiliate & referrals** — referral codes, first-payment rewards (Stripe
  balance credits), first-invoice discount coupons
- **AI recommendations & churn prevention** — personalized watchlists from
  Jellyfin viewing history; winback offers for at-risk subscribers
- **Multi-tenant & white-label** — each tenant owns its brand and domains
- **Automated releases** — tagged releases publish a Docker image to GHCR and
  attach offline deploy artifacts to a GitHub Release

## Subdomains

`setup.sh` provisions everything on an **Nginx Proxy Manager** instance and
issues a **wildcard Let's Encrypt certificate** via DNS challenge:

| Host | Service |
| --- | --- |
| `app.magnate.innotel.us` | Storefront (this app) |
| `auth.magnate.innotel.us` | Authentik (SSO, LDAP outpost) |
| `media.magnate.innotel.us` | Jellyfin media server |
| `billing.magnate.innotel.us` | Billing / Stripe portal UI |
| `admin.magnate.innotel.us` | Admin panel |

## Architecture

```
Visitor ──▶ app.magnate.innotel.us ──▶ /signup ──▶ Stripe Checkout
                                                     │
                     webhook (checkout.session.completed)
                                                     ▼
                                   Authentik (account + password)
                                                     │
                                    Jellyfin (LDAP outpost login)
                                                     ▼
                           SQLite (users, plans, payments, referrals,
                                   tenants) — ./data/magnate.db
                                                     ▼
               Success page shows one-time credentials + referral link
```

## Quickstart

```bash
# 1. Configure
cp .env.sample .env        # fill in Stripe, Authentik, Jellyfin, NPM…
vim .env

# 2. Deploy (builds the app, provisions NPM hosts + wildcard SSL)
./setup.sh
```

Or run just the app:

```bash
docker compose up -d --build
```

Requirements: Docker with the compose plugin, python3 (stdlib-only provisioner),
a running Nginx Proxy Manager (v2.11+) and Jellyfin reachable on the same host.
Authentik is external by default (`AUTHENTIK_MODE=remote`); the Compose file's
MariaDB-backed Authentik replacement is optional via `--profile authentik`.

## Configuration

Key variables (full list in `.env.sample`):

| Variable | Description |
| --- | --- |
| `APP_URL` | Storefront URL (Stripe redirects), e.g. `https://app.magnate.innotel.us` |
| `MAGNATE_PORT` | Host port published for the app (default `3000`) |
| `BILLING_API_URL` | Legacy no-op — the ARR billing-api was retired; Magnate enforces access itself |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_CURRENCY` | Stripe setup |
| `JELLYFIN_URL` / `JELLYFIN_API_KEY` | Media server access |
| `AUTHENTIK_BASE_URL` / `AUTHENTIK_BOOTSTRAP_TOKEN` | Authentik API access |
| `AUTHENTIK_*` | Credentials and bootstrap settings for the bundled Authentik stack |
| `ACCOUNT_PORTAL_URL` | Authentik self-service user portal (password resets) |
| `REQUEST_URL` | Jellyseerr request portal (Premium perk) |
| `ADMIN_PASSWORD` / `SESSION_SECRET` | Admin panel auth + credential encryption |
| `REFERRAL_REWARD_PERCENT` | % of a referral's first payment credited (default 10) |
| `REFERRAL_COUPON_ID` | Optional Stripe coupon applied to referred signups |
| `AI_API_URL` / `AI_API_KEY` / `AI_MODEL` | OpenAI-compatible endpoint for AI features (optional) |
| `NPM_API_URL` / `NPM_API_IDENTITY` / `NPM_API_SECRET` | Nginx Proxy Manager credentials |
| `DOMAIN` / `NPM_DNS_PROVIDER` / `NPM_DNS_EMAIL` / `NPM_DNS_CREDENTIALS` | Wildcard cert (DNS challenge) |
| `NPM_HOSTS_JSON` | Optional override for the subdomain → backend map |

> `SESSION_SECRET` encrypts generated passwords at rest. If you change it after
> users sign up, stored passwords can no longer be decrypted.

### Authentik mode

Magnate consumes the shared external Authentik service by default. Configure
`AUTHENTIK_BASE_URL` and `AUTHENTIK_BOOTSTRAP_TOKEN` for that instance. The
bundled Authentik server, PostgreSQL, Redis, and worker are a local replacement,
not a required dependency:

```bash
AUTHENTIK_MODE=local docker compose --profile authentik up -d
```

Do not enable the local profile when another Innotel stack already owns the
identity service.


1. **Plans** — open `/admin` after logging in and **Save** the seeded plans.
   The server creates a Stripe Product + recurring Prices automatically.
2. **Webhook** — `https://app.magnate.innotel.us/api/webhook`, subscribed to
   `checkout.session.completed`, `customer.subscription.updated`,
   `customer.subscription.deleted`, `invoice.payment_succeeded`,
   `invoice.payment_failed`. Copy the signing secret into
   `STRIPE_WEBHOOK_SECRET`.
3. **Referral coupon (optional)** — create a coupon in the Stripe dashboard
   (e.g. `FRIENDS20`) and set `REFERRAL_COUPON_ID`.

Local testing: `stripe listen --forward-to localhost:3000/api/webhook`.

## How the signup flow works

1. Visitor picks a plan; Stripe Checkout is created (referral codes and
   coupons applied server-side).
2. `checkout.session.completed` provisions the Authentik account with a
   generated password, records the Stripe customer/subscription, credits the
   referrer, and duration-based billing starts.
3. The success page reveals the credentials once and shows the subscriber's
   own referral link.
4. `customer.subscription.deleted` → Authentik user set inactive → LDAP login
   blocked immediately (enforced by Magnate itself); re-subscribing is instant.
5. `invoice.payment_failed` flags the user for the churn queue; a later success
   resets the counters and records revenue in the analytics ledger.

## Admin panel (`/admin`)

- **Dashboard** — config status, plans CRUD, users (reveal credentials,
  enable/disable, re-provision, delete), settings, backup/restore.
- **Analytics** — MRR, active/pending/past-due/unpaid subscribers, 30-day
  revenue & signup charts, plan breakdown, churn rate, recent signups, and the
  **churn prevention queue** (risk-scored users with winback-offer + AI
  watchlist actions).
- **Tenants** — create/edit branded instances with their own domains, tagline,
  description and footer note (white-label). Requests are matched by Host
  header and fall back to the Magnate tenant.

## AI recommendations & churn prevention

Point the app at any OpenAI-compatible chat-completions API:

```bash
AI_API_URL=https://api.openai.com/v1   # or a compatible provider/self-host
AI_API_KEY=sk-...
AI_MODEL=gpt-4o-mini
```

In the **Analytics** page, choose a user → **AI watchlist** to generate a
curated "watch next" list from their Jellyfin viewing history. The
**Winback offer** button creates a discounted Stripe payment session for
at-risk subscribers (past-due/failed payments) so they can recover their
subscription instead of churning.

## Affiliate & referral program

- Every user gets a referral code at signup (`/?ref=CODE`).
- When a referred visitor subscribes, the referrer earns
  `REFERRAL_REWARD_PERCENT` of the first payment (Stripe customer balance
  credit — applied automatically to their next invoice).
- Referred signups can get a first-invoice discount via `REFERRAL_COUPON_ID`.
- The success page shows the new subscriber's shareable link; the admin
  analytics show referral-driven growth over time.

## Multi-tenant & white-label

Tenants are branded instances bound to domain lists. The seeded `magnate`
tenant owns the platform domains; additional tenants (e.g. a creator's own
storefront) render their own name, tagline, description and footer note across
the nav, footer, hero/about sections, admin login and page metadata. Manage
them from `/admin/tenants`.

## Releases & artifacts

Every `v*` tag triggers the **Release** workflow:

1. Builds and publishes `ghcr.io/innotelinc/magnate-subscription-platform`
   (tags: `vX.Y.Z`, `X.Y.Z`, `X.Y`, `latest` for stable).
2. Exports a single-platform image tarball and publishes a **GitHub Release**
   with `magnate-subscription-platform-<version>.tar.gz` + `SHA256SUMS` for
   offline deploys:

```bash
echo YOUR_GH_PAT | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
docker pull ghcr.io/innotelinc/magnate-subscription-platform:v2.0.0
```

The GHCR package name follows the repository name. If you rename this
repository, update the `images:` value in `.github/workflows/release.yml` and
the pull commands above to match.

## Project structure

```
app/                  Pages (landing, signup, success, cancel, manage, admin, analytics, tenants)
app/api/              Route handlers (checkout, webhook, claim, manage, admin CRUD, referral, AI)
components/           React components (pricing, forms, dashboards, icons)
lib/                  db, stripe, authentik, analytics, referrals, ai, tenant, crypto, auth, plans
scripts/              npm-proxy-hosts.py (NPM API provisioning) — used by setup.sh
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

### Wildcard certificate stays in "processing" state

Check that the DNS provider credentials in `NPM_DNS_CREDENTIALS` are valid and
that the account e-mail (`NPM_DNS_EMAIL`) is the one registered with the
provider. NPM performs the DNS challenge itself — no manual TXT record
creation is needed (except for split-horizon setups).

### TLS & DNS — Cerulean (TrustOps)

In the Innotel Platform Stack deployment, TLS for every `magnate.innotel.us`
host is one **Cerulean-issued wildcard Let's Encrypt certificate**
(`*.magnate.innotel.us` + apex, DNS-01 against the shared BIND), exported into
Nginx Proxy Manager as `cerulean-magnate.innotel.us-wildcard` and attached to
every proxy host — renewals refresh the same NPM certificate in place. DNS
records are CNAMEs to the apex in the shared `innotel.us` BIND zone, managed
through Cerulean. The per-host `NPM_DNS_CREDENTIALS` flow above is only for
standalone deployments outside the stack.

## 🏛️ Platform stack

Magnate is the ecosystem's **RevenueOps** platform — subscriptions, billing, entitlements, and revenue analytics in the
[**Innotel Platform Stack**](https://github.com/innotelinc/innotel-platform-stack) — the
canonical single-responsibility architecture where Authentik owns identity, Infisical owns
secrets, Cerulean owns trust, ONYX owns storage, Magnate owns revenue, NPM Edge owns the edge, and every other
platform is a business function that consumes them. See
[docs/stack.md](docs/stack.md) for this platform's owns/consumes boundaries and its
Infisical secret setup.
