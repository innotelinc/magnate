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


## Secrets (Cerulean Vault)

The platform's SecretOps is **Cerulean Vault** — HashiCorp Vault, KV v2, hosted by
Cerulean — with `vault://<mount>/<path>#<key>` references in `.env`.

### Legacy: the Infisical profile

This stack currently still imports its credentials into an **Infisical** workspace and
derives `.env` from it. Enable it with:

```bash
# generate the required keys and add them to .env
openssl rand -base64 32   # INFISICAL_ENCRYPTION_KEY
openssl rand -hex 16      # INFISICAL_AUTH_SECRET
openssl rand -hex 16      # INFISICAL_DB_PASSWORD

# start the profile and provision the workspace + import .env secrets
docker compose -f docker-compose.yml -f compose.infisical.yml --profile infisical up -d
bash scripts/infisical-setup.sh
```

See [compose.infisical.yml](../compose.infisical.yml) and
[scripts/infisical-setup.py](../scripts/infisical-setup.py) for details.

## Golden rules

- **Authentik = Identity** · **Cerulean Vault = Secrets** · **Cerulean = Trust** ·
  **ONYX = Storage** · **Magnate = Revenue** · **NPM Edge = Edge** — everything else is a business function.
- No platform duplicates another's responsibility.
- No credit in commits, footers, or headers to anyone but the project owner.

---

*Magnate · RevenueOps · [Innotel Platform Stack](https://github.com/innotelinc/innotel-platform-stack)*
