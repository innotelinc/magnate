#!/bin/sh
set -e

# /app/data is a bind mount from the host (./data). On a fresh checkout or
# new deployment the host directory is owned by root, but the app runs as the
# non-root `node` user (uid/gid 1000) and must be able to create and open the
# SQLite database there. Bind mounts override the chown done in the Dockerfile,
# so fix ownership here at startup before dropping privileges.
if [ "$(id -u)" = "0" ]; then
  mkdir -p /app/data
  chown -R node:node /app/data
  # ── SecretOps (Cerulean Vault) — boot-time reference resolution ───────
  # .env values may be `vault://<mount>/<path>#<key>` references (the same
  # grammar Cerulean/Onyx/Zeus resolve, docs/stack.md). Resolve them BEFORE
  # boot so every consumer reads the plain value from process.env. Plain
  # values are left untouched; a reference that cannot be resolved aborts
  # the container instead of booting with a literal `vault://` value.
  #
  # Runs as root so a token file under /app/data is readable regardless of
  # which user wrote it; the exports survive the privilege drop below.
  # VAULT_* env (see .env.example):
  #   VAULT_ADDR / VAULT_TOKEN (or VAULT_TOKEN_FILE) / VAULT_PREFIX /
  #   VAULT_NAMESPACE / VAULT_SKIP_VERIFY / VAULT_CACERT
  VAULT_KEYS="STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET STRIPE_CURRENCY"
  VAULT_EXPORTS="$(node /usr/local/bin/vault-env.mjs $VAULT_KEYS)" || {
    echo "!!! vault-env resolution failed — refusing to boot with unresolved vault:// refs" >&2
    exit 1
  }
  # shellcheck disable=SC2086
  eval "$VAULT_EXPORTS"
  export STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET STRIPE_CURRENCY
  exec setpriv --reuid=1000 --regid=1000 --init-groups --inh-caps=-all "$@"
fi

exec "$@"
