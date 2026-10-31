# Sage sessions

Sage is sold by the **session**, not by the seat and not by the month: one
OmniRoute API key, alive for fifteen minutes. Inside the window the buyer can use
it as many times as they like — one chat turn, a whole quiz, an essay with
revisions — and when the window closes the key is deleted on the gateway.

## What a purchase is

| | |
|---|---|
| Plans | `plans.service = 'sage'`, `billing_unit = 'session'`, price in `price_per_unit_cents` |
| Tiers | Trial `$3`, Standard `$9`, Intensive `$19` — the same 15 minutes, a different model budget |
| Funnel | `app/sage` → `POST /api/sage/checkout` (Stripe Checkout, `mode: "payment"`) |
| Deliverable | one gateway key per session bought, shown on `/success?kind=sage` |
| Never | sold as a subscription: `/api/checkout` refuses a `sage` plan |

The session's model budget is a share of what it cost — `SAGE_SPEND_SHARE` (40%)
in `lib/sage.ts` — sent to the gateway as `dailyUsageLimitUsd` when the key is
minted. Because the key is revoked when the window ends, the daily cap is in
practice the session cap.

## Lifecycle

1. **Buy.** Stripe Checkout, `mode: "payment"`, metadata `mag_sage_plan`,
   `mag_sage_sessions`, `mag_sage_email`. The price is inline `price_data` read
   from the plan, so a re-price in the master dashboard applies to the next
   checkout with nothing to sync.
2. **Mint.** `checkout.session.completed` → `mintSageSessions()`. One row per
   seat in `sage_sessions`, one `POST /api/keys` on the gateway per row, the key
   stored on the row. Idempotent on the unique `(stripe_session_id, seat)`: Stripe
   redelivers until the event is marked processed, and a replay must not spend a
   second key. A failure throws, so the event stays unprocessed and is retried.
3. **Use.** `GET /api/sage/sessions?session_id=…` returns the keys for that
   checkout while they are live. The success page polls it and shows the clock.
4. **Revoke.** `POST /api/sage/sweep` revokes every key whose `expires_at` has
   passed (`DELETE /api/keys/<id>`, falling back to the v1 revoke route), marks
   the row `expired`, and drops the key from the page. A revoke that fails leaves
   the row `active` with the reason in `error`, and the next sweep retries.

## Operations

Both of these live in `docker-compose.yml`, fed from `.env`:

```
# the dashboard credential on the gateway (vault:// ref, like the Stripe keys)
GATEWAY_ADMIN_PASSWORD="vault://cerulean/gateway#ADMIN_PASSWORD"
GATEWAY_URL=https://gateway.innotel.us
# what the cron presents; generate once, e.g. `openssl rand -hex 24`
SAGE_SWEEP_TOKEN=<hex>
SAGE_SESSION_MINUTES=15     # optional; 1–240, defaults to 15
```

The sweep needs a cron on the host, every two minutes:

```
# /etc/cron.d/magnate-sage-sweep
*/2 * * * * root curl -fsS -m 20 -X POST \
  -H "x-sage-sweep-token: $SAGE_SWEEP_TOKEN" \
  http://<magnate-address>:<MAGNATE_PORT>/api/sage/sweep >/dev/null
```

Without the cron the product still works: the success page sweeps lazily when it
sees a window that closed. The cron is what stops a key outliving its session for
a buyer who never reloads that page. Without `SAGE_SWEEP_TOKEN` the route refuses
everything (403) — it deletes credentials, so it is not open.

Check the wiring:

```
curl -s https://app.magnate.innotel.us/api/plans?service=sage | jq '.plans[] | {slug, pricePerUnitCents, billingUnit}'
```

Three plans with `billingUnit: "session"` and a per-session price mean the
catalog is right; a `404` on checkout means the plan is missing, and a 500
"sessions aren't priced yet" means `price_per_unit_cents` is zero.
