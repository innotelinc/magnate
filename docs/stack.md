# 💎 Magnate — Platform Stack Role

**Classification: RevenueOps**

Subscriptions, billing, and entitlements for the whole ecosystem: plans, Stripe billing, revenue analytics, and usage metering.

This page declares Magnate's role in the
[**Innotel Platform Stack**](https://github.com/innotelinc/innotel-platform-stack) —
the canonical single-responsibility architecture. The stack is defined in exactly one
place; this page links each product to it and states what this platform owns, consumes,
provides, and explicitly does not own.

## Owns

- Subscriptions
- Plans
- Billing
- Invoices
- Payments
- Revenue analytics
- Coupons
- Trials
- Entitlements
- Customer accounts
- Usage metering
- One-off purchases (cash-shop Checkout for consuming platforms, signed
  fulfillment webhook)

## Provides

- Billing APIs to Monarch, Zeus, Oasis, Signara, Cerulean, Capstone, and Rizz Aura

## Consumes

- Authentik — accounts, SSO, access groups
- Cerulean Vault — Stripe keys, webhook secrets, OAuth secrets
- NPM Edge — public routing, TLS termination at the edge

## Explicitly does NOT own

- Identity (Authentik)
- Media (Monarch)
- Storage (ONYX)

## Roadmap — where Magnate stands (17 September 2026)

**Live and verified on the deployment:**

- [x] **The ecosystem's subscribing page** — `subscribe.innotel.us` is the landing
      and subscribing surface; Monarch's own subscribe hosts are retired in its
      favour and its links are CI-checked to point here.
- [x] **Entitlement decisions consumed estate-wide** — Distro (`/api/entitlements`
      proxy + gated quotas), Monarch (plan → Jellyfin playback policy via
      `magnate-entitlements.py`), Capstone and Zeus (agents as a SKU).
- [x] **Authentik-first accounts** — passwords live in Cerulean Authentik, never
      in Magnate's app database; the shared `ENTITLEMENTS_API_TOKEN` gates the
      server-to-server entitlement and purchase APIs.
- [x] **Checkout, plans and admin panel** — Stripe Checkout sessions, plan
      auto-seed on boot, coupon/trial support, referral credit, and the `/admin`
      console for per-user entitlements and analytics.

**Open, in priority order:**

1. **Entitlement depth for Monarch** — profile limits stay advisory because
      Jellyfin has no per-user profile cap; enforce profile counts here (or at
      the Authentik group level) rather than leaving them advisory.
2. **Distro per-user entitlements polish** — the console shows entitlements per
      user today; a purchase link that deep-links the plan being upgraded (not
      just the checkout page) is the missing UX step.
3. **Usage metering as a first-class surface** — metering is owned but consumed
      platforms still self-report; pulling usage from Distro's gateway ledger
      would make revenue analytics authoritative rather than reported.
4. **Webhook delivery evidence** — the signed fulfillment webhook has retry
      semantics; a delivery log visible in `/admin` would make failed
      fulfillments an operational queue instead of a surprise.


## Secrets (Cerulean Vault)

The platform's SecretOps is **Cerulean Vault** — HashiCorp Vault, KV v2, hosted by
Cerulean — with `vault://<mount>/<path>#<key>` references in `.env`.

Cerulean mints this stack's **path-scoped** token (its policy covers only
`cerulean/data/magnate`, never a sibling's secrets) and renews it in place. Copy
it to `./data/vault/token/magnate.token`, then move any plaintext values across:

```bash
VAULT_ADDR=http://<cerulean-host>:8200 \
  VAULT_TOKEN_FILE=./data/vault/token/magnate.token \
  VAULT_PREFIX=cerulean VAULT_PATH=magnate \
  python3 scripts/vault-migrate.py --from-env-file .env \
    --keys STRIPE_SECRET_KEY,SESSION_SECRET
```

`vault-migrate.py` never prints a value, unions with whatever is already at the
path (so a re-run is a no-op, not an overwrite), and accepts either `.env` or a
legacy Infisical workspace as its source.

A `vault://` value is the platform's reference *form*; it is resolved by whichever
layer consumes it (ONYX's Go services, Distro's Node control plane, Zeus at boot,
Atlas at setup). This repo has no resolver, so `.env` must hold the resolved
value — a reference left in place reaches the container as a literal string.

## Golden rules

- **Authentik = Identity** · **Cerulean Vault = Secrets** · **Cerulean = Trust** ·
  **ONYX = Storage** · **Magnate = Revenue** · **NPM Edge = Edge** — everything else is a business function.
- No platform duplicates another's responsibility.
- No credit in commits, footers, or headers to anyone but the project owner.

---

*Magnate · RevenueOps · [Innotel Platform Stack](https://github.com/innotelinc/innotel-platform-stack)*

### Revenue → access + Vault-resolved Stripe keys (2026-09-18)

The Stripe webhook now manages paid-tier Authentik groups: subscribers land
in the plan's group on checkout, leave it on cancellation/past-due, and are
re-added on return to good standing. Plans carry an optional
`authentik_group` override; `PAID_GROUPS` names the default tier(s).
`STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` resolve from Cerulean Vault at
boot (`vault://cerulean/magnate/stripe#…`, standalone resolver in the
entrypoint) — the checkout never holds secrets it does not have to.
