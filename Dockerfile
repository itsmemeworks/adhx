# syntax=docker/dockerfile:1

# Shared Node + pnpm toolchain. Keep this version aligned with packageManager.
FROM node:24-trixie-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.34.7 --activate

# Install dependencies separately so source-only changes reuse this layer.
FROM base AS deps
# Install build dependencies for better-sqlite3
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json pnpm-lock.yaml .npmrc ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# Build the application with the lockfile-resolved toolchain.
FROM deps AS builder
ARG SENTRY_RELEASE
# Public phone download destinations are compiled into the client bundle.
# Leave blank to use the source/build instructions; these are never secrets.
ARG NEXT_PUBLIC_IOS_APP_URL=""
ARG NEXT_PUBLIC_ANDROID_APP_URL=""
ENV NEXT_PUBLIC_IOS_APP_URL=${NEXT_PUBLIC_IOS_APP_URL}
ENV NEXT_PUBLIC_ANDROID_APP_URL=${NEXT_PUBLIC_ANDROID_APP_URL}
COPY . .
RUN pnpm run build

# Retain only runtime dependencies. tsx is a production dependency because
# migrations and deployed maintenance scripts execute TypeScript at runtime.
FROM deps AS prod-deps
# The prepare hook is Husky (a devDependency); pruning removes it before pnpm
# would rerun lifecycle scripts, so production pruning must not run hooks.
RUN pnpm prune --prod --ignore-scripts

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
# tsx reads the `@/` path alias from here when it runs the semantic child
# processes (src/lib/semantic/child.ts) at runtime.
COPY --from=builder /app/tsconfig.json ./

# Production stage - minimal runtime image
FROM node:24-trixie-slim AS runner

# Runtime only needs Node. Do not ship the build stage's pnpm/Corepack cache
# or npm's independent dependency graph; migrations use the local tsx binary.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
        /opt/yarn-* \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
        /usr/local/bin/pnpm /usr/local/bin/pnpx /usr/local/bin/yarn /usr/local/bin/yarnpkg

# Install sqlite3 CLI and runtime dependencies. Python runs yt-dlp, which
# downloads each saved post's media (see src/lib/keep).
RUN apt-get update && apt-get install -y --no-install-recommends \
    libsqlite3-0 \
    sqlite3 \
    python3 \
    python3-venv \
    ffmpeg \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# yt-dlp in its own virtualenv, pinned. Sites change often: bump this with
# each release, or update a running container with
#   /opt/yt-dlp/bin/pip install -U "yt-dlp[default]"
# [default] brings yt-dlp-ejs, the scripts YouTube's player challenges need
# (run with the container's Node: see src/lib/keep/ytdlp.ts).
ARG YTDLP_VERSION=2026.8.19
RUN python3 -m venv /opt/yt-dlp \
    && /opt/yt-dlp/bin/pip install --no-cache-dir "yt-dlp[default]==${YTDLP_VERSION}"
ENV YTDLP_PATH=/opt/yt-dlp/bin/yt-dlp

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
RUN mkdir -p /data && chown nextjs:nodejs /data && chown -R nextjs:nodejs /opt/yt-dlp

USER nextjs

EXPOSE 3000

# Run migrations with the project-local, lockfile-resolved tsx, then start.
CMD ["sh", "-c", "./node_modules/.bin/tsx src/lib/db/migrate.ts && node server.js"]
