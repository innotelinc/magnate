#!/usr/bin/env bash
#
# setup.sh — Magnate · Subscription Platform one-shot deploy.
#
# 1. Checks the host prerequisites (docker, compose, python3).
# 2. Creates .env from .env.sample when missing.
# 3. Builds & starts the Magnate app container.
# 4. Waits for the app to answer on :3000.
# 5. Provisions Nginx Proxy Manager proxy hosts + wildcard SSL (via
#    scripts/npm-proxy-hosts.py) for app/api/auth/media/billing/admin.<DOMAIN>.
#
# Prereqs on the same host (or reachable network):
#   - Nginx Proxy Manager (NPM) running with an admin login for the API
#   - Authentik, Jellyfin and the ARR stack's billing-api with published
#     ports (defaults below are overridable through NPM_HOSTS_JSON)
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

# ------------------------------------------------------------- app

log "building and starting the Magnate container…"
docker compose up -d --build

log "waiting for the app on http://localhost:3000 …"
for _ in $(seq 1 30); do
  if curl -fsS -o /dev/null http://localhost:3000 2>/dev/null; then
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
   https://api.magnate.innotel.us      ARR stack billing-api
   https://auth.magnate.innotel.us     Authentik
   https://media.magnate.innotel.us    Jellyfin
   https://billing.magnate.innotel.us  billing / Stripe portal UI
   https://admin.magnate.innotel.us    admin panel

 DNS: point each subdomain (and *.DOMAIN) as an A record at the
 Nginx Proxy Manager host's public IP. Certificates are issued
 automatically by Let's Encrypt via the DNS challenge and renew
 themselves.
────────────────────────────────────────────────────────────────
EOF