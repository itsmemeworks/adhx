# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Local Configuration

Create `./CLAUDE.local.md` for personal settings that won't be committed:

```markdown
# Example CLAUDE.local.md

## GitHub CLI

Always use the `your-username` account for gh commands.

## Sentry CLI

Use org `your-org` and project `your-project`.

## Personal Notes

- My test user ID: user_abc123
- Local dev URL: http://localhost:3000
```

**Use cases for `CLAUDE.local.md`:**

- CLI tool credentials (GitHub, Sentry, Fly.io accounts)
- Personal test data and user IDs
- Local environment URLs and ports
- Workflow preferences specific to you
- Notes that shouldn't affect other contributors

---

## ADHX

**Save it. Lose it. Find it.**

A Twitter/X bookmark manager for people who bookmark everything and read nothing. Built with Next.js 16. Also previews and saves Instagram image posts/carousels and Reels, TikTok videos, and YouTube Shorts via the same URL-prefix trick (Instagram images and TikTok/Reels offer file send/download; YouTube plays via the official iframe embed).

## Agent Context Protocol

This repo carries its own cumulative context so any fresh session — new branch, no conversation history — can self-orient:

1. **At session start**, read the most recent entries of **`docs/WORKLOG.md`** (append-only, newest first). It records what was done recently, why, what's in flight, and open follow-ups — context that postdates the docs.
2. **After completing substantive work** (feature, fix with a lesson, architectural decision, reverted experiment), **append a dated entry** to `docs/WORKLOG.md`: what/why/current state/follow-ups, ≤10 lines, newest first. Never rewrite or delete old entries.
3. If your change makes this file, `README.md`, or `ARCHITECTURE.md` inaccurate, update them in the same PR.
4. **Always commit, push, and open/update a PR** after substantive work. Do not wait to be asked. Use the GitHub account named in gitignored `CLAUDE.local.md`. Never merge — the user merges manually. This overrides any global “don't push unless asked” preference.

