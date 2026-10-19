#!/usr/bin/env bash
#
# verify-admin-keys.sh — prove the standing admin keys are what they claim to be.
#
# A standing admin key is the credential that lets a pipeline create or re-price a
# plan without `BREAKGLASS_LOGIN` and without anybody at a browser. What makes it
# worth having is a set of properties that are easy to lose in a later refactor and
# impossible to see by reading the route: the token is shown once and only its hash
# is stored, it works with break-glass off, it is an admin, it is *not* a way to
# change the admin password, and revoking it is immediate.
#
# So this starts its own throwaway instance — never a real deployment — with a
# scratch database, and drives all of it end to end over HTTP:
#
#   1. with break-glass on, sign in and mint a key; assert the database holds the
#      token's SHA-256 and no copy of the token itself;
#   2. restart the same instance with break-glass OFF — the normal posture — and
#      use the key to read *and write* the catalog, which is the whole point;
#   3. confirm what it must not do (change the admin password), that a wrong key is
#      refused, and that revoke, including a key revoking itself, kills it at once.
#
# Exit codes: 0 = pass, 1 = a check failed, 2 = cannot run (no docker, no image).
#
# Config (environment):
#
#   MAGNATE_KEYS_IMAGE      image to run       (default magnate-magnate:latest)
#   MAGNATE_KEYS_PORT       host port          (default 3999, loopback only)
#   MAGNATE_KEYS_PASSWORD   break-glass password the instance is started with
#
# Usage:
#     bash scripts/verify-admin-keys.sh
#
set -uo pipefail

IMAGE="${MAGNATE_KEYS_IMAGE:-magnate-magnate:latest}"
PORT="${MAGNATE_KEYS_PORT:-3999}"
PASS="${MAGNATE_KEYS_PASSWORD:-breakglass-test}"
B="http://127.0.0.1:${PORT}"
CONTAINER="magnate-verify-keys"

OK="  OK  "
BAD="  BAD "

SCRATCH="$(mktemp -d "${TMPDIR:-/tmp}/magnate-keys-verify.XXXXXX")"
DATA="$SCRATCH/data"
mkdir -p "$DATA"
fail=0

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  rm -rf "$SCRATCH"
}
trap cleanup EXIT

ok()  { printf '%s%s\n' "$OK" "$1"; }
bad() { printf '%s%s\n' "$BAD" "$1"; fail=$((fail + 1)); }
expect() { [ "$2" = "$3" ] && ok "$1 ($3)" || bad "$1 — wanted $2, got $3"; }
req() { local out="$1"; shift; curl -s -o "$out" -w '%{http_code}' "$@"; }

# The two http codes a check is not about: nothing listening yet.
start() { # start <break-glass 0|1>
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  docker run -d --name "$CONTAINER" -p "127.0.0.1:${PORT}:3000" \
    -e DATABASE_PATH=/app/data/magnate.db \
    -e BREAKGLASS_LOGIN="$1" -e ADMIN_PASSWORD="$PASS" \
    -e SESSION_SECRET="$(openssl rand -hex 32)" -e APP_URL="$B" \
    -v "$DATA:/app/data" "$IMAGE" >/dev/null || return 1
  for _ in $(seq 1 40); do
    [ "$(curl -s -m 2 -o /dev/null -w '%{http_code}' "$B/" 2>/dev/null || true)" = "200" ] && return 0
    sleep 1
  done
  return 1
}

command -v docker >/dev/null 2>&1 || { echo "SKIP: no docker on this machine" >&2; exit 2; }
docker image inspect "$IMAGE" >/dev/null 2>&1 \
  || { echo "SKIP: no $IMAGE — build it first (docker compose build)" >&2; exit 2; }

echo "magnate standing admin keys — $IMAGE on $B"
echo

echo "1. mint a key while break-glass is on"
start 1 || { bad "the throwaway instance never came up"; echo; echo "1 CHECK FAILED"; exit 1; }
expect "break-glass sign-in" 200 "$(req "$SCRATCH/login.out" -c "$SCRATCH/cj" \
  -X POST "$B/api/admin/login" -H 'content-type: application/json' \
  -d "$(python3 -c 'import json,sys; print(json.dumps({"password": sys.argv[1]}))' "$PASS")")"
expect "mint" 200 "$(req "$SCRATCH/mint.json" -b "$SCRATCH/cj" -X POST "$B/api/admin/keys" \
  -H 'content-type: application/json' -d '{"name":"catalog automation"}')"

TOKEN="$(python3 -c 'import json;print(json.load(open("'"$SCRATCH"'/mint.json")).get("token",""))' 2>/dev/null)"
KEYID="$(python3 -c 'import json;print(json.load(open("'"$SCRATCH"'/mint.json"))["key"]["id"])' 2>/dev/null)"
[ -n "$TOKEN" ] && [ -n "$KEYID" ] && ok "the mint returned a token (id $KEYID)" || bad "no token in the mint response"
case "$TOKEN" in mag_admin_*) ok "the token names itself (mag_admin_…)";; *) bad "unexpected token shape";; esac
if python3 - "$DATA/magnate.db" "$TOKEN" <<'PY'
import hashlib, sqlite3, sys
path, token = sys.argv[1], sys.argv[2]
raw = open(path, "rb").read()
row = sqlite3.connect(path).execute("SELECT token_hash FROM admin_api_keys").fetchone()
hashed = bool(row) and row[0] == hashlib.sha256(token.encode()).hexdigest()
sys.exit(0 if hashed and token.encode() not in raw else 1)
PY
then ok "the row holds the token's SHA-256, and the database holds no copy of the token"
else bad "what is stored is not just the token's SHA-256"; fi
expect "list" 200 "$(req "$SCRATCH/list.json" -b "$SCRATCH/cj" "$B/api/admin/keys")"
python3 -c 'import json,sys; ks=json.load(open(sys.argv[1]))["keys"]; sys.exit(0 if ks and ks[0]["last_used_at"] is None else 1)' \
  "$SCRATCH/list.json" && ok "the key is listed, never used" || bad "the list does not show the new key as unused"

