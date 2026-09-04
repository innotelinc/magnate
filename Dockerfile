FROM node:22-slim AS deps
WORKDIR /app
# better-sqlite3 is a native module: node-gyp needs Python + a C++ toolchain to
# compile it when no prebuilt binary is available.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Cap the JS heap so `next build` cannot OOM-kill the build on memory-shared hosts.
ENV NODE_OPTIONS=--max-old-space-size=3072
RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV DATABASE_PATH=/app/data/magnate.db

RUN mkdir -p /app/data && chown node:node /app/data

COPY --from=builder /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

# The entrypoint (running as root) fixes ownership of the ./data bind mount
# for the non-root node user, then drops privileges before starting the app.
COPY --chown=root:root docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

USER root
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
EXPOSE 3000
CMD ["node", "server.js"]
