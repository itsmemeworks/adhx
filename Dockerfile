# syntax=docker/dockerfile:1

# Shared Node + pnpm toolchain. Keep this version aligned with packageManager.
FROM node:24-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

# Install dependencies separately so source-only changes reuse this layer.
FROM base AS deps
# Install build dependencies for better-sqlite3
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# Build the application with the lockfile-resolved toolchain.
FROM deps AS builder
ARG SENTRY_RELEASE
COPY . .
RUN pnpm run build

# Retain only runtime dependencies. tsx is a production dependency because
# migrations and deployed maintenance scripts execute TypeScript at runtime.
FROM deps AS prod-deps
RUN pnpm prune --prod

# Assemble runtime files once so the final image does not duplicate the
# standalone dependency subset and the complete production node_modules tree.
FROM prod-deps AS runtime-files
WORKDIR /runtime
COPY --from=builder /app/.next/standalone ./
RUN rm -rf ./node_modules && cp -a /app/node_modules ./node_modules
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/src/lib ./src/lib
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/package.json /app/pnpm-lock.yaml ./

# Production stage - minimal runtime image
FROM base AS runner

# Install sqlite3 CLI and runtime dependencies
RUN apt-get update && apt-get install -y \
    libsqlite3-0 \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Re-declare ARG for runner stage
ARG SENTRY_RELEASE

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
# Make one-off `tsx` commands resolve the lockfile-installed project binary.
ENV PATH="/app/node_modules/.bin:$PATH"
# Pass Sentry release version to runtime
ENV SENTRY_RELEASE=${SENTRY_RELEASE}
# Default DB location inside the container. The app's own default
# (./data/adhdone.db, relative to /app) lives under a root-owned directory the
# non-root `nextjs` user below can't mkdir into — omitting DATABASE_PATH would
# crash-loop with EACCES. /data is created and chowned for nextjs below, and
# doubles as the mount point for a persistent volume. Override to point
# elsewhere (e.g. a different volume path).
ENV DATABASE_PATH=/data/adhx.db

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy the complete assembled runtime, including production dependencies and
# the whole lib tree for migrations + one-off scripts. Individual file
# COPYs missed new migrate.ts imports and took staging down (module-not-found
# before listen — Fly reports "never became reachable on 0.0.0.0:3000").
COPY --from=runtime-files --chown=nextjs:nodejs /runtime ./

# One-off maintenance scripts, run by hand against a deployed volume:
#   fly ssh console --app adhx -C "tsx /app/scripts/<name>.ts"

# Create data directory for SQLite (will be mounted as volume)
RUN mkdir -p /data && chown nextjs:nodejs /data

USER nextjs

EXPOSE 3000

# Run migrations with the project-local, lockfile-resolved tsx, then start.
CMD ["sh", "-c", "./node_modules/.bin/tsx src/lib/db/migrate.ts && node server.js"]
