#!/usr/bin/env python3
"""stripe-relink.py — point the database back at the Stripe objects it already has.

A Magnate database holds the only record of which Stripe Product and Prices a
plan bills against — `plans.stripe_product_id`, `stripe_price_monthly_id`,
`stripe_price_yearly_id`. Recreate the database (a fresh seed after a host move,
a backup restored from before a price change) and those three columns come back
NULL while the Products live on in Stripe, still tagged `metadata.plan_id` with
the row they belong to.

`syncPlanToStripe()` cannot see that. It creates a Product whenever the column
is empty, so the obvious repair doubles every product in the live account — and
the symptom that sends you looking is the one that looks like a code bug:

    click Subscribe -> fill the form -> "This plan isn't set up for billing yet."

This script repairs it the other way round. It asks Stripe what already exists,
matches it back to the plan row by `metadata.plan_id` and then by amount, and
fills in the NULL columns only. A plan whose Product is gone, or whose Price no
longer matches the amount the row advertises, is reported rather than guessed
at; `--create-missing` is the opt-in that creates those, and it lists what it is
about to create before it does.

What is never touched: a column that already holds an ID, and a Product that
names a different plan row (reported as a conflict). Prices an admin changed in
the master dashboard stay authoritative — a mismatch is a finding, not a thing
to overwrite.

Config (environment, falling back to this repo's .env, then to the running
container):

    MAGNATE_DB              path to the SQLite database
                            (default ./data/magnate.db)
    STRIPE_SECRET_KEY       secret key to talk to Stripe with; when unset the
                            key is read from the `magnate` container's env
    MAGNATE_CONTAINER       container to read the key from (default magnate)

Exit codes: 0 = every active plan is billable, 1 = something is still unlinked,
2 = cannot run (no key, no database).

Usage:
    python3 scripts/stripe-relink.py --check     # report only, change nothing
    python3 scripts/stripe-relink.py             # link what Stripe already has
    python3 scripts/stripe-relink.py --create-missing
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import sqlite3
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STRIPE_API = "https://api.stripe.com/v1"


# --------------------------------------------------------------------------- #
# configuration
# --------------------------------------------------------------------------- #

def env_file(path: Path) -> dict[str, str]:
    """Read a .env the way compose does — `KEY=value`, `#` comments, no magic."""
    values: dict[str, str] = {}
    try:
        text = path.read_text()
    except OSError:
        return values
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        values[key.strip()] = value.split(" #")[0].strip().strip('"').strip("'")
    return values


def docker_env(container: str, key: str) -> str | None:
    """Read one variable out of a running container, so the key need not be
    copied onto the host to repair a database that lives there."""
    try:
        out = subprocess.run(
            ["docker", "inspect", container, "--format",
             "{{range .Config.Env}}{{println .}}{{end}}"],
            capture_output=True, text=True, timeout=20,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    if out.returncode != 0:
        return None
    for line in out.stdout.splitlines():
        if line.startswith(key + "="):
            return line[len(key) + 1:].strip()
    return None


def stripe_key(env: dict[str, str]) -> str | None:
    key = os.environ.get("STRIPE_SECRET_KEY") or env.get("STRIPE_SECRET_KEY")
    if key:
        return key
    return docker_env(os.environ.get("MAGNATE_CONTAINER", "magnate"),
                      "STRIPE_SECRET_KEY")


# --------------------------------------------------------------------------- #
# Stripe
# --------------------------------------------------------------------------- #

class Stripe:
    def __init__(self, key: str) -> None:
        self.auth = "Basic " + base64.b64encode((key + ":").encode()).decode()

    def _call(self, method: str, path: str, data: dict | None = None):
        body = urllib.parse.urlencode(data).encode() if data else None
        req = urllib.request.Request(f"{STRIPE_API}/{path}", data=body, method=method)
        req.add_header("Authorization", self.auth)
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.load(resp)
        except urllib.error.HTTPError as err:
            payload = err.read().decode("utf-8", "replace")
            try:
                message = json.loads(payload)["error"]["message"]
            except Exception:
                message = payload[:200]
            raise StripeError(message) from None

    def get(self, path: str):
        return self._call("GET", path)

    def post(self, path: str, data: dict):
        return self._call("POST", path, data)

    def all(self, path: str, **params) -> list:
        """Every page of a list endpoint, so a 100-item account is never half-seen."""
        items: list = []
        query = urllib.parse.urlencode(params)
        while True:
            page = self.get(f"{path}?{query}" if query else path)
            items.extend(page["data"])
            if not page.get("has_more"):
                return items
            query = urllib.parse.urlencode({**params, "starting_after": items[-1]["id"]})


class StripeError(RuntimeError):
    pass


# --------------------------------------------------------------------------- #
# reporting
# --------------------------------------------------------------------------- #

OK, FIX, WARN, FAIL = "ok", "fix", "warn", "FAIL"
GLYPH = {OK: "  ok  ", FIX: " link ", WARN: " warn ", FAIL: " FAIL "}


class Report:
    def __init__(self) -> None:
        self.findings: list[tuple[str, str, str]] = []

    def add(self, level: str, plan: str, message: str) -> None:
        self.findings.append((level, plan, message))

    def show(self) -> None:
        width = max((len(p) for _, p, _ in self.findings), default=4)
        for level, plan, message in self.findings:
            print(f"  [{GLYPH[level]}] {plan:<{width}}  {message}")

    @property
    def failures(self) -> list[tuple[str, str, str]]:
        return [f for f in self.findings if f[0] == FAIL]

    @property
    def pending(self) -> list[tuple[str, str, str]]:
        """Links that exist to be made but have not been written yet."""
        return [f for f in self.findings if f[0] == FIX]


# --------------------------------------------------------------------------- #
# the repair
# --------------------------------------------------------------------------- #

def plans_from_db(path: Path) -> list[sqlite3.Row]:
    con = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    try:
        return list(con.execute(
            "SELECT id, name, slug, service, active, price_monthly_cents,"
            " price_yearly_cents, stripe_product_id, stripe_price_monthly_id,"
            " stripe_price_yearly_id FROM plans ORDER BY id"
        ))
    finally:
        con.close()


def live_products(api: Stripe) -> dict[str, dict]:
    return {p["id"]: p for p in api.all("products", limit=100)}


def product_prices(api: Stripe, product_id: str) -> list[dict]:
    return api.all("prices", limit=100, product=product_id)


def match_price(prices: list[dict], interval: str, cents: int) -> dict | None:
    """The active price for an interval at exactly this amount.

    Amount is part of the match on purpose: a row whose price was edited after
    the database was recreated must NOT be re-linked to the old amount, or the
    checkout would charge the price from before the edit.
    """
    candidates = [
        p for p in prices
        if p["active"]
        and (p.get("recurring") or {}).get("interval") == interval
        and p["unit_amount"] == cents
    ]
    return candidates[0] if candidates else None


def relink(api: Stripe, db_path: Path, *, create_missing: bool,
           apply_changes: bool) -> Report:
    report = Report()
    plans = plans_from_db(db_path)
    products = live_products(api)

    with open(db_path, "a"):
        pass  # fail early, and legibly, if the database is not writable
    con = sqlite3.connect(db_path)
    updates: list[tuple[str, str, str, int]] = []

    for plan in plans:
        label = plan["slug"]
        if not plan["active"]:
            report.add(WARN, label, "inactive — not billed, left alone")
            continue

        # Which Stripe Product is this row's? A stored id wins; otherwise the
        # one Product tagged with this row's id.
        product = None
        if plan["stripe_product_id"]:
            product = products.get(plan["stripe_product_id"])
            if product is None:
                report.add(FAIL, label,
                           f"stored product {plan['stripe_product_id']} no longer "
                           "exists in Stripe")
                continue
        else:
            tagged = [p for p in products.values()
                      if (p.get("metadata") or {}).get("plan_id") == str(plan["id"])]
            if len(tagged) > 1:
                ids = ", ".join(p["id"] for p in tagged)
                report.add(FAIL, label, f"{len(tagged)} products claim plan_id="
                                        f"{plan['id']} ({ids}) — ambiguous, not linked")
                continue
            product = tagged[0] if tagged else None

        if product is None:
            if create_missing:
                if apply_changes:
                    product = api.post("products", {
                        "name": plan["name"],
                        "metadata[plan_id]": str(plan["id"]),
                    })
                    report.add(FIX, label, f"created product {product['id']}")
                else:
                    report.add(FIX, label, "would create a Stripe product")
            else:
                report.add(FAIL, label,
                           "no Stripe product tagged with this plan's id — "
                           "run with --create-missing once the price is right")
                continue
        else:
            owner = (product.get("metadata") or {}).get("plan_id")
            if owner not in (None, str(plan["id"])):
                report.add(FAIL, label,
                           f"product {product['id']} is tagged plan_id={owner}, "
                           f"not {plan['id']} — refusing to steal it")
                continue
            if plan["stripe_product_id"] != product["id"]:
                updates.append(("stripe_product_id", product["id"], "", plan["id"]))

        prices = product_prices(api, product["id"])

        for interval, column, cents in (
            ("month", "stripe_price_monthly_id", plan["price_monthly_cents"]),
            ("year", "stripe_price_yearly_id", plan["price_yearly_cents"]),
        ):
            stored = plan[column]
            if cents == 0 and not stored:
                report.add(OK, label, f"no {interval}ly price — not advertised")
                continue
            if stored:
                existing = next((p for p in prices if p["id"] == stored), None)
                if existing is None:
                    report.add(FAIL, label,
                               f"stored {interval}ly price {stored} is gone from Stripe")
                elif existing["unit_amount"] != cents:
                    report.add(WARN, label,
                               f"{interval}ly price is ${existing['unit_amount'] / 100:.2f} "
                               f"but the plan advertises ${cents / 100:.2f} — "
                               "re-price in the dashboard to move it")
                else:
                    report.add(OK, label,
                               f"{interval}ly {stored} (${cents / 100:.2f})")
                continue

            if cents == 0:
                continue

            found = match_price(prices, interval, cents)
            if found:
                updates.append((column, found["id"], "", plan["id"]))
                report.add(FIX, label,
                           f"{interval}ly ${cents / 100:.2f} -> existing {found['id']}")
            elif create_missing:
                if apply_changes:
                    data = {
                        "product": product["id"],
                        "currency": os.environ.get("STRIPE_CURRENCY", "usd"),
                        "unit_amount": str(cents),
                        "recurring[interval]": interval,
                        "metadata[plan_id]": str(plan["id"]),
                    }
                    created = api.post("prices", data)
                    updates.append((column, created["id"], "", plan["id"]))
                    report.add(FIX, label,
                               f"created {interval}ly price {created['id']} "
                               f"(${cents / 100:.2f})")
                else:
                    report.add(FIX, label,
                               f"would create a {interval}ly price "
                               f"(${cents / 100:.2f})")
            else:
                report.add(FAIL, label,
                           f"no active {interval}ly price at ${cents / 100:.2f} "
                           "on this product")

    if updates and apply_changes:
        columns = {"stripe_product_id", "stripe_price_monthly_id",
                   "stripe_price_yearly_id"}
        assert all(u[0] in columns for u in updates)
        with con:
            for column, value, _unused, plan_id in updates:
                con.execute(f"UPDATE plans SET {column} = ? WHERE id = ?",
                            (value, plan_id))
    con.close()
    return report


# --------------------------------------------------------------------------- #

def main() -> int:
    parser = argparse.ArgumentParser(
        description="Re-attach plans to the Stripe objects they already have.")
    parser.add_argument("--check", action="store_true",
                        help="report drift and change nothing")
    parser.add_argument("--create-missing", action="store_true",
                        help="create the Stripe product/prices a plan is missing "
                             "(nothing to reuse exists for it)")
    parser.add_argument("--db", default=os.environ.get("MAGNATE_DB"),
                        help="path to the SQLite database (default ./data/magnate.db)")
    args = parser.parse_args()

    apply_changes = not args.check
    env = env_file(ROOT / ".env")
    db_path = Path(args.db or env.get("MAGNATE_DB") or (ROOT / "data" / "magnate.db"))
    if not db_path.is_file():
        print(f"stripe-relink: no database at {db_path}", file=sys.stderr)
        return 2

    key = stripe_key(env)
    if not key:
        print("stripe-relink: STRIPE_SECRET_KEY is not set, and the magnate "
              "container did not provide one", file=sys.stderr)
        return 2

    mode = "check" if args.check else ("apply + create" if args.create_missing else "apply")
    print(f"stripe-relink [{mode}] {db_path}")
    report = relink(Stripe(key), db_path, create_missing=args.create_missing,
                    apply_changes=apply_changes)
    report.show()

    failures = report.failures
    pending = report.pending
    if failures:
        print(f"\n{len(failures)} plan(s) still unbillable.")
        return 1
    if args.check and pending:
        # Drift, reported and not repaired: a check has to fail on it, or a
        # monitoring job would call a broken checkout healthy.
        print(f"\n{len(pending)} link(s) available — re-run without --check to apply.")
        return 1
    print("\nEvery active plan resolves to a live Stripe price.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
