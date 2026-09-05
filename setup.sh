#!/usr/bin/env bash
#
# setup.sh — Magnate · Subscription Platform one-shot deploy.
#
# 1. Checks the host prerequisites (docker, compose, python3).
# 2. Creates .env from .env.sample when missing.
# 3. Builds & starts the Magnate app container.
# 4. Waits for the app to answer on ${MAGNATE_PORT:-3000}.
# 5. Provisions Nginx Proxy Manager proxy hosts + wildcard SSL (via
#    scripts/npm-proxy-hosts.py) for app/api/auth/media/billing/admin.<DOMAIN>.
#
# Prereqs on the same host (or reachable network):
#   - Nginx Proxy Manager (NPM) running with an admin login for the API
#   - Jellyfin with published ports (defaults below are overridable through
#     NPM_HOSTS_JSON)
#   - Authentik is included in docker-compose.yml and is published on host
#     port 9110 by default.
#   - DNS wildcard records pointing each subdomain at the NPM host
#
# Usage:  ./setup.sh
set -euo pipefail

cd "$(dirname "$0")"

log()  { printf '\033[1;36m[magnate]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[magnate]\033[0m warning: %s\n' "$*"; }
die()  { printf '\033[1;31m[magnate]\033[0m %s\n' "$*" >&2; exit 1; }

# Enable the version-controlled commit-guard hooks (.githooks) if this is a
# git checkout (blocks attribution to anyone but Darnel Hunter).
if [ -d .githooks ] && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git config core.hooksPath .githooks
  log "commit guard hook enabled (core.hooksPath -> .githooks)"
fi

# ------------------------------------------------------------- prereqs

command -v docker >/dev/null 2>&1 || die "docker is required (https://docs.docker.com/engine/install/)"
docker compose version >/dev/null 2>&1 || die "docker compose plugin is required"
command -v python3 >/dev/null 2>&1 || die "python3 is required (stdlib-only script)"

# ------------------------------------------------------------- .env

if [[ ! -f .env ]]; then
  cp .env.sample .env
  warn "created .env from .env.sample — open it and fill in the real values, then re-run ./setup.sh"
  die "edit .env first (Stripe keys, Authentik token, ADMIN_PASSWORD, NPM credentials), then re-run ./setup.sh"
fi

# Load .env into the environment for compose + the python provisioner.
set -a
# shellcheck disable=SC1091
source .env
set +a

[[ -n "${DOMAIN:-}" ]] || warn "DOMAIN is unset in .env — NPM provisioning may fail"
[[ -n "${APP_URL:-}" ]] || warn "APP_URL is unset in .env"
MAGNATE_PORT="${MAGNATE_PORT:-3000}"

# ------------------------------------------------------------- app

log "building and starting the Magnate container…"
docker compose up -d --build

log "waiting for the app on http://localhost:${MAGNATE_PORT} …"
for _ in $(seq 1 30); do
  if curl -fsS -o /dev/null "http://localhost:${MAGNATE_PORT}" 2>/dev/null; then
    log "app is up."
    break
  fi
  sleep 2
done

# ------------------------------------------------------------- NPM

log "provisioning Nginx Proxy Manager hosts + wildcard SSL…"
python3 scripts/npm-proxy-hosts.py

# ------------------------------------------------------------- done

cat <<'EOF'

────────────────────────────────────────────────────────────────
 Magnate is deployed. Now visit:

   https://app.magnate.innotel.us      storefront (this app)
   https://auth.magnate.innotel.us     Authentik
   https://media.magnate.innotel.us    Jellyfin
   https://billing.magnate.innotel.us  billing / Stripe portal UI
   https://admin.magnate.innotel.us    admin panel

 DNS: every subdomain (and *.DOMAIN) is a CNAME to the apex in the shared
 innotel.us BIND zone, managed through Cerulean (TrustOps). TLS is one
 Cerulean-issued wildcard Let's Encrypt certificate (*.magnate.innotel.us
 + apex) exported into Nginx Proxy Manager and auto-renewed — NPM never
 requests per-host certs for these names.
────────────────────────────────────────────────────────────────
EOF
# ── Infisical (SecretOps) — opt-in secret provisioning ──────────────
# Secrets for the Innotel Platform Stack live in Infisical. Enable by
# setting INFISICAL_ADMIN_EMAIL / INFISICAL_ADMIN_PASSWORD and the
# INFISICAL_* keys in .env, then re-run setup (idempotent).
if grep -qE '^INFISICAL_ADMIN_EMAIL=.+' .env 2>/dev/null && \
   grep -qE '^INFISICAL_ADMIN_PASSWORD=.+' .env 2>/dev/null; then
  __root="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd)"
  case "$__root" in
    */scripts) __root="$(dirname "$__root")" ;;
  esac
  if [ -f "$__root/scripts/infisical-setup.sh" ]; then
    echo ">> provisioning secrets into Infisical (SecretOps)..."
    bash "$__root/scripts/infisical-setup.sh" \
      || echo "!! infisical setup failed (see above); .env values remain valid" >&2
  fi
  unset __root
fi
