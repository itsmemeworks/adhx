# AGENTS.md

Onboarding for any coding agent (and any human who likes a checklist) starting
work in this repository with no prior context. It's short on purpose. The full
rules are in [`CLAUDE.md`](CLAUDE.md), which is binding for every agent, not
just Claude Code.

## What this project is

**ADHX: your friends have better taste than the algorithm.** A self-hosted,
private feed of the best posts from fourteen networks, picked by one group of
close friends and family per server. One Next.js 16 container holds the web
app, a SQLite file and a folder of kept media (every save is downloaded once
and served by ADHX itself). Search by meaning runs in model processes beside
the web server; an optional native Mac helper can take that work. Native iOS
and Android apps share links in and play the feed. People join with an invite
link or an email sign-in link; connecting X is optional.

The privacy rule is **named to friends, never to strangers**: members see who
saved what, signed-out visitors only see counts, and a Just for me save is the
owner's alone.

## Read in this order

1. [`docs/WORKLOG.md`](docs/WORKLOG.md): the newest entries. What changed
   recently, what's in flight, what's still open.
2. [`CLAUDE.md`](CLAUDE.md): commands, the rules, a map of where things live,
   and notes per subsystem.
3. [`ARCHITECTURE.md`](ARCHITECTURE.md): diagrams of the system, the save
   flow, sign-in and pairing, and who sees what.
4. The spec for the area you're touching, under [`docs/specs/`](docs/specs/)
   (for example [`friends-feed.md`](docs/specs/friends-feed.md) or
   [`phone-app.md`](docs/specs/phone-app.md)).

[`README.md`](README.md) is the product tour and [`CONTRIBUTING.md`](CONTRIBUTING.md)
the setup guide.

## Set up and check

```bash
corepack enable          # uses the pnpm version pinned in package.json
pnpm install
pnpm db:migrate          # creates ./data/adhdone.db
KEEP_BACKFILL=off pnpm dev   # http://localhost:3001
```

Before you say something is done:

```bash
pnpm typecheck && pnpm test     # unit and route tests (needs FFmpeg)
pnpm lint && pnpm format:check
pnpm test:e2e                   # when you touched pages or flows
```

For a UI change, look at it in a browser at a desktop width and a phone width.
Say plainly what you verified and what you didn't.

## The rules you must not break

The reasons and the exact helpers are in [`CLAUDE.md` → The rules](CLAUDE.md#the-rules).

- **Isolation.** Every user-data query filters by `userId`, and by `platform`
  whenever it touches `bookmarkId`. No `isNull(userId)` fallbacks.
- **Other people's saves** go through `visibleSave` / `visibleSaveFilter`;
  names only through `saversFor`, and only for members. Nothing public ever
  names a saver.
- **Stored, never shown:** `activity.userId` and `analytics_events.userId`.
- **No client-supplied display data.** Clients send identifiers; the server
  resolves text, images and types.
- **SSRF:** exact host or `endsWith('.domain')`, never `.includes()`.
- **Timeouts:** every outbound `fetch()` has `AbortSignal.timeout()`.
- **X tokens** come only from `getValidTokens()`.
- **Moderation fails closed.** "Couldn't read moderation" never means
  "visible".
- **DB-reading pages are `force-dynamic`.** SQLite exists only at runtime.
- **Models never run in the web process.** Go through
  `src/lib/semantic/supervisor.ts`.
- **Never key or remount `StageVideo`**, and build media URLs with `keptSrc()`.
- **Translation-safe JSX:** never a bare text node beside an element
  ([`docs/specs/translation-safety.md`](docs/specs/translation-safety.md)).

## What not to do

- Don't commit `.env*`, secrets, `CLAUDE.local.md`, household settings, or
  anyone's real data. Deployment examples stay vendor-neutral.
- Don't run `deploy.yml`, publish the site, or push images unless the owner
  asks. Merging to `main` deploys nothing, and that's on purpose.
- Don't skip hooks (`--no-verify`) or rewrite shared history.
- Don't "restore" removed features from old docs (`TheaterShell`, the library
  grid, `/trending`, streaks). See [`CLAUDE.md` → History](CLAUDE.md#history).
- Don't claim a fix works on a phone, a Mac or Apple's servers when you only
  ran it in a simulator or a test.

## Keep the loop alive

After substantive work (a feature, a fix with a lesson, a decision, a reverted
experiment):

1. Add a dated entry at the top of [`docs/WORKLOG.md`](docs/WORKLOG.md): what,
   why, current state, follow-ups, 10 lines at most. Never edit old entries.
2. Update `README.md`, `ARCHITECTURE.md`, `CLAUDE.md` or a spec in the same PR
   if your change made them wrong.
3. Commit, push and open or update a PR without waiting to be asked. Use the
   GitHub account named in the gitignored `CLAUDE.local.md`; never hard-code
   an operator login in a committed file. If the branch already has a PR,
   push to it rather than opening a second one.
4. Commit messages and PR titles are Conventional Commits with a lowercase
   subject, 100 characters at most, for example
   `fix: keep the queue when a video is gone`. CI checks both; check your
   title with `gh pr view --json title`.
5. Don't merge on your own initiative: the owner merges, or asks you to arm
   auto-merge. Never merge the Release Please PR.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
