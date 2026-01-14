# syntax=docker/dockerfile:1

# Build stage - compile native modules and build Next.js
FROM node:20-slim AS builder

# Install build dependencies for better-sqlite3
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Use npm instead of pnpm (pnpm v10 blocks native module builds)
RUN npm install

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage - minimal runtime image
FROM node:20-slim AS runner

# Install sqlite3 CLI and runtime dependencies
RUN apt-get update && apt-get install -y \
    libsqlite3-0 \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

# Install tsx globally for running TypeScript migrations
RUN npm install -g tsx

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy built assets from builder
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy migration script and package.json for npm run db:migrate
COPY --from=builder --chown=nextjs:nodejs /app/src/lib/db/migrate.ts ./src/lib/db/migrate.ts
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json

# Create data directory for SQLite (will be mounted as volume)
RUN mkdir -p /data && chown nextjs:nodejs /data

USER nextjs

EXPOSE 3000

# Run migrations then start server
CMD ["sh", "-c", "npm run db:migrate && node server.js"]