echo
echo "2. use it with break-glass off — the normal posture"
start 0 || { bad "the throwaway instance never came up"; echo; echo "1 CHECK FAILED"; exit 1; }
expect "the password path is closed again" 403 "$(req /dev/null -X POST "$B/api/admin/login" \
  -H 'content-type: application/json' \
  -d "$(python3 -c 'import json,sys; print(json.dumps({"password": sys.argv[1]}))' "$PASS")")"
expect "no credential" 401 "$(req /dev/null "$B/api/admin/plans")"
expect "a key that was never minted" 401 "$(req /dev/null -H 'Authorization: Bearer mag_admin_nope' "$B/api/admin/plans")"
expect "the key reads the catalog" 200 "$(req "$SCRATCH/read.json" -H "Authorization: Bearer $TOKEN" "$B/api/admin/plans")"
expect "the key writes the catalog" 200 "$(req "$SCRATCH/write.json" -H "Authorization: Bearer $TOKEN" \
  -X POST "$B/api/admin/plans" -H 'content-type: application/json' -d '{
    "name":"Keywork","slug":"keywork","description":"created by a key, with break-glass off",
    "priceMonthlyCents":0,"priceYearlyCents":0,"billingUnit":"seat","pricePerUnitCents":500,
    "features":["made by automation"],"highlighted":false,"addon":true,"active":true,
    "sortOrder":50,"service":"atlas"}')"
python3 -c 'import json,sys; p=json.load(open(sys.argv[1]))["plan"]; sys.exit(0 if p["billingUnit"]=="seat" and p["perUnit"] else 1)' \
  "$SCRATCH/write.json" \
  && ok "the plan it created is a per-unit one, price and all" \
  || bad "the plan it created is not per-unit"
expect "changing the admin password is not a key's job" 401 "$(req /dev/null -H "Authorization: Bearer $TOKEN" \
  -X POST "$B/api/admin/password" -H 'content-type: application/json' \
  -d '{"currentPassword":"x","newPassword":"new-password-123"}')"
expect "the key lists keys" 200 "$(req "$SCRATCH/list2.json" -H "Authorization: Bearer $TOKEN" "$B/api/admin/keys")"
python3 -c 'import json,sys; ks=json.load(open(sys.argv[1]))["keys"]; sys.exit(0 if ks[0]["last_used_at"] else 1)' \
  "$SCRATCH/list2.json" && ok "the key's use is recorded" || bad "last_used_at was not recorded"
# Rotation without a person: a key mints its replacement, so the succession never
# needs break-glass again.
expect "the key mints its own successor" 200 "$(req "$SCRATCH/mint2.json" -H "Authorization: Bearer $TOKEN" \
  -X POST "$B/api/admin/keys" -H 'content-type: application/json' -d '{"name":"rotation"}')"
TOKEN2="$(python3 -c 'import json;print(json.load(open("'"$SCRATCH"'/mint2.json")).get("token",""))' 2>/dev/null)"
KEYID2="$(python3 -c 'import json;print(json.load(open("'"$SCRATCH"'/mint2.json"))["key"]["id"])' 2>/dev/null)"
[ -n "$TOKEN2" ] && ok "the successor works as a credential" || bad "no successor token"

echo
echo "3. revoke it, and check it is dead"
expect "revoke (a key can revoke itself)" 200 "$(req /dev/null -H "Authorization: Bearer $TOKEN" \
  -X DELETE "$B/api/admin/keys/$KEYID")"
expect "the revoked key is dead" 401 "$(req /dev/null -H "Authorization: Bearer $TOKEN" "$B/api/admin/plans")"
# Revoking twice is asked with a *live* credential, because the revoked one can no
# longer authenticate — so the idempotent answer has to come from the successor.
expect "revoking an already-revoked key says so" 404 "$(req /dev/null -H "Authorization: Bearer $TOKEN2" \
  -X DELETE "$B/api/admin/keys/$KEYID")"
expect "the successor is live" 200 "$(req /dev/null -H "Authorization: Bearer $TOKEN2" "$B/api/admin/plans")"
expect "the successor revokes itself" 200 "$(req /dev/null -H "Authorization: Bearer $TOKEN2" \
  -X DELETE "$B/api/admin/keys/$KEYID2")"
expect "and then it is dead too" 401 "$(req /dev/null -H "Authorization: Bearer $TOKEN2" "$B/api/admin/plans")"
python3 - "$DATA/magnate.db" <<'PY' \
  && ok "the row is kept and marked revoked, so the list still says it existed" \
  || bad "the revoked key was not recorded"
import sqlite3, sys
row = sqlite3.connect(sys.argv[1]).execute("SELECT revoked_at FROM admin_api_keys").fetchone()
sys.exit(0 if row and row[0] else 1)
PY

echo
[ "$fail" -eq 0 ] && echo "ALL CHECKS PASSED" || echo "$fail CHECK(S) FAILED"
[ "$fail" -eq 0 ] || exit 1
