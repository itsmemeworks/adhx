# AGENTS.md

Orientation for AI agents (and humans) starting work in this repo with no prior context.

## What this project is

**ADHX** — _"Your friends have better taste than the algorithm."_ A self-hosted, private, curated feed across fourteen social networks for one group of close friends and family per server. One Next.js 16 container holds SQLite, the kept media (every save downloaded once and served by the server) and on-server search models; an optional native Mac helper can take the heavy processing. Native iOS/Android apps share links into it and play New, Channels and Live. People join with an invite link (optionally approved by an admin) or sign in by email magic link; connecting X for bookmark sync is optional.

Saves are shared with the server's members by default and named to them; "Just for me" saves are private; signed-out visitors only ever see counts ("named to friends, never to strangers", see `docs/specs/friends-feed.md` and `PRIVACY.md`). Shared post previews, Right now and kept media files are intentionally reachable by anyone who can reach the instance, so operators choose their network boundary. `site/` is a separate static product website intended for adhx.com; deployment and domain cutover are separate from editing this repository. Deployment examples must remain vendor-neutral; never commit household settings or credentials.

## How to get context (read in this order)

1. **`README.md`** — product tour, features, quick start.
2. **`ARCHITECTURE.md`** — narrative walkthrough with diagrams: system context, save-to-watch, the New blend, live moments, who sees what, phone auth, every table by plane.
3. **`CLAUDE.md`** — the deep reference: conventions, security invariants (SSRF allowlists, token refresh coalescing, multi-user isolation, activity anonymity), API routes, gotchas. **Binding for all agents**, not just Claude Code.
4. **`docs/WORKLOG.md`** — append-only, newest-first log of what's been done recently and why, including in-flight work and open follow-ups. Read at least the most recent entries before starting; this is where you learn what changed after the docs above were written.

## Context protocol (keep the loop alive)

After completing any substantive piece of work (feature, fix with a lesson, architectural decision, reverted experiment), **append an entry to `docs/WORKLOG.md`** — newest first, dated, ≤10 lines: what was done, why, current state (shipped/in-flight/reverted), and follow-ups. Never rewrite or delete old entries. This is how the next agent — on a fresh branch, with no conversation history — inherits your context.

If your change makes `README.md`, `ARCHITECTURE.md`, or `CLAUDE.md` inaccurate, update them in the same PR.

## Non-negotiable invariants (details in CLAUDE.md)

- Every user-data query filters by `userId` (and `platform` when touching `bookmarkId`). No `isNull(userId)` fallbacks.
- `activity.userId` is stored but **never** exposed on any public surface. Other people's saves are read only through `visibleSave` / `visibleSaveFilter`, and names only through `saversFor` (members only).
- Domain validation for proxies: exact match / `endsWith('.domain')` — never `.includes()`.
- Every external `fetch()` gets `AbortSignal.timeout()`.
- OAuth token refresh goes through `getValidTokens()` only.
- DB-reading pages are `force-dynamic` (SQLite exists only at container runtime, never at build).

## Verify your work

```bash
pnpm typecheck && pnpm test
pnpm lint && pnpm format:check
```

Conventional commits and PR titles (lowercase subject, e.g. `fix: resolve login issue`) — CI
validates both code and the semantic PR title.

## Git / PRs (this repo)

Agents **always** commit, push, and open or update a PR after substantive work. Do not wait to be asked. Use the GitHub account named in gitignored `CLAUDE.local.md` (never hard-code an operator login in this file). If a PR already exists for the branch, push to update it — do not open a duplicate. **PR titles use Conventional Commit syntax** and must be verified with `gh pr view --json title` before handoff. **Never merge** — the user merges PRs manually. This overrides any global “don't push unless asked” preference.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