`AGENTS.md` at the repo root is the cross-tool entry point (for agents that don't read CLAUDE.md) and points here.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                  BROWSER                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│  Landing Page          Main Feed              URL Prefix Feature            │
│  ┌─────────────┐      ┌─────────────┐        ┌─────────────────────┐       │
│  │ /           │      │ / (auth'd)  │        │ /{user}/status/{id} │       │
│  │ Marketing   │      │ FeedGrid    │        │ Quick-save tweet    │       │
│  │ OAuth Start │      │ Lightbox    │        │ → Add & redirect    │       │
│  └─────────────┘      │ FilterBar   │        └─────────────────────┘       │
│                       └─────────────┘                                       │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              NEXT.JS API ROUTES                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Auth                    Data                      Media                     │
│  ┌──────────────┐       ┌──────────────┐         ┌──────────────┐          │
│  │ /auth/twitter│       │ /api/feed    │         │ /api/media/  │          │
│  │ /auth/callback       │ /api/sync    │◄──SSE   │   video      │          │
│  │ /auth/status │       │ /api/tweets/ │         └──────┬───────┘          │
│  └──────┬───────┘       │   add        │                │                   │
│         │               │ /api/bookmarks               │                   │
│         │               └──────┬───────┘                │                   │
│         │                      │                        │                   │
└─────────┼──────────────────────┼────────────────────────┼───────────────────┘
          │                      │                        │
          ▼                      ▼                        ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────────┐
│   Twitter API   │    │  SQLite + Drizzle│    │    FxTwitter API    │
│   (OAuth 2.0)   │    │                  │    │ (Media proxy/embed) │
│                 │    │  bookmarks       │    │                     │
│  • Auth tokens  │    │  bookmark_media  │    │  • Video URLs       │
│  • User info    │    │  bookmark_tags   │    │  • Photo URLs       │
│  • Bookmarks    │    │  read_status     │    │  • Tweet enrichment │
│                 │    │  sync_logs       │    │                     │
└─────────────────┘    └─────────────────┘    └─────────────────────┘
```

**Data Flow:**

1. **Sync**: Twitter API → Process tweets → SQLite (via `/api/sync` SSE stream)
2. **Add**: URL → FxTwitter enrichment → SQLite (via `/api/tweets/add`)
3. **View**: SQLite → Feed API → React components
4. **Media**: FxTwitter proxy → Video/Photo display (bypasses Twitter CORS)

## Quick Start

```bash
pnpm install
pnpm db:migrate  # creates ./data/adhdone.db (Docker does this on start; local does not)
pnpm dev         # Start dev server at localhost:3001
pnpm build       # Production build
pnpm test        # Run all 943 tests
```

## Tech Stack

- **Framework**: Next.js 16 (App Router) + React 19
- **Database**: SQLite via better-sqlite3 + Drizzle ORM 0.45
- **Styling**: Tailwind CSS 3.4 + clsx + tailwind-merge
- **Twitter API**: twitter-api-v2 with OAuth 2.0 PKCE
- **Auth**: JWT-signed session cookies (jose)
- **Monitoring**: Sentry (error tracking + metrics)
- **Icons**: lucide-react
- **Fonts**: Indie Flower (brand), IBM Plex Sans/Inter/Lexend/Atkinson Hyperlegible (body - user selectable)
- **Testing**: Vitest
- **Deployment**: Fly.io with automated deploys via GitHub Actions

## Security

### Session Management

Sessions use JWT signing via `jose` library to prevent tampering:

- Cookie name: `adhx_session`
- Signed with `SESSION_SECRET` or `TWITTER_CLIENT_SECRET`
- 30-day expiration
- httpOnly, secure (in production), sameSite: lax

### Accounts & Identities (magic link + optional X link)

Accounts are first-class (`users` table). **Sign-in is email magic link only.** X OAuth is a Settings link on an existing account, used to sync X bookmarks — it never creates an account or a session.

- **Tables**: `users` (id, unique username, immutable-ID-backed `role`, display/avatar/email, X-link revocation generation), `user_identities` (PK `(provider, provider_id)` plus one-X-identity-per-user partial uniqueness — provider `'x'` with the X user id, or `'email'` with the lowercased address → `user_id`), `login_tokens` (sha256 token hash, intent `'signin'|'change'`, 15-min expiry, single-use), and `oauth_state` (PKCE verifier + initiating `user_id` + captured X-link generation, cascade-deleted). Magic links and OAuth states are consumed with one conditional write, so concurrent callbacks have exactly one winner. Email identity claims are transactional and uniqueness-race resolving. Created + backfilled idempotently in `migrate.ts` (existing users keep `userId == X id`; email-first users get `u_<hex>` ids; legacy unbound OAuth states are invalidated).
- **Core lib**: `src/lib/auth/account.ts` (`getAccount`, `findOrCreateUserForX`, `findOrCreateUserForEmail`, `linkEmailToUser`, `unlinkX`, `createLoginToken`/`consumeLoginToken`). Email delivery: `src/lib/email/magic-link.ts` — Resend HTTP API when `RESEND_API_KEY` is set; **in dev without the key the link is logged to the server console** (`[magic-link] …`) so local testing needs no email round-trip. HTML is `src/emails/magic-link.tsx` (react-email, SignInModal-shaped). Preview with `pnpm email:dev` on :3003.
- **Routes**: `GET /api/auth/me` (account view: `{ authenticated, user, identities: { x: { username, avatarUrl }, email }, xConnected, isAdmin }` — the client-side source of truth; Header/AuthedHome/preferences use it, NOT the twitter/status route. `identities.x.avatarUrl` is the X profile photo (from oauth tokens, falling back to `users.avatarUrl`). Account chrome honors `user_preferences.avatarSource` (`'x'` | `'generated'`). `isAdmin` comes from the persisted `users.role`, never the mutable username. Banned/deleted-account sessions return the signed-out shape.), `POST /api/auth/email/request` (rate-limited 60s/email, no user enumeration), `GET /api/auth/email/callback?token=` (signin sets session; change relinks email), `POST /api/auth/email/change` (authed), `POST /api/auth/twitter/disconnect` (409 when it's the last identity), `POST /api/auth/logout`.
- **X start + callback**: `GET /api/auth/twitter` requires a session; unsigned visitors redirect `/?auth_error=x_link_only`. OAuth state is durably bound to that initiating ADHX user and its X-link generation; a callback under a different session is rejected without consuming the initiator's state, and disconnect increments the generation so an in-flight callback cannot silently reconnect. The callback calls `findOrCreateUserForX(x, existingSession.userId)`: signed-in users get X **linked** for bookmark sync; no session or `sign_in_required` → `/?auth_error=x_link_only` (no user created); an X identity already on another account redirects `/settings?auth_error=x_already_linked` without touching the session. Identity, generation, token, and X-derived profile writes finalize atomically. After a successful link, honor `adhx_return_url` if safe, else land on `/settings` (not `/?firstLogin=true` — signed-in `/` redirects to `/live` and drops the query).
- **Status route semantics** (`/api/auth/twitter/status`): `authenticated` = valid session + users row (independent of X). A **fatal token-refresh error CAS-deletes only the rejected credential row and keeps the session** — a concurrent relink/rotation always wins; `xConnected`/`needsReconnect` describe the X state. X profile metadata updates use the same identity/generation/token guard. Sync for users without X tokens surfaces SSE `code: 'reauth'` with a Connect-with-X prompt (already-signed-in reconnect, not sign-in).
- **Sign-in UI**: `SignInModal` + `useAuthMe` in `src/components/auth/` — always-dark modal, **email magic link only** (no Continue with X). Opened at **save-intent** (theater Save buttons, collection Save CTA); viewing never requires an account. Link X later in Settings.

### Authentication

All data-modifying endpoints require authentication via `getCurrentUserId()`:

```typescript
import { getCurrentUserId } from '@/lib/auth/session'

const userId = await getCurrentUserId()
if (!userId) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
```

### Database

- Uses Drizzle ORM query builder (never raw SQL with interpolation)
- All queries filter by `userId` for multi-user data isolation
- **Multi-user schema**: All user-owned tables use composite primary keys `(userId, id)` to allow multiple users to bookmark the same tweet independently
- **Transactions**: Use `runInTransaction()` from `@/lib/db` for atomic multi-table operations. Inside transactions, use synchronous `.run()` instead of `await`:

```typescript
import { db, runInTransaction } from '@/lib/db'

// Atomic multi-table operation
runInTransaction(() => {
  db.delete(bookmarkTags)
    .where(and(eq(bookmarkTags.userId, userId), eq(bookmarkTags.bookmarkId, id)))
    .run()
  db.delete(bookmarks)
    .where(and(eq(bookmarks.userId, userId), eq(bookmarks.id, id)))
    .run()
})
```

See `src/app/api/bookmarks/[id]/route.ts` and `src/app/api/account/clear/route.ts` for examples.

### Token Encryption

OAuth tokens are encrypted at rest using AES-256-GCM:

- **Key file**: `src/lib/auth/token-encryption.ts`
- Encryption key derived from `SESSION_SECRET` or `TWITTER_CLIENT_SECRET`
- Each token gets a unique IV (initialization vector)
- Stored format: `iv:authTag:ciphertext` (base64 encoded)

```typescript
import { encryptToken, decryptToken } from '@/lib/auth/token-encryption'

const encrypted = encryptToken(accessToken) // Store this in DB
const decrypted = decryptToken(encrypted) // Use this for API calls
```

### OAuth Token Refresh (race-safe)

X OAuth 2.0 tokens: the **access token lasts ~2 hours**; the **refresh token is single-use and rotates** — every refresh issues a new access+refresh token and **invalidates the previous refresh token**. If two requests refresh concurrently they both spend the same refresh token; the loser is handed an invalidated one, which **breaks the rotation chain** and forces a full re-auth. This app calls auth on every page load (`/api/auth/twitter/status`) and during sync, so concurrent refreshes are common.

**`getValidTokens(userId, { forceRefresh? })` (`src/lib/auth/oauth.ts`) is the single entry point** for obtaining a usable access token. It:

- returns stored tokens unchanged when still valid (5-min expiry buffer),
- refreshes when expired (or when `forceRefresh` is set),
- **coalesces same-process refreshes** onto one promise and acquires a durable per-user SQLite refresh lease before calling X, so multiple workers cannot spend the same single-use token,
- persists encrypted rotations, fatal invalidation, and transient lease release with lease-owned compare-and-swap writes; disconnect/relink/newer rotations always win.

**Do NOT add new refresh call sites** that call `refreshAccessToken` + `saveTokens` directly — route everything through `getValidTokens`, or you reintroduce the rotation race. `getTwitterClient()` and `/api/auth/twitter/status` both use it.

**`TokenRefreshError`** carries `status` + `fatal`:

- `fatal` (HTTP 400/401) → the exact refresh-token row was rejected and CAS-deleted; only a fresh X link recovers it. The ADHX session remains valid.
- non-fatal (network / 5xx / lost race) → **keep the stored tokens** and let a later request retry. Never tear down the session on a transient failure (that turns a blip into a forced re-auth).

**Reactive 401/403 recovery**: `fetchBookmarks` (`src/lib/twitter/client.ts`) force-refreshes once and retries on 401 or 403. If the retry still fails, throw a `TwitterCallError` with `code: 'reauth'` and human copy. **Do not treat 402 as reauth** — X uses 402 for "developer account has no pay-per-use credits"; reconnecting the user loops. 402 is `code: 'unavailable'` ("Your login is fine — try again later") plus a Sentry warning. Classification lives in `src/lib/twitter/errors.ts` / `src/lib/sync/messages.ts`. The sync SSE sends `{ message, code }`; `SyncProgress` shows **Connect with X** only for `reauth`.

Tests: `src/__tests__/token-refresh.test.ts` (coalescing, fatal/transient, rotation persistence) and the refresh cases in `src/__tests__/api/auth-status.test.ts`.

### Sync concurrency

`GET /api/sync` atomically claims a `sync_logs.status = 'running'` row **before** opening SSE. A partial unique index permits only one running sync per user; a second EventSource receives a terminal SSE error with `code: 'in_progress'`. The active stream renews a durable heartbeat; stale claims are failed before replacement, and terminal writes require lease ownership so an old process cannot overwrite a reaped row. Startup repairs stale/duplicate legacy running rows before enforcing uniqueness. New-bookmark stats, activity pulses, and SSE processing events use the actual bookmark insert result—not a stale pre-sync snapshot. `bookmark_links` has a unique `(userId, platform, bookmarkId, expandedUrl)` boundary and field-wise merge upserts, so concurrent enrichment neither duplicates rows nor loses complementary metadata.

### Content Security Policy (CSP)

Security headers configured in `next.config.js`:

- `script-src 'self' 'unsafe-inline'` — no `unsafe-eval` (only needed by React Refresh in dev, not production)
- `style-src 'self' 'unsafe-inline'` — required for Tailwind CSS
- Prevents clickjacking with `frame-ancestors 'none'`
- Blocks mixed content
- Configured for Twitter/X embed compatibility

**Do NOT add `'unsafe-eval'`** — it enables `eval()` and is a major XSS escalation vector.

### Browser translation is ENABLED — and constrains how we render text

`<html>` deliberately carries no `translate="no"` and there is no `notranslate` meta: reading a Spanish tweet in English is a feature (owner decision). The cost is a hard rule — **never render a bare text child as the SIBLING of an element** (wrap each run in a `<span>`). A translator replaces text nodes with its own `<font>` wrappers, so React's next `removeChild`/`insertBefore` among those children throws `NotFoundError` and the page falls to the error boundary; in the theater that meant advancing to the next post crashed. Full rule, the grey area, and the console audit that finds new offenders: **`docs/specs/translation-safety.md`**.

### SSRF Protection

All media proxy endpoints validate URLs against a strict domain allowlist before fetching. **Never use `.includes()` for domain validation** — it allows bypass via `domain.evil.com`.

```typescript
// ❌ WRONG: allows twimg.com.evil.com
if (hostname.includes('twimg.com')) { ... }

// ✅ CORRECT: exact match + endsWith with dot prefix
const isAllowed = hostname === 'video.twimg.com'
  || hostname.endsWith('.twimg.com')
  || hostname === 'twitter.com'
  || hostname.endsWith('.twitter.com')
```

This pattern is used in:

- `src/app/api/media/video/route.ts` — video proxy (allowlist array)
- `src/app/api/media/video/hls/route.ts` — HLS playlist proxy
- `src/app/api/media/video/hls/segment/route.ts` — HLS segment proxy

### Multi-User Query Safety

When querying tables with `userId`, never include `isNull(userId)` fallbacks for "legacy" data. This leaks data across users:

```typescript
// ❌ WRONG: includes other users' NULL-userId rows
.where(or(eq(table.userId, userId), isNull(table.userId)))

// ✅ CORRECT: strict user isolation
.where(eq(table.userId, userId))
```

### Health Check Endpoint

`/api/health` provides monitoring for Fly.io and external health checks:

```json
{
  "status": "healthy",
  "timestamp": "2026-02-04T17:34:51.608Z",
  "version": "1.18.0",
  "checks": {
    "database": { "status": "healthy", "responseTime": "0ms" }
  }
}
```

Returns 503 if database is unreachable.

### Error Tracking & Metrics (Sentry)

Error tracking and user behavior metrics via Sentry SDK 10.x (server-side only, `@sentry/node`).

**Key file**: `src/lib/sentry.ts`

**Configuration**:

- `tracesSampleRate: 0.2` — 20% sampling to avoid quota issues at scale
- `enabled` only in production (`NODE_ENV === 'production'`)
- **PII protection**: User IDs are hashed before sending as metric attributes (never send raw `userId` to third parties)

```typescript
import { captureException, metrics } from '@/lib/sentry'

// Capture errors with context
captureException(error, { userId, endpoint: '/api/sync' })

// Track user behavior
metrics.authCompleted(isNewUser)
metrics.syncCompleted(bookmarksCount, pagesCount, durationMs)
metrics.bookmarkReadToggled(true)
metrics.feedSearched(hasResults, resultCount)
metrics.trackUser(userId) // Hashes userId internally
```

**Available metrics**:

- `auth.*` - OAuth flow tracking (started, completed, failed)
- `sync.*` - Sync operations (started, completed, failed, duration)
- `bookmark.*` - User interactions (read_toggled, tagged, added, deleted)
- `feed.*` - Feed usage (loaded, searched, filtered)
- `users.daily_active` - DAU tracking (uses `user_hash`, not raw ID)

**Error Boundaries**:

- `src/app/error.tsx` — catches page-level React errors (client component). Server-side errors are captured by Sentry Node SDK before reaching this boundary. Client-only React errors log to console but aren't sent to Sentry (no `@sentry/browser` installed).
- `src/app/global-error.tsx` — catches root layout crashes. Must provide its own `<html>` and `<body>` tags since the layout itself may have failed. Uses inline styles (no Tailwind available).

## Resilience Patterns

### External Fetch Timeouts

All server-side `fetch()` calls to external services **must** include `signal: AbortSignal.timeout()`. Without timeouts, a hanging CDN connection exhausts Fly.io's connection pool.

```typescript
// API calls: 10 second timeout
await fetch(url, { signal: AbortSignal.timeout(10_000) })

// Large file downloads: 30 second timeout
await fetch(videoUrl, { signal: AbortSignal.timeout(30_000) })
```

Applied in all media proxy routes:

- `src/app/api/media/video/download/route.ts` — 10s for API, 30s for video
- `src/app/api/media/video/hls/route.ts` — 10s for playlist
- `src/app/api/media/video/hls/segment/route.ts` — 10s for segment

### Migration Safety

Database migrations (`src/lib/db/migrate.ts`) run at container startup. Each migration statement is wrapped in try/catch — on failure, the migration tag and error are logged, then `process.exit(1)` stops the container with a clear message rather than an opaque crash.

Account deletion is enforced below the request layer by idempotent SQLite triggers installed from `src/lib/db/account-invariants.ts`. Every future insert (and account-ID-changing update) into a user-linked table must reference a live `users` row; nullable activity/analytics/viewer IDs still allow legitimate anonymous events. This closes the cross-process race where a handler authenticated before `DELETE /api/account` could otherwise write after deletion committed. Existing historical rows are not retroactively validated or rewritten by migration.

## Architecture

### URL Prefix Feature

Users can preview tweets, Instagram posts/Reels, and TikToks by replacing the host in any link with `adhx.com`:

| Source URL                      | Becomes                       | Route                                     |
| ------------------------------- | ----------------------------- | ----------------------------------------- |
| `x.com/{user}/status/{id}`      | `adhx.com/{user}/status/{id}` | `src/app/[username]/status/[id]/page.tsx` |
| `instagram.com/p/{id}`          | `adhx.com/p/{id}`             | `src/app/p/[id]/page.tsx`                 |
| `instagram.com/reels/{id}`      | `adhx.com/reels/{id}`         | `src/app/reels/[id]/page.tsx`             |
| `instagram.com/reel/{id}`       | `adhx.com/reel/{id}`          | `src/app/reel/[id]/page.tsx`              |
| `tiktok.com/@{user}/video/{id}` | `adhx.com/@{user}/video/{id}` | `src/app/[username]/video/[id]/page.tsx`  |
| `youtube.com/shorts/{id}`       | `adhx.com/shorts/{id}`        | `src/app/shorts/[id]/page.tsx`            |

Users can also paste the **full** source URL after `adhx.com/` — `src/proxy.ts` (Next.js middleware) rewrites these via 307 redirect:

- `adhx.com/https://x.com/{user}/status/{id}` → `/{user}/status/{id}`
- `adhx.com/https://www.instagram.com/p/{id}` → `/p/{id}`
- `adhx.com/https://www.instagram.com/reels/{id}` → `/reels/{id}`
- `adhx.com/https://www.tiktok.com/@{user}/video/{id}` → `/@{user}/video/{id}`
- `adhx.com/https://youtube.com/shorts/{id}` → `/shorts/{id}`

All work with or without protocol, browser path normalization (`//` → `/`), trailing path segments, and platform-specific subdomains (e.g. `vm.tiktok.com`, `m.tiktok.com`, `m.youtube.com`).

All preview routes render the shared-mode theater (`SharedPostStatic` + `<TheaterShell mode="shared">` — see "Preview pages ARE the theater" under the Theater section). The per-platform media-resolution notes below still apply.

**Tweet preview**:

- Authenticated: landing on a preview via a **new open** (URL prefix, paste, `/share`) auto-saves the shared lead (`POST /api/bookmarks/add`, `source: 'url_prefix'`). Refresh of a theater-rewritten address bar, back/forward, and in-app hops (`/trending` → preview) do **not**. `?save=1` after sign-in still completes an explicit save even on reload. Watching in Live (`useTheaterDwell`) only pulses `/api/activity/preview` — it never saves. The Save pill pops **Saved** then morphs to **Tag** (same `TagQuickPicker` as Live).
- Unauthenticated: rich preview; saving opens `SignInModal` at save-intent. A later in-modal sign-in does not auto-save unless the URL already had `?save=1`.

**Instagram preview** (media resolution):

- Metadata comes from Instagram's crawler Relay payload (`src/lib/media/instafix.ts`), with OG tags as a reduced fallback. Relay distinguishes images from Reels and preserves every ordered carousel child, dimensions, and accessibility text. OG is explicitly incomplete: a duplicate save may repair an empty media set from it, but must never replace a richer saved carousel. Mixed-carousel video children are persisted as poster-only photo slides until indexed child-video playback exists.
- `/p/{id}` image posts use `/api/media/instagram/thumbnail?id=&index=` to re-resolve expiring signed CDN URLs. Single images and ordered carousels render through the same theater photo-album controls as X; Send/download uses the attachment form of that proxy.
- `/reel/{id}` and `/reels/{id}` preserve the existing Reel path. There is no `og:video`.
- MP4 via vxinstagram (`src/lib/media/mirrors.ts`) proxied at `/api/media/instagram/video`. Cold cache 404s for ~10–20s — the resolver retries; **do not attach `<video src>` until a Range probe 200/206s** (`probeInstagramVideo` in `src/lib/media/instagram-playback.ts`). The preview page also warms the cache (Range 0-1, fire-and-forget) so the probe is usually already hot.
- If the mirror never comes back: official Instagram iframe (`/reel/{id}/embed/`). Needs `https://www.instagram.com` in CSP `frame-src`.

**TikTok preview** (media resolution):

- Resolves metadata via `tnktok.com` (fxTikTok). The mirror's `/generate/video/{id}.mp4` endpoint 302-redirects to the real TikTok CDN (`tiktokcdn-us.com` / `tiktokcdn-eu.com`) with proper signing — we stream straight through (`src/lib/media/tnktok.ts`).
- Custom inline SVG glyph for the TikTok logo (lucide doesn't ship one).
- Note: Next.js URL-encodes `@` in dynamic params, so `params.username` arrives as `%40user`. Decode before validation.

**YouTube Shorts preview** (media resolution):

- Unlike TikTok/Instagram there's **no free MP4 mirror** — and stream extraction is fragile + against ToS. So YouTube uses the _official_ path: metadata via YouTube's free **oEmbed** API and playback via the official **iframe embed** (`src/lib/media/youtube.ts`).
  - oEmbed: `https://www.youtube.com/oembed?url=<watch url>&format=json` → title, channel name, channel handle (parsed from `author_url`'s `/@handle`).
  - Thumbnail: `https://i.ytimg.com/vi/{id}/hqdefault.jpg`. Embed: `https://www.youtube-nocookie.com/embed/{id}` (privacy-enhanced).
  - **No download** (that was a deliberate product decision — there's no compliant zero-cost MP4 source).
- `extractYouTubeId()` accepts **Shorts URLs only** (`youtube.com/shorts/{id}`, www/m, with/without protocol, `?si=` tracking params). `youtu.be`, `/watch?v=`, `/embed/`, `/live/`, and bare ids are rejected — those forms cover regular (non-Short) videos.
- **CSP**: YouTube iframe needs `frame-src https://www.youtube-nocookie.com https://www.youtube.com`; Instagram Reel fallback embed needs `https://www.instagram.com`. `img-src` allows `https:` so off-site OG/link-preview images (Substack, Medium, …) can render on stage and in the library. All in `next.config.js`.
- The gallery `FeedCard` shows the poster + a play overlay (no hover-autoplay; there's no MP4). `StageYouTube` renders the iframe directly for `platform === 'youtube'` — **give the iframe container a concrete height** (e.g. `h-[60vh] lg:h-[82vh] aspect-[9/16]`); an `aspect-[9/16]` box around an `absolute` iframe collapses to zero otherwise.
- Saved Shorts store a poster as a `mediaType: 'video'` row (the embed is resolved from platform+id, so there's no MP4 to store).

**Send** is the file (video or photo); **Share link** is the preview URL. Touch **Send** prefetches the MP4 and shares `files` + `text: "via <canonical url>"` — never `url` alongside `files` (WhatsApp concatenates them into `via URL URL`). iOS needs the file ready before the tap so `navigator.share` stays a user gesture (implemented by `useSendFile` in the theater).

**Save-to-collection**: a signed-in new-open of a preview autosaves the lead (see Tweet preview above). The chrome Save button still POSTs `/api/bookmarks/add` and flips to Saved. Saved Instagram images/carousels, Reels, and TikToks land in the same feed as tweets, distinguished by the platform badge on the FeedCard.

**AppShell** suppresses the global Header for these preview paths via the `isFullWidth` regex — see `src/components/AppShell.tsx`. Add new preview paths there to avoid the double-header issue.

**OG Image Selection** (`getOgImage()` in `src/lib/utils/og-image.ts`):
When generating Open Graph metadata for social unfurling, images are selected in priority order:

1. Direct media (tweet's own photos/video thumbnails)
2. Article cover image (X Articles `tweet.article.cover_media.media_info.original_img_url`)
3. Quote tweet media (when parent has no media, use quoted tweet's photos/videos)
4. External link thumbnail (`tweet.external.thumbnail_url`)
5. Author avatar (`tweet.author.avatar_url`) for text-only tweets
6. Fallback to `/og-logo.png` for tweets without avatar

**Twitter Card Type** (`src/app/[username]/status/[id]/page.tsx`):

- `summary_large_image` — tweets with rich media (photos, videos, article covers, external thumbnails)
- `summary` — text-only tweets where OG image is the author's avatar (small square card fits avatars better than a stretched banner)

### Trending & Activity Pulse (the SEO growth loop)

`/trending` (`src/app/trending/page.tsx`) and the per-lens hubs `/trending/[filter]` (`popular` / `videos` / `photos` / `text` / `articles` — see `FILTER_SLUGS` in `src/lib/trending/filter.ts`) are public, **anonymous**, crawlable feeds of what the community is watching and sending right now — the SEO growth loop that turns user activity into indexable content. **`/discover` 308-redirects to `/trending`** (the old `/discover` page and the `LivePulse` marquee are gone). Each hub server-renders a real, crawlable `sr-only` item list (`src/components/trending/TrendingStaticList.tsx`) + `CollectionPage`/`ItemList` JSON-LD, then mounts the dark ranked list (`TrendingRankedList` — see the Theater section) seeded with the same items so there's no skeleton flash. The selected filter pill is reflected in the URL (tidy path, via `history.replaceState`) so a filtered view is shareable; loading `/trending/<filter>` seeds that filter server-side.

**Runtime-render gotcha — do NOT make these static.** `/trending`, `/trending/[filter]`, the `/sitemap.xml` route, and the preview pages are `export const dynamic = 'force-dynamic'` (and the trending hubs deliberately have **no** `generateStaticParams`). They read the SQLite DB, which is **only migrated at container startup** — pre-rendering them at build queries a table-less DB (`no such table: activity`) and bakes empty HTML. Keep them dynamic. (The trending DB query is a cheap local read, so per-request rendering is fine.)

**Shared trending query — the single anonymity-safe choke point.** `getTrendingItems()` (`src/lib/trending/query.ts`) reads recent `activity`, dedupes to **one row per post** (`platform:bookmarkId`, newest event wins — a post can be both previewed and saved), and enriches it. It **never selects `activity.userId`**; every read path (`/api/activity`, the public `/api/trending` JSON endpoint, and the hubs) goes through it. Filtering/typing lives in `src/lib/trending/filter.ts` (`FilterId`, `FILTERS`, `inferType`, `applyFilter`, `slugToFilter`/`filterToPath`) — shared by the server hubs and the client grid so the crawlable HTML matches the hydrated grid. The sharded sitemap was reverted to a single dynamic `/sitemap.xml` (sharding served only `/sitemap/<id>.xml` with no index, 404ing the robots-declared URL).

**Recorded events** (`recordActivity()` in `src/lib/activity/record.ts`):

| Action    | Hooked into                                                                                                                                                                                                                                                                      | Notes                                                                                                        |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `preview` | the 4 preview page server components                                                                                                                                                                                                                                             | Skipped for bots/OG-unfurl crawlers via `isLikelyBot()` (`src/lib/activity/bot.ts`) so the pulse stays human |
| `save`    | `/api/tweets/add` (twitter, covers the `/api/bookmarks/add` delegation) + the IG/TikTok branches of `/api/bookmarks/add`, **and `/api/sync`** (each newly-synced bookmark — capped per sync via `SYNC_PULSE_CAP`, freshest first, so a big backfill can't flood the shared feed) |                                                                                                              |
| `share`   | `POST /api/activity/share` `{ platform, id }` only — native send/download on preview pages pings this. Display fields are copied from an existing pulse/bookmark row; unknown posts are a no-op. Client-supplied captions/thumbs are ignored.                                    |                                                                                                              |

Archive (`POST /api/bookmarks/[id]/read`) is private — it does **not** write a public `read` pulse. It **does** write `post.archive` to the private growth log.

**Growth analytics** (`src/lib/analytics/record.ts` — `recordAnalytic` / `recordPostAnalytic`): a separate append-only `analytics_events` table for everything the pulse is not allowed to show (tag, archive, copy, open, send-vs-download, auth, shortcut install, theater open, playlist publish). Pulse actions dual-write here (`preview` → `post.view`, `save` → `post.save`, `share` → `post.share`) with platform + content type + source. `userId` is stored and **never** selected by `GET /api/analytics`. Client POSTs are an allowlist (`post.send` / `post.copy` / `post.open` / `shortcut.install`) and identifiers only — type is resolved server-side. Rollups live in `src/lib/analytics/query.ts` (`getAnalyticsSummary`) so future leaderboards do not query the table ad hoc. Rows older than 90 days are pruned at migrate. Do **not** dump these events into `activity` — that would flood `/trending`. The signed-in **Admin** page (`/admin`, linked from Settings for persisted admin-role accounts) reads the same rollups via `GET /api/admin/overview` and refreshes every 30s.

**Admin console** (`/admin`, `src/lib/admin/`): gated by `users.role = 'admin'`, attached to the immutable account ID. `ADMIN_USERNAMES` is only a one-time migration bootstrap for existing deployments; runtime authorization never resolves usernames, so deletion/reclamation cannot transfer privilege. The legacy bootstrap is all-or-nothing: every configured username must already resolve or startup fails with no promotions, and that rejected list is durably blocked from later promoting a new claimant. Remove/fix it and use `ADMIN_USER_IDS` to recover. Fresh installs and deliberate future grants use `ADMIN_USER_IDS` (comma-separated immutable account IDs): set it after the account exists and restart once to persist the role. Removing an ID does not auto-demote it. Hide a post writes `moderated_posts` + `activity.hidden` (preview pages tombstone + noindex; sitemap and pulse skip it; user bookmarks stay). Ban writes `user_bans` (`getCurrentUserId` returns null; sign-in callbacks bounce; public `/t/{user}` 404s). Playlist hide still uses `collection_events.hidden`. Every action is appended to `admin_audit`. Helpers: `withAdmin`, `hidePost`, `setUserBanned`.

**Moderation fails closed.** Read helpers return a typed success/unavailable result; callers must never translate an unavailable moderation store into “visible” or “not banned.” Auth denies, previews tombstone/noindex before upstream resolution, pulse writes skip, sitemap entries are omitted, and public profile/playlist/tweet/leaderboard surfaces withhold content when moderation state cannot be read. `hidePost` updates `moderated_posts`, `activity.hidden`, and audit atomically. Startup verifies the moderation tables and terminates if their required columns are unreadable.

**Two invariants enforced in `recordActivity()` — do not break these:**

1. **Content is always resolved server-side** by the caller (tweet/reel/tiktok metadata already fetched in the route/page). We **never** accept display text/thumbnails/avatars from the client — a public "anyone can POST what shows on the front page" endpoint would be a stored-XSS / spam-injection hole. `POST /api/activity/share` is the only write endpoint and it takes identifiers only, then copies server-stored fields via `recordSharePulse()`.
2. **`userId` is stored but never exposed.** It exists only for future moderation/rate-limiting. `GET /api/activity` selects an explicit public column list that omits it — the pulse is anonymous by construction. Don't `select()` the whole row there.

**`GET /api/activity` enriches each item server-side** — the recorded `activity` row is intentionally sparse, so the API joins the saved bookmark to fill in display data (this is why Discover cards look right even though the raw row doesn't carry the media):

- `contentType` (video/photo/text/article) — from the saved bookmark's media kinds + `category`; TikTok/YouTube are always video, while Instagram distinguishes `/p/` photos/carousels from Reels. For **preview-only** posts (no saved bookmark) it falls back to the **server-resolved `activity.content_type`** recorded at preview time, so an article still renders as an article (cover + headline) instead of a bare "Saved post" — only if that's also absent does the client guess from platform/thumbnail. `content_type` was added via guarded `ALTER TABLE` in `migrate.ts` (like `author_avatar_url`); new `activity` columns must also be added to the in-memory test DDL.
- `thumbnailUrl` — **Instagram** images/posters are derived as `/api/media/instagram/thumbnail?id=`, and **TikTok** posters as `/api/media/tiktok/thumbnail?username=&id=`. Both are stable same-origin URLs that re-resolve expiring/signed CDN media and work even when an activity row has no thumbnail; **article** covers come from `bookmark_links.preview_image_url`; everything else keeps the recorded thumbnail. Mirrors how `/api/feed` builds thumbnails for the collection.
- article `text` is overridden with `bookmark_links.preview_title` (the recorded text is usually just the wrapper tweet's `t.co` link) so the card shows the real headline.
- `authorAvatarUrl` — the post author's avatar for tweet-style text/quote cards: the saved bookmark's `author_profile_image_url`, else the recorded `activity.author_avatar_url` (populated for preview-only items, server-resolved like `thumbnailUrl`).
- `saveCount` — distinct savers (anonymous count).
- `trendCount` — savers + preview events + send events → powers Trending + the flame badge.

Other details:

- Recording is fire-and-forget and synchronous (better-sqlite3); it swallows all errors so a pulse-write failure can never break a save/preview/read.
- De-duped on write (same `action+platform+bookmarkId` within 60s) and again on read (same `action+platform+url`), so refreshes/prefetches/double-fires don't flood it.
- Text/author are whitespace-collapsed and capped; thumbnails/avatars must be `http(s)` or an `/api/` proxy path (`safeThumb()`).
- Pulse consumers (the theater's live tab; formerly `DiscoverFeed`, deleted 2026-08-21) poll `/api/activity` (5s SWR cache on the API), de-dupe by `platform:bookmarkId`, and link each card to the **on-ADHX** preview path (`previewPath()`) to keep clicks on-site.
- Schema: standalone `activity` table. Append-only, no composite key — it's an event log, not user-owned content, so it's exempt from the `(userId, platform, id)` convention. The `author_avatar_url` column was added after the initial schema via a **guarded `ALTER TABLE` in `migrate.ts`** (SQLite has no `ADD COLUMN IF NOT EXISTS`, so it's wrapped in try/catch — not a Drizzle table-recreate). The in-memory test DB DDL (`src/__tests__/api/setup.ts`) must include new activity columns too.

**`DiscoverCard`** (`src/components/discover/DiscoverCard.tsx`) renders per content type, mirroring the in-app `FeedCard`, with a **bottom-pinned footer on an equal-height grid** (media flex-fills so footers align across the row):

- **media** (video/photo): poster fills the card + up to a 2-line caption overlay (white text on a `transparent → rgba(11,11,17,.84)` scrim + `text-shadow`).
- **article (with cover)**: cover image + serif title overlaid on a dark scrim.
- **article (no cover)**: accent-tinted gradient + `ARTICLE` chip + serif title + a faint oversized `FileText` watermark.
- **text / quote**: tweet-style — author avatar + name + `@handle` + `PlatformChip`, then the body.
- Anonymous footer: incognito avatar + time + platform glyph + Save/Preview button.
- The flame/trend badge is pinned top-right for **every** card type (rendered once at the card-link level, not per-branch). Time-derived text (the "N saving now" counter + each card's relative time) carries `suppressHydrationWarning` — it legitimately differs between the server-rendered HTML and the client (`Date.now()`), and without it React regenerates the tree (which also re-runs the layout's anti-FOUC `<script>` → a spurious "script tag while rendering" warning).

### Branding Assets

- `public/logo-dark.png` — transparent GOB + ADHX lockup for `#08070a` / `#322b23`
- `public/logo-paper.png` — outlined transparent lockup for `#e4dac8`
- `public/og-logo.png` — 1200×630 site-wide branded fallback
- `public/icon-192.png` / `public/icon-512.png` — full-bleed PWA icons
- `public/favicon-16.png` / `public/favicon-32.png` — browser favicons
- `public/gob-loader.svg` / `public/gob-loader-paper.svg` — animated post loader; the SVG's
  internal CSS must remain intact so `<img>` playback works

`MatterLogo` selects the dark or paper lockup; fixed theater surfaces must pass
`surface="dark"`. Header lockups are at least 32px tall. The brand tagline is
**Save it. Lose it. Find it.**

**OG Image Routes:**

- `src/app/opengraph-image.tsx` - Serves `og-logo.png` for homepage OG
- `src/app/twitter-image.tsx` - Serves `og-logo.png` for Twitter cards
- `src/app/api/og/playlist/[username]/[tag]/route.tsx` — dynamic 1200×630 playlist card:
  adaptive one-to-five-image mosaic, text-tile fallback, generic empty/error card, and a
  fully anonymous private/missing card. It preloads only allowlisted image hosts with bounded
  reads and fetches Indie Flower TTF for `ImageResponse`.

### LLM-Friendly Previews & Structured Data

- Public tweet JSON API (`/api/share/tweet/[username]/[id]`) — clean JSON with author, engagement stats, media, and article content as markdown. Public responses are `no-store` so every request rechecks moderation. `<link rel="alternate" type="application/json">` on preview pages points to this endpoint.
- JSON-LD structured data (`SocialMediaPosting` schema) on preview pages — author, interaction stats, images, video objects
- Enhanced OG tags: 280-char descriptions with engagement suffixes ("1.4K likes, 84 reposts"), `article:author`, `article:published_time`, `twitter:creator`
- Article tweets use the article title as OG title (instead of `@username: "title" - Save to ADHX`)
- Semantic HTML: tweet card in `<article data-content="tweet">` with `<header>`/`<footer>`, CTA section `role="complementary"`

**Article Text Utility** (`src/lib/utils/article-text.ts`):

- `articleBlocksToMarkdown()` converts X Article content blocks to clean markdown
- Handles headings, paragraphs, images, tweets, and dividers

**Tweet API Enrichment (`adhxContext`)**:
The public tweet JSON API enriches responses with ADHX curation context when the tweet exists in the local database:

- `savedByCount` — number of distinct ADHX users who bookmarked this tweet (no user IDs exposed)
- `publicTags` — list of public playlists (shared tags) containing this tweet (tag name, curator username, URL)
- `previewUrl` — canonical ADHX preview URL for the tweet
- Only appears when `savedByCount > 0`; private tags are never included

Key files:

- `src/app/api/share/tweet/[username]/[id]/route.ts` — Public tweet JSON API + `adhxContext` enrichment
- `src/lib/utils/article-text.ts` — Article content block → markdown conversion

### LLM Discovery (`llms.txt`)

`public/llms.txt` follows the [llmstxt.org](https://llmstxt.org/) standard. Declares ADHX's public APIs, content types, and usage patterns for AI agents. Served as a static file at `/llms.txt`.

### Dynamic Sitemap

`src/app/sitemap.ts` generates a dynamic sitemap including:

- Homepage (priority 1)
- All public playlist pages at `/t/{username}/{tag}` (priority 0.7, daily)
- All tweet preview URLs from public tags at `/{author}/status/{id}` (priority 0.5, weekly)
- Tweet URLs are deduplicated across multiple tags
- Private tags and their tweets are never included
- Falls back to homepage-only if database queries fail (e.g., during static build)

`public/robots.txt` includes `Allow: /t/`, `Allow: /api/share/`, `Allow: /api/og/`
(dynamic social cards), and `Allow: /api/media/` (VideoObject thumbnails + MP4 streams —
without this GSC reports "Thumbnail blocked by robots.txt") while keeping `/api/` disallowed
for authenticated endpoints. Longer Allow prefixes beat `Disallow: /api/` under Google's
longest-match rule.

### Save Methods (Platform-Aware)

The app offers multiple ways to save tweets, shown contextually based on the user's platform:

| Platform | Primary Method                                                                    | Fallback                                 |
| -------- | --------------------------------------------------------------------------------- | ---------------------------------------- |
| iOS      | One-tap iCloud shortcut — adds ADHX to the share menu (X / IG / TikTok / YouTube) | URL prefix + paste                       |
| Desktop  | Extension (`extension/` — toolbar / right-click / ⌘⇧A → `/share?url=`)            | Bookmarklet + URL prefix + theater paste |
| Android  | Add to Home Screen, then Share → ADHX (PWA Share Target)                          | Paste link + URL prefix                  |

**Mobile paste-first save (Tier 1)**: "Copy Link" in any share sheet → open ADHX → tap **Paste link**. `PasteLinkButton` (`src/components/PasteLinkButton.tsx`) reads the clipboard via a user-gesture-gated `navigator.clipboard.readText()` (must fire directly inside the click handler, never on mount) and navigates through the shared `navigateToPastedLink` helper (`src/lib/utils/parse-share-url.ts`) — the same CodeQL-hardened navigation shape (TikTok short links → hard nav to `/api/tiktok/resolve?url=…&go=1` built from a constant prefix + `encodeURIComponent`; everything else → `router.push` guarded by `isSafeInternalPath`) shared with `LandingPage`'s hero input. States: idle / resolving / a brief self-clearing "not a supported link" error; when the Clipboard API is unavailable, denied, or the clipboard is empty, it expands an inline URL input instead of dead-ending. Mounted mobile-only (`sm:hidden`) above the Collection feed (`src/app/AuthedHome.tsx`) and in the empty-state onboarding (`EmptyAccountOnboarding.tsx`), and icon-only (`iconOnly`) in the theater's mobile top bar (`TheaterMobileChrome.tsx`) — the touch equivalent of desktop's ⌘V paste-to-preview, which has no paste gesture on mobile Safari.

**Platform detection** (`src/lib/platform.ts`):

- `isIOSDevice()`, `isAndroidDevice()`, `getPlatformType()` → `'ios' | 'android' | 'desktop'`
- SSR-safe (returns `'desktop'` when `window` is undefined)
- Components use `useState` + `useEffect` to detect platform client-side

**iOS Shortcut:**

- Published iCloud shortcut ID: `0d187480099b4d34a745ec8750a4587b` — opens `/share?url=` for **X, Instagram, TikTok, and YouTube**. Not in this repo. One tap adds ADHX to the iOS share menu; from those apps, Share → ADHX. Surfaces: iOS banner (`PWAInstallPrompt` — tap away or X dismisses it), landing hero + promo, **Settings** (`IosShortcutSettingsCard`, always on iOS so the link is never lost), preview CTA nudge (`IosShortcutNudge`). Dismiss key `adhx-shortcut-dismissed`.
- URL-prefix (`x.com` → `adhx.com`) still works as a fallback. A DIY Share Sheet recipe that opens `https://adhx.com/share?url=` lives in `src/components/IosShareRecipe.tsx` if the iCloud link is ever lost. Settings and landing show a 3-step icon strip (`IosHow`). `/share` maps X / IG / TikTok / YouTube (and TikTok short links).

**Android install** (`src/components/AndroidInstall.tsx`):

- Settings (`AndroidSettingsCard`) mounts the same `AndroidInstallBanner` as the nudge — always on Android so the path is never lost. Standalone: “Installed. Share → ADHX.” `beforeinstallprompt`: one-tap Add. Else: a 3-step icon strip (Add to Home / Open the app / Share → ADHX). Anchor `#android-install`. No dismiss (it is not a nudge).
- Banner (`PWAInstallPrompt`) shows on Android even **without** `beforeinstallprompt` (Samsung/Firefox often never fire it). Same `AndroidInstallBanner`; skipped on `/settings` so the card is not doubled. Tap away or X dismisses it. On theater paths it hangs under the logo at `z-[70]` so it does not cover the peek bar. Hidden in standalone. Dismiss key `adhx-a2hs-dismissed`.
- Landing `ShortcutPromo` is Android-first (install + share), not bookmarklet-first.

**Bookmarklet** (desktop):

```
javascript:void(location.href=location.href.replace(/(?:x|twitter|instagram|tiktok|youtube)\.com/,'adhx.com'))
```

- One-click URL rewrite from x.com/twitter.com to adhx.com
- Shown with copy-to-clipboard button and drag-to-toolbar instructions
- No auth needed — redirects to preview page which handles auth/unauth

**PWA Share Target** (Android only — Web Share Target is unsupported on iOS Safari; requires the PWA installed):

- `public/manifest.json` includes `share_target` config: `action: "/share"`, `method: "GET"`, `params: { url, text, title }`. **All three params are captured** because apps disagree on which field carries the link — a clean share sets `url`, but TikTok (and others) drop it into `text` alongside a caption.
- `src/app/share/page.tsx` — client component that extracts the link from the shared payload and redirects to the matching preview path
- `extractSharedUrl(...candidates)` (`src/lib/utils/parse-share-url.ts`) returns the first http(s) URL across `url`/`text`/`title`, pulling a URL embedded in caption text when the whole field isn't one.
- `parseShareUrl()` maps **all four platforms** to their preview path and returns `{ path }`: X → `/{user}/status/{id}`, Instagram `/p/` → `/p/{id}`, Instagram Reel → `/reels/{id}`, TikTok → `/@{user}/video/{id}`, YouTube Shorts (`youtube.com/shorts/{id}` only) → `/shorts/{id}`. **TikTok short links** (`vm.`/`vt.tiktok.com/{code}`, `tiktok.com/t/{code}` — the native share format) can't be resolved client-side, so it returns the `/api/tiktok/resolve?url=…&go=1` resolver path instead, which 307s to the preview. The share page does a full `window.location.replace` for `/api/` paths (the client router can't follow a cross-route redirect) and `router.replace` for app routes.
- Shows a "Not a supported link" error for unrecognised URLs with a link back to homepage

**Add to Home Screen (PWA install)**:

- `src/components/PWAInstallPrompt.tsx` — mobile-only bottom banner, mounted app-wide in `AppShell` (preview pages too). Hidden on desktop.
  - **Android**: show even without `beforeinstallprompt`. Add when the event fires; otherwise How. Hidden in standalone. Dismiss key `adhx-a2hs-dismissed`. Settings mounts the same banner, always available.
  - **iOS/Safari**: Share Sheet shortcut install (iCloud link), not Add to Home Screen. Still shown in standalone. Dismiss key `adhx-shortcut-dismissed`.
- `public/sw.js` — a deliberately **cache-free** service worker (no-op `fetch` handler, no `respondWith`). It exists only to satisfy Chrome's installability criteria so `beforeinstallprompt` fires; it never serves stale content. Registered from `PWAInstallPrompt` on mount.

**Implementation files:**

- `src/lib/platform.ts` — Platform detection utilities
- `src/components/LandingPage.tsx` — `ShortcutPromo` component (platform-aware)
- `src/components/AndroidInstall.tsx` — Android Settings card + how-to
- `src/app/settings/SettingsClient.tsx` — iOS + Android install cards
- `src/app/share/page.tsx` — PWA Share Target landing page
- `src/lib/utils/parse-share-url.ts` — Tweet URL parsing for share target
- `extension/` — desktop Save to ADHX (Extension.js). Toolbar / context menu / ⌘⇧A → `/share?url=`. Unpacked only until a store listing. **Local:** `pnpm --dir extension install`, set `EXTENSION_PUBLIC_APP_ORIGIN=http://localhost:3001` in `extension/.env` (gitignored; copy `.env.example`), `pnpm --dir extension build`, Chrome → Load unpacked → `extension/dist/chromium`. Rebuild + Reload after env/source changes. Root `tsconfig` **excludes** `extension` so CI `tsc` / `next build` do not need `@types/chrome`. Walkthrough: `extension/README.md`.

### Typography & Reading Preferences

ADHD-friendly font system with user selection:

- **Brand font**: Indie Flower (playful handwritten)
- **Body fonts** (user selectable in Settings):
  - IBM Plex Sans - Clean, professional
  - Inter - Neutral, familiar
  - Lexend - Designed for ADHD/reading difficulties
  - Atkinson Hyperlegible - Maximum letter differentiation

Files:

- `src/lib/preferences-context.tsx` - Font preference state & FONT_OPTIONS
- `src/components/FontProvider.tsx` - Applies selected font to document
- `src/app/globals.css` - Font CSS rules

Additional reading aids:

- **Bionic Reading** - Bolds first part of each word to guide eyes. Honored on the Library feed cards and, in the theater, on article bodies and Read-mode typeset text (not the two-line media caption overlay).

### Matter Design System

The UI is the **"Matter"** warm editorial direction (light + dark). Shared primitives live in `src/components/matter/index.tsx`:

- `TypeBadge` (dark chip + type-color dot + uppercase label), `PlatformGlyph` / `PlatformChip` (dark circle), `TYPE_META`, `ContentType` / `PlatformId` types, `MatterLogo`, `LiveDot`, `ConnectWithX` (renders "Connect with" + the X glyph).
- Tailwind tokens (`tailwind.config.ts`): `clay`/`clay-grad` (accent), `done` (green), `flame`, `ink`/`ink-2`/`ink-3`, `surface`/`paper`/`inset`, `hairline`, `font-serif`. All resolve to CSS vars that flip with the `light`/`dark` class on `<html>`.
- Content cards render **per content type** in both surfaces: the in-app `FeedCard` (`src/components/feed/FeedCard.tsx`) and `DiscoverCard` share the same shapes — article-with-cover (cover + overlaid serif title), article-no-cover (accent gradient + `FileText` watermark), text/quote (tweet-style: avatar + name + `@handle`, no type chip), video/photo (media + up to 2-line caption overlay).
- **Caption/title clamp gotcha**: put the big padding on a wrapper and the `line-clamp-N` on a _child_ with no vertical padding. `-webkit-line-clamp` constrains box height but still paints overflow lines, so bottom padding on the clamped element lets a clipped extra line peek through.
- **Theater media captions**: two clamped lines (`TheaterCaption`). Overflow (or a quote) uses **Read** by tapping the caption; there is no separate Read button. Never more than two lines on the overlay. **Watch** remains visible in Read mode (TV icon, not Film — Film is Download) and returns to full-bleed; the parent video stays the same playing element in a top band so you can read while it continues. Action pills use `StageGlass` — the same flat frost as the mobile paste button (`border-white/25 bg-white/10 backdrop-blur-md`). The Tag button shows a count of tags on the post (max 5); there are no name chips in the action row.

### Theme System (dark only)

- Dark is the single product theme. `layout.tsx` server-renders `<html class="dark">` and a fixed `#08070a` browser theme color, so there is no preference lookup, system-theme branch, or FOUC script.
- Legacy `localStorage.theme` values are never read, so old `light` / `system` preferences cannot affect rendering.
- There are no theme controls in public navigation, account dropdowns, theater menus, or Settings. The former theme context, resolver, `ThemeToggle` component, and Matter-light token set were removed.

### Mobile Header (overflow-safe)

The authed `Header` (`src/components/Header.tsx`) packs many controls. On phones, keep the row from overflowing the viewport:

- Secondary actions (theme toggle + sync) are hidden in the bar (`hidden sm:*`) and moved into the **avatar dropdown menu** (`sm:hidden` section there).
- The Collection entry hides its streak segment below `sm`.
- There is **no** separate mobile hamburger — the avatar menu already has Theater / Library / Tags / Leaderboard / Settings.
- **Search** is a magnifying-glass icon immediately left of the avatar, and only on `/library` and `/tags`. Click expands an inline field (placeholder **Search** / **Tags**). Hidden on Settings, Leaderboard, Admin, etc. so the bar stays logo-left / avatar-right. Library search writes `/library?search=`; `/tags` dispatches `tags-search` and does not touch the URL.

When adding header controls, verify the cluster's minimum width still fits ~360px (macOS Chrome won't render below ~500px, so measure item widths in the DOM rather than trusting a visual check).

### UI Patterns

**Mobile Input Zoom Prevention:**
iOS Safari auto-zooms when focusing inputs with `font-size < 16px`. Use responsive classes to maintain 16px on mobile while allowing smaller fonts on desktop:

```tsx
// ❌ Causes zoom on iOS
className = 'text-xs ...'

// ✅ 16px on mobile, 12px on sm+
className = 'text-base sm:text-xs ...'
```

**Theater keyboard (desktop power users):**
The library grid and Settings bind **no** keys. The theater keymap lives in `src/components/theater/theater-shortcuts.ts` (`resolveTheaterShortcut`, `THEATER_SHORTCUT_KEYS`) and `useTheaterKeyboard`:

- Navigate: `→` `J` next, `←` `K` previous, `↓` `↑` scroll text/articles (they do not change posts)
- Theater: `1` Live, `2` Saved (signed-in personal theater and signed-in shared previews; no-op signed-out / playlists). `Q` Queue (the full playlist: desktop panel / mobile up-next sheet). While it's open, `↓`/`↑` move through the list (they do not scroll the stage), Enter plays the focused row, Esc or a click outside closes. Live and Saved queue types (Videos / Photos / Text, with articles included in Text) are a multi-select in Queue / the up-next sheet, persisted as `adhx-theater-types`. Playlists omit the pills. The playlist is always a LIFO queue (newest `addedAt` first). Repeat off plays unseen only (`N in queue`). Repeat all is the playlist size (`N on repeat`). Repeat this post is `1 on repeat`. A new post goes to the top: play immediately if caught up, otherwise Next after the current post ends. Repeat-off Queue has Now playing, Next (what's left to play), and Seen. Repeat is Now playing and Next only. An active filter keeps the toggle labelled Queue and adds a clay ListFilter cue (types stay in the overlay; hover title still names them)
- Playback: `Space` play/pause (`theater-toggle-play` — video stages and the 10s timed dwell on photo/text/article), `M` mute, `E` expand (hide/show chrome), `R` cycle repeat
- Actions: `S` Save, `T` Tag (picker autofocuses the new-tag field; arrows move the list, Space/Enter toggle a row; Enter in the field creates, assigns, and closes), `L` copy link, `C` copy text, `D` download/send, `O` open original, `F` Read / Watch, `A` Archive (collection), `U` undo Archive
- Also: `.` menu (arrows / J K move, Enter opens the focused item), `Q` Queue, `W` Re-watch all (caught-up: unmarks the playlist, starts the newest post, Repeat stays off; finished posts go to Seen), `P` Keep playing (caught-up stage), `?` (Shift+/) help overlay (`TheaterShortcutsHelp`), `Esc` close help / Queue / collection
- Paste a link is the OS shortcut (`⌘V` / `Ctrl+V`) — the chrome listens for the `paste` event, not a keydown

Action keys dispatch `theater-*` window events; each chrome clicks the matching `[data-theater-action]` control and no-ops when that surface is CSS-hidden (`lg` split). Overlays (sign-in, tag picker, avatar menu, Queue, help) stop `THEATER_SHORTCUT_KEYS` so they don't drive the stage.

**Cross-Component Keyboard Feedback:**
When keyboard shortcuts need to trigger UI in child components, use custom events:

```tsx
window.dispatchEvent(new CustomEvent('theater-toggle-play'))

useEffect(() => {
  const handler = () => triggerAnimation()
  window.addEventListener('theater-toggle-play', handler)
  return () => window.removeEventListener('theater-toggle-play', handler)
}, [])
```

This avoids prop drilling and keeps keyboard logic centralized while allowing distributed UI responses.

### Home routing & the Theater (`/` is the theater, signed in or out)

**Terminology (owner decision):** a **playlist** is a single shared tag — the thing at `/t/{username}/{tag}`, the thing `/leaderboard` ranks, the thing you clone with **Save playlist**. A user's own pile of saved posts is **Saved** (the theater tab at `/saved`; `/collection` 308s there). The grid that browses it is the **Library**. Keep those three words straight in UI copy: playlist = one shared tag, Saved = your saves, library = the grid over them. APIs, DB columns (`collection_events`, `tag_shares`) and the `/api/collections/*` endpoints still say "collection" — they're indexed, in sitemaps, and public contracts.

**Which timestamp a surface shows.** Three different questions, three different answers — do not unify them:

| Surface                     | Time shown                                      | Source                                                                                    |
| --------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Live / trending (community) | when the post first entered ADHX, by anyone     | `getTrendingItems`' `addedAt` = MIN(earliest saver's `processedAt`, first activity event) |
| Saved, `/library`           | when **this** user saved it                     | their own `bookmarks.processed_at`                                                        |
| A playlist (`/t/{u}/{tag}`) | when the curator added the post **to that tag** | `bookmark_tags.created_at`                                                                |

Owner rule: on a user-owned surface the user's own timestamp always wins, even when the post entered ADHX earlier via somebody else — "users get control over when they are creating things that are related to them". `bookmark_tags.created_at` exists precisely because "saved it" and "curated it into this playlist" are different events, often months apart; it's nullable (added to an existing table) and `migrate.ts` backfills old rows from the bookmark's save time, which is what readers also fall back to. Never the source platform's publish date, anywhere.

**Routes:**

| Route         | What renders                                                                                 |
| ------------- | -------------------------------------------------------------------------------------------- |
| `/`           | signed-out: public live theater + crawlable static list. Signed-in: **redirects to `/live`** |
| `/live`       | signed-in Live tab (community pulse) — unseen newest-first. Signed-out: redirects to `/`     |
| `/saved`      | Saved — your unread queue as a playlist. Library card taps / `?open=` land here              |
| `/collection` | 308 → `/saved` (legacy URL)                                                                  |
| `/library`    | the grid: `AuthedHome`, three view modes, FilterBar, search, tags                            |

The Live ⇄ Saved switch is a pair of ROUTES (`/live` ⇄ `/saved`), not local state, so each side is linkable and survives a reload — `TheaterShell`'s `onPersonalTabChange` flips the tab locally (instant) then the page navigates. A Live caught-up stay (`waiting`) survives that flip so coming back does not keep playing the Saved clip on the shared `<video>`. `theater-resume` still fires for Saved, but StageVideo no-ops while `covered` (Live waiting / Saved All Clear / a non-video stage). Live auto-advance (`onEnded` / `theater-advance`) marks the leaving post seen — clips shorter than the 2s dwell used to stay unseen. Saved All Clear is a z-10 overlay; `<Stage/>` stays mounted (`covered`) so the iOS unmute grant survives. A Saved prepend after All Clear jumps to index 0 (not `length + 1`). Live Save prepends with `idPlatform`, same as paste. Read (`articleMode`) resets on the staged identity, not `personalIndex`. Live poll runs as soon as `live` becomes true. Repeat/queue-type prefs, membership lookup, and transport live in dedicated hooks. Live and Saved are the same LIFO playlist: newest ADHX `addedAt` first; Repeat off plays unseen only; a new post is Next unless already caught up. Queue headings are Now playing / Next, plus Seen when Repeat is off. Live `replaceState`s the address bar onto the staged post (same as signed-out `/`); Saved stays on `/saved`, and flipping back writes `/saved` even if Live left a preview path in the bar. `TheaterShell` snapshots `personalItems` at mount, so `/saved` fetches the queue BEFORE mounting the shell; `/live` never waits on it. Saved opens newest-first (`?open=` still wins via `preserveSavedStart`). Signed-in `/` is Live (the hook after a preview); `/saved` is the unread pile you come back to.

**Gotcha:** anything that used to link to the grid with `/` or `` `/?tag=…` `` is now wrong — `/` is the theater. `AuthedHome`'s own URL syncing hit this (five `router.replace` calls whose "no query string" fallback was a hardcoded `'/'`, which bounced `/library` straight home; they take `usePathname()` now), as did "Manage playlist", "Your collection" in the avatar menu, the `/tags` poster cards, and "Make your own playlist". Use `/library` for grid destinations.

`src/app/page.tsx` is a **server component** (`force-dynamic` — reads cookies + SQLite). The theater spec is `docs/specs/theater-first.md`. The theater is a full-bleed near-black stage (`#08070a`, both themes) + viewport-responsive chrome, built from `src/components/theater/`:

- `TheaterShell` (`fixed inset-0 z-[60]` — deliberately overlays the global Header since AppShell can't see auth; revisit in Phase 3) owns current-item state, keyboard (`useTheaterKeyboard` + Shift+? `TheaterShortcutsHelp` — see "Theater keyboard" above), the 2s-dwell seen-marking + `POST /api/activity/preview` pulse, and prefetch-next. Desktop (`lg+`) mounts `DesktopStageChrome` (overlays: top bar with brand + LIVE/tabs + a paste button that expands into the preview field, ⌘V still works globally — on signed-in Live / Saved paste **adds in place** and stays on `/live` or `/saved`, it does not navigate to a preview page — same-tab paste plays the new post immediately and the interrupted clip is Next; if the Queue type filter would hide the new post it resets to All (same reset on a second window's `tweet-added`); a second-window add is Next while you stay on Live — flipping to Saved starts newest-first; changing Videos while a text post is on stage snaps to a matching post or caught-up, never a blank stage; Saved Queue marks Watched only for posts actually left this session (a second-window prepend and rows skipped by Videos are not Watched); playlist mode has no paste; avatar stays top-right; flame chip left of paste on every post type (never next to the author); caption overlay; bottom actions — Open is the source-platform glyph, no "Open" label) + `DesktopDock` (bottom filmstrip: 3-col transport — prev / play-pause / next over expand / repeat / mute — plus horizontal queue cards auto-scrolled to keep current visible, compact playlist/count and filter controls matching mobile, and a "Queue" panel reusing `UpNextList` with Live / Saved type pills: All / Videos / Photos / Text, where Text includes articles; playlists omit the pills). The de-clutter restore (Minimize2) floats bottom-left, never top-right. Mobile (<lg) mounts `TheaterMobileChrome` (top/bottom scrims, a joined right-side swipe capsule, a frosted post-action rail, and a bottom bar with Queue/filter plus transport/audio/repeat/focus; the same queue pills sit above the up-next list). The platform+added-to-ADHX chip is gone from stage chrome (nobody cared about when it landed here); filmstrip / Up-next still show `addedAt`. Shared wiring lives in `SavePostButton`, `TheaterCollectionActions`, `TheaterMetaChips`, `TheaterTagCount`, `useTheaterCopy`, `useTheaterStageEvents` — do not copy those back into either chrome.
- `TheaterAvatarMenu` (mounted in the top bar/scrim by both chromes) is authed-only by default — signed in: the account dropdown (**Theater** with the Radio icon + same 13px row as Library; **Live** / **Saved** indented under it with their own icons; then Library / Tags / Leaderboard / Settings / sign out). Desktop also keeps the top-bar Live ⇄ Saved pill; both chromes pass `theaterTabs` so `.` + arrows can pick those tabs. Callers that pass `allowSignedOut` get a burger-menu fallback (Menu icon, same slot/geometry) for signed-out visitors instead of nothing: **Theater** (closes the menu if already on `/`, else links home) / **Leaderboard** (`/leaderboard`) / **Sign in** (fires `onRequestSignIn`, wired to the shell's existing `openSignIn`/save-post sign-in-modal flow). Only the home/shared-mode mounts pass `allowSignedOut` — the collection theater is always reached authed, and collection mode's own "Make your own" CTA is its signed-out conversion path, so neither does.
- Feed = `getTheaterFeed()` (`src/lib/theater/feed.ts`): `getTrendingItems()` + public-tag backfill when < 12 items. **Seed limit must match `/api/activity`'s LIMIT (30)** or the first poll surfaces old items as "fresh". Crawlable SEO content is server-rendered by `TheaterStaticList` (sr-only list + CollectionPage/ItemList JSON-LD + hero copy).
- Seen model: `adhx-seen-v1` remains the readable 500-key localStorage projection, while immutable V2 per-key/batch operations are the cross-tab authority (newest 500 marks + 500 tombstones). Bulk Re-watch is one atomic batch; storage events coalesce and recompute current authority, so tabs never write stale snapshots. Existing V1 arrays migrate once; a tab still running pre-V2 code must reload before later seen changes can propagate. `adhx-last-visit` is still written on pagehide/hide only → "N new since your last visit" divider in `UpNextList`. Zero per-user server cost.
- Playback: `usePlaybackSource` → `reelVideoSrc` (video-src SSOT). Twitter/TikTok play via the intentionally persistent `StageVideo`; every async `play()` result and native media event is source-generation/lifecycle guarded, so a superseded clip cannot mute, replay, error, or advance its replacement. **Never key/remount this video element** — iOS grants unmuted playback to the element. **Instagram** uses `StageInstagram` (Range-probe the mirror before attaching `<video src>` — cold cache; IG-embed fallback); **YouTube** uses `StageYouTube` (nocookie iframe, concrete-height box); **X Articles** use `StageArticle` (splash is tweet-style author row — avatar + name + `@handle`, tappable to the author's profile — plus the headline; no ARTICLE chip. Body = `article.content` from `/api/share/tweet/{author}/{id}`, rendered by the dependency-free parser in `src/lib/theater/article-markdown.ts`). **Off-site link tweets** (Substack/Medium/…) stay on `StageText` with a `StageLinkCard` — do not send them to `StageArticle` (there is no X Article body; the OG thumbnail is not a tweet photo). Text/quote stages use the same tappable `StageAuthorRow` and a full-height reader: parent text + parent photos/video + the **full** quoted tweet (text and photos/video — never a 4-line clamp). A short tweet floats in the middle of the stage; a long one starts below the chrome (`STAGE_TEXT_TOP_PAD`) and scrolls. Photo+quote and video+quote default to full-bleed parent media with a 2-line caption; multi-photo and multi-video tweets snap sideways (a frost pill overlaid on the painted bottom of the clip — object-contain, so letterboxed Watch on a phone still sits on the picture, not the peek bar — tap it for the next clip; tap the right/left third also works), not first-item-only. Twitter albums use `/api/media/video?index=` (1-based, same as photos). The last clip’s `ended` advances the queue; earlier clips advance the album. **Read** (also for any overflowing caption) opens the stacked article — photo albums seed every still from `photoCount` (Saved / shared preview) so the essay shows the full set immediately; a playing video album keeps its snap chrome in the top band with the same on-picture pill. A playing parent video stays mounted in a top band so it continues while you read (never fade/blur the clip — `StageArticleVideoFade` is a stage-black gradient in the strip _below_ it so the essay can tuck under; isolate the stage so the band's `z-20` stays under chrome `z-10`); **Watch** (`TvMinimalPlay`, not Film) goes back to full-bleed. The Tag button carries a count of tags on the post (max 5); assigned tags sort to the top of `TagQuickPicker`. Playback defaults muted unless the account's **Sound on by default** preference is enabled. That preference is server-backed with a local browser fallback; a current-tab mute/unmute still wins. Mobile may reject audible autoplay on a fresh document, so the next stage tap retries the preferred unmute inside the user gesture. Sound uses the dock/peek-bar audio button (always present, disabled on non-video; pulsing while muted on video) — tap no longer unmutes. A tap on the video or photo hides chrome and starts playback; tapping again restores overlays without pausing (pause is the peek-bar / dock button or Space). Playback state driven by media events (`onPlaying`/`onCanPlay`), never by racing `play()` promises against `autoPlay`.
- Mobile (<lg) is the reel: full-viewport stage, top/bottom scrims, and a bounded right-side thumb zone (`useMobileSwipeNavigation`) where swipe up/down moves next/previous. The up/previous and down/next tap fallbacks are two halves of one frosted capsule; a swipe may start anywhere inside it. Bounding the gesture surface preserves article scrolling, album swipes, links, and embedded-player controls across the rest of the stage. Save/Tag/Archive, Share, and Open form a frosted rail immediately above the capsule (one horizontal row on short landscape viewports). Share opens a keyboard-isolated, type-aware menu: Copy text/article only when text exists; Download + native file Share only for sendable media; Share link always. The rail Share glyph flashes a green tick only after the selected action succeeds, then resets automatically and on post changes. Explicit downloads use attachment endpoints, while native file sharing keeps the prefetched-blob path. Repeat-off keeps session back-history so up can rewatch the post just left, and every resolvable direct shared-post landing visibly starts as Repeat one. Tapping Repeat or deliberately moving to another post promotes the queue to Repeat all. The bottom bar makes playback the stable hierarchy: the playlist button shows how many posts will play plus a separate unseen badge; Filter opens a compact counted type picker without expanding the playlist; mute/unmute, prominent play/pause, repeat, and focus stay grouped right. Repeat-one text/photo posts retain the playback button in its disabled state instead of shifting the group. Tapping a stopped video starts it and enters focus; tapping a playing video never pauses it. Focus/de-clutter hides the post-action rail, capsule, and scrims while the bottom transport remains visible as the exit path; invisible swipe navigation still works, and a tap in the zone also restores the chrome. Pressing Focus while Up next is open closes the sheet and enters de-clutter in one action. When Up next expands, post actions move onto its top edge instead of disappearing. The 70%-of-theater sheet is overflow-clipped and does not focus a queue row on open (that panned iOS and hid the Live type pills). The bottom scrim is `pointer-events-none` except the caption (media) and action rail, so article/tweet body still scrolls in the empty caption zone. Text/article/quote scrollers use `STAGE_TEXT_SCROLL_PAD` so the last lines can sit above the action rail + peek bar. `/trending/play` 307s into the theater.
- Send-the-file: `useSendFile` (2s-delayed MP4 blob prefetch so `navigator.share` opens in-tap on iOS; `files` + `text: "via <url>"`, never a `url` key with `files`; desktop falls back to download). **It's mounted on both desktop dock and mobile chrome** — the module-level in-flight dedupe in `useSendFile.ts` is what stops every MP4 downloading twice; keep it.
- **Preview pages ARE the theater** (Phase 3): the preview routes keep crawler SEO in `generateMetadata` (that path still awaits the upstream). The **page RSC does not wait** on FxTwitter / a scrape / oEmbed — it paints a URL stub + TheaterShell immediately and passes a `sharedResolve` Promise (`src/lib/theater/resolve-shared-preview.ts`). JSON-LD + `SharedPostStatic` stream in a Suspense sibling; TheaterShell `replaceItem`s the stub in place. Tweets show `StageResolving` until the kind is known; Instagram `/p/` stubs are photo stages, while Reels / TikTok / Shorts are already video. Instagram posts/Reels, TikTok, and Shorts share `SharedPreviewPage` + `getSavedPreviewDisplay` + `recordHumanPreview`. `buildSharedSeed()` (`src/lib/theater/shared-seed.ts`) pins the shared post as the lead item and copies pulse-only `addedAt` / `saveCount` / `trendCount` onto it so the flame chip shows on first paint. Shared-mode Queue uses the same Now playing / Next LIFO list; every resolvable opened post starts in **Repeat one**, signed in or out. Tapping Repeat promotes the full current queue to **Repeat all**. Deliberately moving to another post releases the landing exemption and promotes the remaining queue to Repeat all; the opened lead cannot replay through Prev once released. "More being sent right now" header, authed Save POSTs `/api/bookmarks/add` with a `sourceUrl()`-reconstructed canonical URL (NOT `item.url`, which for pulse items is the on-ADHX preview path). Shared chrome uses the shell's live auth state after an in-place sign-in, and cross-tab add/delete events update Save/Tag membership without stale ownership lookups; archive removes queue position but preserves membership. A signed-in new-open still autosaves the lead. Signed-in previews keep shared Save/Tag + paste chrome, and also get the Live ⇄ Saved cluster (Live is current; Saved → `/saved`; Close → `/library` on desktop). Mobile omits Close — the avatar menu already sits top-right and has Library. Do **not** pass `personalChrome` here, or the shared Save pill becomes the live-tab pair. The `*PreviewLanding` components were unmounted then deleted (dead-code cleanup, 2026-08-21).
- **Unresolvable shared source (TASK 3)**: when FxTwitter returns null (401/404 — deleted, private, or suspended) the page has already painted the theater on a URL stub. The resolve Promise settles `{ ok: false }`; TheaterShell then treats the lead as `sharedUnavailable` and swaps in `StageUnavailable` (`StageFrame` + platform glyph + `@author` + a platform-named "no longer available on {X/YouTube/…}" line — no retry/save/X-connect CTA). The shared-post-repeat pin drops so the stub's `'timed'` progress kind auto-advances into the live pulse. `generateMetadata` still returns a minimal `robots: { index: false }` tombstone with no fabricated OG image/video. Reels/TikTok/Shorts pages never had this bug — they always render the theater regardless of resolution success, degrading display fields to null rather than branching to a landing page. **Admin hide** (`moderated_posts`) uses the same stage with `sharedUnavailableReason="hidden"`: "This post was removed from ADHX" + a one-line "no longer on preview pages or the live feed" — never "unavailable on X", because the source (a Short, a Reel) is often still up. Admin hide is known before any proxy, so that path still passes `sharedUnavailable` on the first paint.
- **/trending is the dark ranked list** (`src/components/trending/TrendingRankedList.tsx`): rank by `trendCount` desc, recency tiebreak — deliberately different from the theater dock's recency order. Hubs keep their sr-only list + JSON-LD untouched; `DiscoverFeed` was unmounted from the hubs then deleted (dead-code cleanup, 2026-08-21) — its `ActivityItem` type now lives in `src/components/discover/types.ts`. Never import from `TrendingStaticList.tsx` into a client component — it transitively pulls better-sqlite3 into the client bundle. `/trending/archive` and `/trending/archive/[week]` use the same dark chrome + numbered rows (`TrendingListHeader` / `TrendingRankedRow`); a week page is a frozen snapshot (no live poll, no filter pills).
- Every theater and non-theater route uses the same dark Matter palette; legacy stored theme choices are ignored.

### Main Feed (`src/app/AuthedHome.tsx`)

The authed library (moved verbatim from the old client `page.tsx`). Client component with:

- **FeedGrid** (`src/components/feed/FeedGrid.tsx`): three view modes toggled in the FilterBar — **grid** (masonry via CSS columns, `FeedCard`), **list** (dense rows, `FeedListRow`), **bento** (mixed-size mosaic, `FeedBentoTile`). Infinite scroll via an `IntersectionObserver` sentinel.
- **Focus / Saved**: there is **one** personal theater, at `/saved` (`AuthedTheater` + `TheaterShell mode="personal"`). The library grid does **not** overlay a second shell — a card tap / leftover `?open=` / `?collection=1` navigates there (`collectionPath()`, start index or prepend). AuthedTheater fetches the active queue at the API cap (`limit=100`) before mount; a failed fetch is an error + Retry, not a fake all-clear. Actions match Live (Download for video/photo / Copy for tweet/article / Link / Tag / Open) plus **Archive** (left of Download; clay outline, not a filled CTA). Copy on an article writes the full markdown body from `/api/share/tweet`, not just the title. Icons still distinguish kind (film/image/copy/file-text). (POST `/api/bookmarks/[id]/read?platform=`, then the post is REMOVED from the queue; `notifyCollectionChanged({ removed })` so Header + `/library` refresh and other open Saved windows splice that identity out of their mount snapshot. Paste/save sends `{ added }` the same way so other theaters prepend without stealing the current post — same-tab `tweet-added` is skipped when the caller already placed the row. Pasting a type that the Queue filter would hide resets the filter to All. `tweet-added` is BroadcastChannel'd via `src/lib/client-events.ts`). No Later or Delete. Identity is `(platform, id)`. Archive is **private** (no public `read` pulse). Keyboard is the shared theater map (`A` Archive, `U` undo, `Esc` close — see "Theater keyboard" above). The library itself binds no keys. Videos auto-advance on end; photos, text, quotes, and articles use the same 10s dwell as Live (Repeat still applies). End-of-queue shows `CollectionAllClear`. **Saved ↔ Live** is a pair of routes (`/saved` ⇄ `/live`). Signed-in `/` redirects to `/live`; signed-out `/live` bounces to `/`. The signed-in Live tab rewrites the address bar like signed-out `/`; Saved stays on `/saved` (and replaceStates back there when you leave Live). The old `CollectionTheater`/`CollectionRail`/`TriageMode`/`AddTweetModal` are DELETED.
- **FilterBar**: category filters + **platform filter** (All / X / Instagram / TikTok) + view toggles + tags. **Show archived** lists archived posts only (`GET /api/feed?archivedOnly=true`); it is not “include archived”. Tag views and add-to-tag still fetch the whole set (`hideArchived=false`). Sticky at `top-16` so it sits under the Header (`h-16`); `top-0` hid the selected-tag chrome (Done adding) under the header on scroll.
- **Nav**: the top bar carries **Library · Theater · Tags · Leaderboard**. Theater / logo `/` lands signed-in users on `/live`; Saved is `/saved`; Library is `/library`. Trending was removed from the authed nav — the public `/trending` SEO routes are untouched. The `+` Add button is gone: adding by URL is paste-first via `PasteToPreview`. Search is an icon left of the avatar on `/library` and `/tags` only (click to expand; placeholders Search / Tags).
- **FeedCard**: tweet-style per-type cards with a `PlatformChip` + `TimePill`; non-Twitter items show their platform glyph.
- **No gamification.** The streak card, its API route and the flame badges were REMOVED (owner: "we don't want to gamify things — we've added that with the leaderboard"). Don't reintroduce a streak.

### Quote Tweet Handling

Quote tweets display embedded content showing the quoted tweet. Two data sources:

- `quotedTweet`: Full `FeedItem` when the quoted tweet exists in user's collection
- `quoteContext`: Fallback JSON blob with basic info (author, text, thumbnail) when not in collection

**Rendering:** quotes use `StageText` (via the shared `Stage`) on every theater surface including Saved. Gallery cards render quote context inline. Historical note: an older `Lightbox.tsx` with `Q`/`P` quoted/parent keyboard navigation and `R`/`U` read keys no longer exists — the focus surface went `TriageMode` → `CollectionTheater` → `TheaterShell mode="personal"`; none ever carried those bindings, so don't "restore" them from stale docs.

Files:

- `src/components/theater/StageText.tsx` - quote + parent text on the theater stage
- `src/components/feed/types.ts` - FeedItem.quotedTweet, FeedItem.quoteContext types

### Playlists (shared tags) with Friendly URLs

A playlist is one tag, shared publicly at a human-readable URL:

- **URL format**: `/t/{username}/{tag}` (e.g., `/t/you/claude-code`)
- **Route**: `src/app/t/[username]/[tag]/page.tsx`
- **API**: `src/app/api/share/tag/by-name/[username]/[tag]/route.ts`

**Sharing flow ("Share as theater"):**

1. User selects a tag in the FilterBar Tags dropdown → a selected-tag toolbar shows (count, Public chip, **Share as theater**)
2. Share as theater PATCHes `/api/tags` (make public), copies the friendly URL, shows a "… copied" chip
3. `/t/{username}/{tag}` renders the **playlist theater**: `TheaterShell mode="playlist"` seeded with the tag's posts — the queue **loops** (wrap on next/prev and video-ended; dashed "LOOPS" divider + ghosted first card in the desktop dock; no StageWaiting, no paste-to-preview, no /api/activity polling, no address-bar rewriting). SEO is preserved: generateMetadata + CollectionPage JSON-LD + sr-only item list; private/unknown tags 404/noindex exactly as before.
4. **Save playlist · N** is the conversion CTA (`SavePlaylistButton`): authed → POSTs the clone endpoint; signed-out → opens `SignInModal` (returnTo `/t/{user}/{tag}?save=1`, which auto-clones once after sign-in and strips the param)
5. Seed conversion lives in `src/lib/theater/tag-seed.ts`; loop math (`computeLoopedNext/Prev`) is exported from TheaterShell and unit-tested

**Clone endpoint**: `/api/share/tag/by-name/[username]/[tag]/clone`

- Copies all bookmarks, media, and links to the cloning user's account
- Adds the tag to all cloned bookmarks
- Skips bookmarks the user already has

### Tag Sanitization

Tags are sanitized before storage to ensure URL-safe, consistent naming:

- **Utility**: `src/lib/utils/tag.ts`
- Lowercase conversion
- Invalid characters replaced with hyphens
- Multiple hyphens collapsed
- Leading/trailing hyphens removed
- Maximum 15 characters (truncated, not rejected)
- Maximum 5 tags per post (`MAX_TAGS_PER_POST` — theater Tag button shows this count; POST `/api/bookmarks/[id]/tags` returns 400 past the cap)

```typescript
import { sanitizeTag } from '@/lib/utils/tag'

sanitizeTag('Test Tag!') // → 'test-tag'
sanitizeTag('Claude Code') // → 'claude-code'
sanitizeTag('AI/ML') // → 'ai-ml'
```

**UI Preview**: The `TagInput` component shows a real-time preview of the sanitized tag as users type (e.g., "Test Tag!" → "→ test-tag").

### Landing Page Optimization

Signed-out `/` now renders the theater (see "Home routing & the Theater" above); `LandingPage` remains as `AuthedHome`'s client-side fallback when a session turns out to be invalid. Unauthenticated visitors still trigger no authenticated API calls:

- `page.tsx` branches on `getCurrentUserId()` server-side, so the feed fetch never runs signed-out
- `Header.tsx` only fetches stats/cooldown after auth is confirmed
- `preferences-context.tsx` checks auth status before fetching preferences

This prevents 401 errors in server logs when visitors view the public homepage.

### Shared Types (`src/components/feed/types.ts`)

Centralized type definitions including:

- `FeedItem` - Full bookmark data for display
- `StreamedBookmark` - Lighter type for sync SSE events
- `streamedBookmarkToFeedItem()` - Conversion helper

### Feed API Performance

The feed API (`/api/feed/route.ts`) uses optimized SQL queries to avoid N+1 problems:

- Single query fetches bookmarks with tags via SQL subquery
- Media and links fetched in bulk with `IN` clause
- Read status joined efficiently

```typescript
// Tags fetched via subquery (avoids N+1)
const tagsSubquery = db
  .select({
    bookmarkId: bookmarkTags.bookmarkId,
    tags: sql<string>`GROUP_CONCAT(${bookmarkTags.tag})`.as('tags'),
  })
  .from(bookmarkTags)
  .where(eq(bookmarkTags.userId, userId))
  .groupBy(bookmarkTags.bookmarkId)
  .as('tags_agg')
```

### Media Handling

FxTwitter (`api.fxtwitter.com`) provides reliable media URLs (Twitter has CORS issues).

- **Videos**: `/api/media/video?author=xxx&tweetId=xxx&quality=preview|hd|full`
- **Photos**: `https://d.fixupx.com/{author}/status/{tweetId}/photo/{index}` — theater stage loads these via `/api/media/image` (pbs.twimg.com hotlinks 403 off twitter.com)

**Video Quality Levels:**

| Quality   | Resolution | Bitrate  | Use Case                             |
| --------- | ---------- | -------- | ------------------------------------ |
| `preview` | 360p       | ~832kbps | Gallery hover preview                |
| `hd`      | 720p       | ~2Mbps   | Focus mode playback, mobile download |
| `full`    | 1080p      | ~10Mbps  | Desktop download only                |

**Video Playback UX Patterns:**

| Context       | Attributes                           | Behavior                 | Why                             |
| ------------- | ------------------------------------ | ------------------------ | ------------------------------- |
| Gallery hover | `muted autoPlay loop playsInline`    | Silent auto-preview      | Quick browse without disruption |
| Focus mode    | `controls playsInline` (no autoPlay) | Click to play with sound | Full viewing experience         |

**Browser Autoplay Policy**: Modern browsers block autoplaying videos with sound. Gallery works because it's `muted`. Focus mode removes `autoPlay` so users click play and get sound immediately - this is intentional UX, not a workaround.

**HLS Streaming for Long Videos:**
Videos >5 minutes use HLS (HTTP Live Streaming) to avoid Fly.io's 60-second proxy timeout:

- `src/app/api/media/video/info/route.ts` - Determines playback strategy (MP4 vs HLS)
- `src/app/api/media/video/hls/route.ts` - Proxies m3u8 playlists, rewrites URLs
- `src/app/api/media/video/hls/segment/route.ts` - Proxies video/audio segments
- Theater playback is `StageVideo` (MP4 proxy). The HLS routes stay for long videos; `StageVideo` does not mount HLS.js.

**Why HLS proxy?** Twitter's video CDN (`video.twimg.com`) returns 403 for direct browser requests. Our server proxies with proper `User-Agent` and `Referer` headers.

**Browser HLS Detection Gotcha:**

```typescript
// ❌ Wrong: Chrome on Mac returns truthy but can't play HLS natively
const canPlay = video.canPlayType('application/vnd.apple.mpegurl')

// ✅ Correct: Explicit Safari detection
const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
const canPlayHlsNatively = isSafari && video.canPlayType('application/vnd.apple.mpegurl')
```

**Video Downloads:**

- Desktop: `/api/media/video/download` endpoint with `Content-Disposition: attachment` for instant browser download with progress bar
- Mobile: Limited to 50MB (HD quality check). Shows friendly "too thicc for your phone" message via `VideoDownloadBlocked` component when exceeded
- Size estimation: `duration × bitrate / 8` (returned by `/api/media/video/info`)

Key files:

- `src/lib/media/fxembed.ts` - FxTwitter API types and URL builders
- `src/app/api/media/video/route.ts` - Video proxy with quality selection
- `src/app/api/media/video/download/route.ts` - Streaming download endpoint
- `src/components/theater/StageVideo.tsx` - Theater MP4 playback
- `src/components/feed/utils.tsx` - `VideoDownloadBlocked` shared component, `handleShareMedia`
- `src/components/feed/FeedCard.tsx` - Gallery video preview (muted autoplay)

### Database (SQLite + Drizzle)

Database location: `./data/adhdone.db`

**Multi-user schema with composite primary keys:**

| Table                   | Primary Key                           | Description                                                                                                                                                                                                                   |
| ----------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bookmarks`             | `(userId, platform, id)`              | Main bookmark data — same source id can exist for multiple users AND across platforms (tweet 123 ≠ tiktok 123)                                                                                                                |
| `bookmark_tags`         | `(userId, platform, bookmarkId, tag)` | Tags are per-user, per-platform                                                                                                                                                                                               |
| `bookmark_media`        | `(userId, platform, id)`              | Media attachments                                                                                                                                                                                                             |
| `bookmark_links`        | `id` (auto) + `userId` + `platform`   | URLs with enrichment data                                                                                                                                                                                                     |
| `archived_posts`        | `(userId, platform, bookmarkId)`      | Archive (was `read_status`)                                                                                                                                                                                                   |
| `user_preferences`      | `(userId, key)`                       | User settings (theme, font, etc.)                                                                                                                                                                                             |
| `users`                 | `id`                                  | First-class accounts (unique `username`, display name, avatar, email). X-first users keep `id == X user id`; email-first users get `u_<hex>`                                                                                  |
| `user_identities`       | `(provider, providerId)`              | Linked sign-in methods per user — `'x'` (X user id) and `'email'` (lowercased address) → `userId`                                                                                                                             |
| `login_tokens`          | `tokenHash`                           | Magic-link tokens (sha256 hash only, 15-min expiry, single-use, intent `signin`/`change`)                                                                                                                                     |
| `oauth_tokens`          | `userId`                              | Twitter OAuth credentials                                                                                                                                                                                                     |
| `sync_logs`             | `id` + `userId`                       | Sync history per user                                                                                                                                                                                                         |
| `tag_shares`            | `(userId, tag)`                       | Public tag sharing settings                                                                                                                                                                                                   |
| `activity`              | `id` (auto)                           | Append-only public activity pulse — anonymous event log (`userId` stored but never exposed; `author_avatar_url` added via guarded ALTER in `migrate.ts`). Not user-owned content, so exempt from the composite-key convention |
| `analytics_events`      | `id` (auto)                           | Private growth log (saves/views/shares/tags/archive/auth/…). `userId` stored, never selected by `/api/analytics`. Exempt from composite-key convention. 90-day prune in `migrate.ts`                                          |
| `moderated_posts`       | `(platform, bookmarkId)`              | Admin hide: tombstones preview pages + blocks new pulse writes. Retains a nullable content-type route hint for unknown `/p/` posts. Does not delete bookmarks.                                                                |
| `user_bans`             | `userId`                              | Banned accounts: session treated as signed-out; public profile/playlists 404; leaderboard skips them. Data kept for unban.                                                                                                    |
| `admin_audit`           | `id` (auto)                           | Who hid/banned what. Never on a public surface.                                                                                                                                                                               |
| `collection_events`     | `id` (auto)                           | Retained 90-day collection view/clone detail behind finite-window leaderboards (`viewer_id` stored but never exposed; read only via `src/lib/discovery/rank.ts`).                                                             |
| `collection_aggregates` | `(ownerUserId, tag)`                  | Durable viewer-free all-time playlist counts. Updated atomically with accepted events; account guards and deletion treat the owner ID as account-linked.                                                                      |

**Why composite keys with `platform`**: Allows User A and User B to both bookmark tweet X independently (multi-user), AND lets the same numeric id exist across platforms without collision (a TikTok video id and a tweet id can both be 19 digits). `platform` is one of `twitter` | `instagram` | `tiktok`, default `twitter`. Every query that filters by `bookmarkId` must also filter by `platform`.

Schema modifications: Edit `src/lib/db/schema.ts`, then run `pnpm drizzle-kit push:sqlite`

## API Patterns

### Authenticated route

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserId } from '@/lib/auth/session'

export async function GET(request: NextRequest) {
  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  // ... query with userId filter
  return NextResponse.json({ data })
}
```

### SSE streaming

```typescript
export async function GET() {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: object) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }
      send('start', { message: 'Starting...' })
      send('complete', { stats })
      controller.close()
    },
  })
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } })
}
```

## Key API Routes

| Route                                           | Method      | Auth | Description                                                                                                                                                                                                                                                            |
| ----------------------------------------------- | ----------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/health`                                   | GET         | No   | Health check for monitoring                                                                                                                                                                                                                                            |
| `/api/activity`                                 | GET         | No   | Public anonymous activity pulse (recent previews/saves/reads/shares, no userId, `no-store`; in-process burst cache is moderation-gated)                                                                                                                                |
| `/api/analytics`                                | GET         | No   | Aggregate growth rollups (`?window=today\|week\|month\|all`) — totals, by platform, by type, top posts. Never includes userId                                                                                                                                          |
| `/api/analytics`                                | POST        | No   | Client UI events (copy / open / send / shortcut). Identifiers + allowlisted dimensions only. Same-origin + rate-limited                                                                                                                                                |
| `/api/activity/share`                           | POST        | No   | Record a send/download. Body `{ platform, id }` only — display fields copied server-side. 204.                                                                                                                                                                         |
| `/api/trending`                                 | GET         | No   | Public anonymous trending JSON (wraps `getTrendingItems`, optional `?platform=`, no userId, `no-store`) — for GEO/AI search                                                                                                                                            |
| `/api/feed`                                     | GET         | Yes  | Main feed with filtering (`?id=` returns one bookmark regardless of read state — used to open a saved tweet in the collection theater). Default hides archived; `hideArchived=false` includes them; `archivedOnly=true` is archived posts only (library Show archived) |
| `/api/bookmarks/[id]/read`                      | POST/DELETE | Yes  | Toggle read status                                                                                                                                                                                                                                                     |
| `/api/bookmarks/[id]/tags`                      | POST/DELETE | Yes  | Add/remove tags                                                                                                                                                                                                                                                        |
| `/api/sync`                                     | GET         | Yes  | SSE sync stream                                                                                                                                                                                                                                                        |
| `/api/tweets/add`                               | POST        | Yes  | Add single tweet (Twitter-only, delegates from `/api/bookmarks/add`)                                                                                                                                                                                                   |
| `/api/bookmarks/add`                            | POST        | Yes  | Platform-agnostic add — accepts X / Instagram / TikTok URLs, dispatches to the right resolver                                                                                                                                                                          |
| `/api/tags`                                     | GET         | Yes  | List user's tags with counts and share URLs                                                                                                                                                                                                                            |
| `/api/tags`                                     | PATCH       | Yes  | Toggle tag public sharing (returns `shareUrl`)                                                                                                                                                                                                                         |
| `/api/tags`                                     | DELETE      | Yes  | Delete tag from all bookmarks                                                                                                                                                                                                                                          |
| `/api/share/tag/by-name/[username]/[tag]`       | GET         | No   | View a shared playlist (friendly URL)                                                                                                                                                                                                                                  |
| `/api/share/tag/by-name/[username]/[tag]/clone` | POST        | Yes  | Clone shared tag to user's account                                                                                                                                                                                                                                     |
| `/api/share/tag/[code]`                         | GET         | No   | View shared tag (legacy random code)                                                                                                                                                                                                                                   |
| `/api/share/tweet/[username]/[id]`              | GET         | No   | Public tweet JSON API (LLM-friendly, `no-store` so moderation runs per request)                                                                                                                                                                                        |
| `/api/og/playlist/[username]/[tag]`             | GET         | No   | Dynamic 1200×630 playlist social card; public playlists get adaptive mosaics/text tiles, private/missing playlists get a generic non-identifying card                                                                                                                  |
| `/api/auth/twitter`                             | GET         | Yes  | Start X OAuth to _link_ bookmark sync (session required; unsigned → `/?auth_error=x_link_only`)                                                                                                                                                                        |
| `/api/auth/twitter/callback`                    | GET         | Yes  | X OAuth callback (browser bounce; session required to link)                                                                                                                                                                                                            |
| `/api/auth/twitter/status`                      | GET         | No   | Check auth status and refresh tokens                                                                                                                                                                                                                                   |
| `/api/media/instagram/video`                    | GET         | No   | Stream Instagram Reel MP4 inline (Range supported)                                                                                                                                                                                                                     |
| `/api/media/instagram/video/download`           | GET         | No   | Stream Reel MP4 with `Content-Disposition: attachment`                                                                                                                                                                                                                 |
| `/api/media/tiktok/video`                       | GET         | No   | Stream TikTok MP4 inline (Range supported)                                                                                                                                                                                                                             |
| `/api/media/tiktok/video/download`              | GET         | No   | Stream TikTok MP4 with `Content-Disposition: attachment`                                                                                                                                                                                                               |
| `/api/media/tiktok/thumbnail`                   | GET         | No   | Resolve + proxy a TikTok poster JPEG from `username`+`id` (via tiktxk → CDN); used by feed + Discover                                                                                                                                                                  |
| `/api/media/instagram/thumbnail`                | GET         | No   | Resolve + proxy an Instagram image/poster from `id`; `index=1..20` selects an ordered carousel slide and `download=1` serves an attachment                                                                                                                             |
| `/api/collections/trending`                     | GET         | No   | Public anonymous collection leaderboard JSON (`?window=today\|week\|month\|all-time`, wraps `getCollectionLeaderboard`, `no-store`)                                                                                                                                    |
| `/api/admin/overview`                           | GET         | Yes  | Admin-role console: site stats + analytics rollups + hidden/banned lists + audit. `?window=`                                                                                                                                                                           |
| `/api/admin/posts`                              | GET/POST    | Yes  | Admin: inspect a post (`?url=` or `platform`+`id`) / hide or restore it (writes `moderated_posts` + `activity.hidden`)                                                                                                                                                 |
| `/api/admin/users`                              | GET/POST    | Yes  | Admin: inspect a username (counts only, no email/userId) / ban or unban                                                                                                                                                                                                |
| `/api/admin/activity/hide`                      | POST        | Yes  | Admin: hide/unhide a post from the pulse (same as POST `/api/admin/posts`)                                                                                                                                                                                             |
| `/api/admin/collections/hide`                   | POST        | Yes  | Admin: hide/unhide a playlist from leaderboards (`{ username, tag, hidden? }`)                                                                                                                                                                                         |

### Discovery leaderboards (`/leaderboard`)

Public playlists (shared tags) are ranked on `/leaderboard` (+ `/leaderboard/{today|month|all-time}`;
week is the default at the bare path) — the "podium" leaderboard per
`docs/specs/discovery-leaderboards.md`. (This page lived at `/collections` until it was renamed
— that path collided with a now-deleted custom-collections CRUD API. The old
`/collections`(`/[window]`) URLs still work via thin `permanentRedirect` stubs — they're on
staging and already shipped in sitemaps. `/api/collections/trending`, the machine JSON endpoint,
was NOT renamed; the unused custom-collections CRUD is gone.) Data model: `collection_events`
keeps 90 days of timestamped detail (`view` from the `/t/{username}/{tag}` page — bot-filtered,
self-views excluded, public tags only; `clone` ×5 from the clone endpoint), while
viewer-free `collection_aggregates` preserves true all-time counts without scanning an unbounded
event log. Both are read exclusively through `src/lib/discovery/rank.ts` (the anonymity choke
point — `viewerId` is never selected; the 60s in-process cache revalidates bans, post moderation,
and hidden-playlist state on every hit; `RankMode` plumbing is reserved for
hot/rising/new). Recording writes detail + aggregate atomically via
`recordCollectionEvent()` in `src/lib/discovery/record.ts` (fire-and-forget, deduped
30min/signed-in + 60s/anon), then independently prunes detail older than 90 days through an
hourly process-local throttle; prune failure cannot roll back the accepted pair, and aggregates
are never pruned. Curator surfaces: `/api/tags` GET includes per-tag
`viewCount/cloneCount/rank` + totals; `/tags` shows a This-week summary + leaderboard promo
band; the public profile `/t/{username}` shows a stat strip + per-card stats (public-tag
aggregates only — a since-privated tag's history never leaks). The leaderboard pages are
`force-dynamic` like `/trending` — do not make them static. Signed-in visitors get the global
app Header as their chrome instead of `CollectionsBoard`'s own internal dark header (which
signed-out visitors still see, minus the "Trending posts →" link, removed in both states) —
the page checks `getCurrentUserId()` server-side and passes `authed` down.

## Environment Variables

```env
# Required
TWITTER_CLIENT_ID=
TWITTER_CLIENT_SECRET=
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Optional
SESSION_SECRET=           # For JWT signing (falls back to TWITTER_CLIENT_SECRET)
RESEND_API_KEY=           # Magic-link sign-in emails; unset in dev = links logged to server console
EMAIL_FROM=               # From address for magic-link emails (default 'ADHX <login@adhx.com>'; must be a verified Resend domain)
SENTRY_DSN=               # Sentry error tracking DSN
SENTRY_RELEASE=           # Set automatically in Docker builds
SENTRY_ENVIRONMENT=       # 'staging' or 'production' (set in fly.toml/fly.production.toml)
ADMIN_USER_IDS=           # Immutable account IDs to persist as admins on startup
ADMIN_USERNAMES=          # Strict all-match legacy bootstrap; rejected lists fail startup
TWITTER_OAUTH_REDIRECT_URI= # Overrides the OAuth callback URL (see "OAuth callback host" below). Prod only.
TRUST_PROXY_IP_HEADERS=   # Set true only behind a proxy that overwrites X-Forwarded-For/X-Real-IP; Fly uses Fly-Client-IP.
```

### OAuth callback host (the `adhx.com` → `adhtwitter.com` bug)

X has a confirmed platform bug: during the **logged-out** login flow it runs a regex that rewrites every `x.com`→`twitter.com` across the authorize URL — and it greedily catches the host inside our `redirect_uri`. Production runs on `adhx.com`, which _ends in_ `x.com`, so the callback gets mangled to the dead `adhtwitter.com` (NXDOMAIN) and login fails for anyone **not already signed into X** (incognito, fresh device, most Android-web users). Logged-in users skip that redirect, so it works for them. Percent-encoding the dots does **not** help — X decodes them back before rewriting. ([devcommunity report](https://devcommunity.x.com/t/oauth2-bug-twitter-replaces-x-com-string-in-the-oauth-redirect-with-twitter-com/232600))

**Fix:** the OAuth `redirect_uri` must use a host with no `x.com` substring. `getOAuthRedirectUri()` (`src/lib/auth/oauth.ts`) returns `TWITTER_OAUTH_REDIRECT_URI` when set, else the `NEXT_PUBLIC_APP_URL` callback.

- **Production** sets `TWITTER_OAUTH_REDIRECT_URI=https://adhx-prod.fly.dev/api/auth/twitter/callback` (in `fly.production.toml`). The Fly host has no `x.com`, so X leaves it intact. X lands the browser on `adhx-prod.fly.dev`; the callback route detects it's on the redirect_uri host (not the canonical origin) and **307-bounces to `https://adhx.com/api/auth/twitter/callback`** (carrying `code`+`state`, before consuming anything) so the session cookie is set on `adhx.com`. The token exchange uses the same `redirect_uri` X bound the code to.
- **Staging** (`adhx.fly.dev`) and **local** have no `x.com`, so the override is unset and the bounce is a no-op.
- **The exact `TWITTER_OAUTH_REDIRECT_URI` value must be registered as a callback URL in the X Developer Portal**, alongside the existing `adhx.com` / `adhx.fly.dev` callbacks.

## CI/CD & Deployment

### Development Workflow (IMPORTANT)

**ALWAYS test locally before deploying:**

1. Make changes locally
2. Run `pnpm dev` and test the feature manually in the browser
3. Verify the feature works as expected with real user interaction
4. Run `pnpm test` and `pnpm typecheck` to ensure no regressions
5. Only after local verification, create a PR

**NEVER auto-deploy to production:**

- Production deploys should be explicit, intentional actions
- Always verify on staging first (adhx.fly.dev)
- Production: `gh workflow run deploy.yml -f environment=production` (uses `FLY_API_TOKEN_PROD`) or Fly CLI

**When debugging browser features:**

- Use browser DevTools to inspect network requests and console logs
- Add temporary `console.log` statements to trace execution flow
- Test with real data, not just API responses
- Remember that React state updates are batched - effects may not run immediately

### Deployment Environments

| Environment | App         | URL          | Config File           | Volume           |
| ----------- | ----------- | ------------ | --------------------- | ---------------- |
| Staging     | `adhx`      | adhx.fly.dev | `fly.toml`            | `adhx_data`      |
| Production  | `adhx-prod` | adhx.com     | `fly.production.toml` | `adhx_prod_data` |

**Deployment flow:**

1. Code merged to main → Release-please creates version bump PR
2. Version PR merged → **Auto-deploys to staging only**
3. Verify staging works → Manual production deploy (`gh workflow run deploy.yml -f environment=production`, or Fly CLI)

```bash
# Deploy to staging (default, also triggered by release-please)
gh workflow run deploy.yml

# Deploy to production (uses FLY_API_TOKEN_PROD — staging token cannot deploy adhx-prod)
gh workflow run deploy.yml -f environment=production
# or locally:
fly deploy --config fly.production.toml --app adhx-prod

# Check deployed versions
curl -s https://adhx.fly.dev/api/health | jq .version  # staging
curl -s https://adhx.com/api/health | jq .version      # production
```

### GitHub Actions Workflows

- **CI** (`.github/workflows/ci.yml`) - Runs on PRs: lint, typecheck, test, build
- **Deploy** (`.github/workflows/deploy.yml`) - Deploys to Fly.io with environment selection (staging/production)
- **Container image** (`.github/workflows/image-publish.yml`) - Publishes public AMD64/ARM64 release images to `ghcr.io/itsmemeworks/adhx`
- **Release Please** (`.github/workflows/release-please.yml`) - Automated semantic versioning, triggers staging deploy and container publication via `workflow_dispatch`

**Important**: GitHub doesn't fire `release: published` events when releases are created with `GITHUB_TOKEN` (security measure). The release-please workflow directly dispatches both downstream workflows. GHCR creates the organization package as private on its first publication and has no visibility API; an owner must set it to **Public** once in package settings. The publish workflow verifies anonymous pulls and fails with the exact settings URL until that is done.

### Sentry Release Tracking

Deployments automatically create Sentry releases for error tracking:

- Version from `package.json` is passed as `SENTRY_RELEASE` build arg
- Commits are associated with releases for "Suspect Commits" feature
- Deploy notifications sent to Sentry after successful deployment
- **Environment separation**: `SENTRY_ENVIRONMENT` env var tags errors as `staging` or `production`
- Same Sentry project, filter by environment in Sentry UI

### Fly.io Secrets

Required secrets on **both** Fly.io apps (set via `fly secrets set --app <app-name>`):

- `TWITTER_CLIENT_ID`, `TWITTER_CLIENT_SECRET` - Twitter OAuth
- `NEXT_PUBLIC_APP_URL` - `https://adhx.fly.dev` (staging) or `https://adhx.com` (production)
- `SENTRY_DSN` - Error tracking (same DSN for both, separated by `SENTRY_ENVIRONMENT`)
- `SESSION_SECRET` - JWT signing (generate unique per environment)

GitHub Actions deploy tokens (app-scoped; staging cannot deploy prod):

- `FLY_API_TOKEN` — `fly tokens create deploy -a adhx`
- `FLY_API_TOKEN_PROD` — `fly tokens create deploy -a adhx-prod`

**Twitter OAuth**: Both callback URLs must be registered in Twitter Developer Portal:

- `https://adhx.fly.dev/api/auth/twitter/callback`
- `https://adhx.com/api/auth/twitter/callback`

### Fresh Database Deployment (Major Schema Changes)

For breaking schema changes (like switching to composite primary keys), deploy a fresh database:

```bash
# STAGING
fly machines list --app adhx
fly machines stop <machine-id> --app adhx
fly machines destroy <machine-id> --app adhx --force
fly volumes delete <volume-id> --app adhx --yes
fly volumes create adhx_data --region lhr --size 1 --app adhx
gh workflow run deploy.yml

# PRODUCTION
fly machines list --app adhx-prod
fly machines stop <machine-id> --app adhx-prod
fly machines destroy <machine-id> --app adhx-prod --force
fly volumes delete <volume-id> --app adhx-prod --yes
fly volumes create adhx_prod_data --region lhr --size 1 --app adhx-prod
gh workflow run deploy.yml -f environment=production
```

The app will initialize a fresh SQLite database with the new schema. Users will need to re-authenticate and sync their bookmarks.

## Testing

```bash
pnpm test         # Run all 943 tests
pnpm test:watch   # Watch mode
pnpm test:e2e     # Playwright against an isolated Next on :3002 (not `pnpm dev`)
pnpm test:e2e:install  # download Chromium once
```

Browser tests live in `e2e/*.spec.ts` and are **not** part of `pnpm test`. `e2e/serve.ts` migrates + seeds `data/e2e.db` (or `data/adhdone.db` on GitHub Actions) **before** spawning Next on :3002, then mints a session JWT against that file. Do not point them at the owner's `:3001` / `adhdone.db`.

Test files in `src/__tests__/`:

- `session.test.ts` - JWT session handling
- `oauth.test.ts` - OAuth PKCE flow, state management, token exchange
- `types.test.ts` - Shared type conversions
- `feed-helpers.test.ts` - Feed utilities
- `format.test.ts` - Number formatting, relative time, text truncation
- `url-expander.test.ts` - URL expansion
- `fxembed.test.ts` - FxTwitter integration
- `twitter-client.test.ts` - Twitter API client, token refresh, bookmarks fetching
- `og-image-selection.test.ts` - OG image priority selection for social unfurling
- `og-metadata-fixtures.test.ts` - OG metadata generation with real tweet fixtures
- `article-text.test.ts` - Article block to markdown conversion
- `feed-utils.test.ts` - Feed utility functions
- `proxy.test.ts` - Media proxy URL validation
- `url-prefix-route.test.ts` - URL prefix route parameter validation
- `platform.test.ts` - Platform detection (iOS/Android/desktop, SSR safety)
- `share-page.test.ts` - PWA Share Target URL parsing and redirect logic
- `sitemap.test.ts` - Dynamic sitemap generation with public tags and deduplication
- `utils.test.ts` - General utilities

API route tests in `src/__tests__/api/`:

- `setup.ts` - In-memory SQLite test database factory
- `bookmarks-*.test.ts` - Bookmark CRUD operations
- `tags.test.ts` - Tag management
- `preferences.test.ts` - User preferences
- `feed.test.ts` - Feed filtering, pagination, tag queries
- `auth-callback.test.ts` - OAuth callback handling
- `auth-status.test.ts` - Auth status and token refresh
- `sync-cooldown.test.ts` - 1-hour sync rate limiting
- `tweets-add.test.ts` - Manual tweet adding, URL parsing, categorization
- `media-video.test.ts` - Video proxy, quality selection, range requests
- `media-video-download.test.ts` - Video download endpoint, range requests, mobile limits
- `media-video-info.test.ts` - Video info endpoint, HLS detection
- `account.test.ts` - Account management (clear data, delete)
- `share-tag-clone.test.ts` - Tag sharing and cloning functionality
- `share-tweet.test.ts` - Public tweet JSON API and adhxContext enrichment
- `stats.test.ts` - User stats endpoint

All API tests verify multi-user isolation (User A's actions don't affect User B).

**Test mock pattern for `@/lib/db`**: When a route imports new exports from `@/lib/db` (like `runInTransaction`), the test mock must be updated to include them. Tests use `createTestDb()` from `setup.ts` which exposes `{ db, sqlite, close }`:

```typescript
vi.mock('@/lib/db', () => ({
  get db() {
    return testInstance.db
  },
  runInTransaction<R>(fn: () => R): R {
    return testInstance.sqlite.transaction(fn)()
  },
}))
```

Forgetting to add new exports to mocks causes silent 500 errors in tests.

## Common Tasks

### Add UI component

1. Create in `src/components/`
2. Use `cn()` from `@/lib/utils` for class merging
3. Use lucide-react for icons
4. Export from barrel file if in a subdirectory

### Database queries (Drizzle)

```typescript
import { db } from '@/lib/db'
import { bookmarks } from '@/lib/db/schema'
import { eq, and, desc } from 'drizzle-orm'

const results = await db
  .select()
  .from(bookmarks)
  .where(and(eq(bookmarks.userId, userId), eq(bookmarks.category, 'github')))
  .orderBy(desc(bookmarks.processedAt))
  .limit(20)
```
