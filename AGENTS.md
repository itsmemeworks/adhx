# AGENTS.md

Orientation for AI agents (and humans) starting work in this repo with no prior context.

## What this project is

**ADHX** (adhx.com) — _"Save now. Read never. Find always."_ An open-source bookmark manager for people who save everything and read nothing. It syncs X/Twitter bookmarks, previews and saves Instagram Reels, TikToks, and YouTube Shorts via a URL-prefix trick (`x.com/...` → `adhx.com/...`), and turns the community's anonymous save/preview activity into public, crawlable pages (`/trending`). Next.js 16 App Router, SQLite + Drizzle, deployed on Fly.io (staging `adhx.fly.dev`, production `adhx.com`).

Strategically, ADHX's growth engine is SEO/GEO: x.com is effectively uncrawlable, so ADHX preview pages act as the indexable, structured mirror of social content — every save creates a public long-tail landing page. Features that add per-user variable cost (metered AI) are deliberately out of scope for the free product.

## How to get context (read in this order)

1. **`README.md`** — product tour, features, quick start.
2. **`ARCHITECTURE.md`** — narrative walkthrough: data flow, auth, preview model, database design.
3. **`CLAUDE.md`** — the deep reference: conventions, security invariants (SSRF allowlists, token refresh coalescing, multi-user isolation, activity anonymity), API routes, gotchas. **Binding for all agents**, not just Claude Code.
4. **`docs/WORKLOG.md`** — append-only, newest-first log of what's been done recently and why, including in-flight work and open follow-ups. Read at least the most recent entries before starting; this is where you learn what changed after the docs above were written.

## Context protocol (keep the loop alive)

After completing any substantive piece of work (feature, fix with a lesson, architectural decision, reverted experiment), **append an entry to `docs/WORKLOG.md`** — newest first, dated, ≤10 lines: what was done, why, current state (shipped/in-flight/reverted), and follow-ups. Never rewrite or delete old entries. This is how the next agent — on a fresh branch, with no conversation history — inherits your context.

If your change makes `README.md`, `ARCHITECTURE.md`, or `CLAUDE.md` inaccurate, update them in the same PR.

## Non-negotiable invariants (details in CLAUDE.md)

- Every user-data query filters by `userId` (and `platform` when touching `bookmarkId`). No `isNull(userId)` fallbacks.
- `activity.userId` is stored but **never** exposed on any public surface.
- Domain validation for proxies: exact match / `endsWith('.domain')` — never `.includes()`.
- Every external `fetch()` gets `AbortSignal.timeout()`.
- OAuth token refresh goes through `getValidTokens()` only.
- DB-reading pages are `force-dynamic` (SQLite exists only at container runtime, never at build).

## Verify your work

```bash
pnpm typecheck && pnpm test   # 940+ tests
pnpm lint && pnpm format:check
```

Conventional commits (lowercase subject) — CI requires `build` + `format` checks to merge.
