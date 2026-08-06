#!/bin/sh
set -e

# /app/data is a bind mount from the host (./data). On a fresh checkout or
# new deployment the host directory is owned by root, but the app runs as the
# non-root `nextjs` user (uid/gid 1001) and must be able to create and open the
# SQLite database there. Bind mounts override the chown done in the Dockerfile,
# so fix ownership here at startup before dropping privileges.
if [ "$(id -u)" = "0" ]; then
  mkdir -p /app/data
  chown -R nextjs:nodejs /app/data
  exec setpriv --reuid=1001 --regid=1001 --init-groups "$@"
fi

exec "$@"
