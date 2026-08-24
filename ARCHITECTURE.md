# Architecture

A human-facing tour of how ADHX is put together. For the exhaustive,
convention-by-convention reference (security invariants, every API route,
deployment runbooks) see [`CLAUDE.md`](CLAUDE.md).

ADHX is a single Next.js 16 (App Router) + React 19 application backed by a
local SQLite database. There is no separate backend service — the Next.js API
routes _are_ the backend, and they talk to SQLite via Drizzle ORM.

## Product surfaces

| Route                                                                       | What it is                                                              |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `/`                                                                         | Signed-out public live theater. Signed-in: redirects to `/saved`.  |
| `/live`                                                                     | Signed-in **Live** tab — community pulse. Signed-out: redirects to `/`. |
| `/saved`                                                                    | **Saved** — unread queue. Signed-in default landing.                    |
| `/collection`                                                               | 308 → `/saved` (legacy URL).                                            |
| `/library`                                                                  | The **library** grid over your saves (search, tags, filters).           |
| `/t/{user}/{tag}`                                                           | A **playlist** — one public tag, looping theater.                       |
| `/{user}/status/{id}`, `/reels/{id}`, `/@{user}/video/{id}`, `/shorts/{id}` | Preview pages. They **are** the theater (shared mode), plus SEO.        |

A **playlist** is one shared tag. A user's pile of saves is **Saved**.
The grid that browses it is the **library**. Archive is private — it does not
write a public pulse.

## Data flow

Saves arrive three ways, then everything plays in one theater:

```
URL prefix / paste / share sheet / desktop extension  ──►  preview page  ──►  Save  ──►  SQLite
X bookmark sync (SSE)             ──►  /api/sync     ──►  SQLite
SQLite  ──►  /api/feed (library)  ·  theater seed (Live / Saved / playlist)
      └──►  /api/media/* proxies (Twitter / TikTok MP4; IG probe; YouTube iframe)
```

1. **Preview** — swap any supported host for `adhx.com` (or paste the full
   URL after it). The desktop extension (`extension/`) and the iOS / PWA share
   target open `/share?url=` instead; that page maps the source URL onto the
   same preview routes. Middleware (`src/proxy.ts`) 307s full-URL pastes onto
   the preview route. The page records an anonymous `preview` pulse (bots
   skipped) and renders `TheaterShell` in shared mode. The extension never
   calls the API — it only navigates the tab.
2. **Save** — authenticated POST `/api/bookmarks/add` (Twitter goes through
   `/api/tweets/add` + FxTwitter; IG / TikTok / YouTube through their
   resolvers). Writes a `save` pulse.
3. **Sync** — `/api/sync` pages X bookmarks over SSE, enriches, writes SQLite.
   Newly synced rows can pulse (capped).
4. **Watch** — Live reads `getTrendingItems()`; Saved reads `/api/feed`
   (`hideArchived`, `limit=100`); a playlist reads `getPublicTagCollection()`.
5. **Media** — Twitter and TikTok MP4s go through `/api/media/*` proxies
   (SSRF allowlists, timeouts). Instagram probes a mirror before attaching
   `<video src>`. YouTube is the official nocookie iframe.

## Auth flow

Accounts are first-class (`users` + `user_identities`). **Sign-in is
magic-link email only.** X OAuth is an optional Settings link on that
account so you can sync X bookmarks. Viewing never requires an account;
saving does.

```
Email:  POST /api/auth/email/request  ──►  link (Resend, or console in dev)
        GET  /api/auth/email/callback?token=  ──►  session cookie

X (authed):  /api/auth/twitter  ──►  X consent  ──►  /api/auth/twitter/callback
             findOrCreateUserForX(session)  ──►  encrypt tokens
             (unsigned start/callback → /?auth_error=x_link_only)
```

- Session cookie `adhx_session` is a JWT (`jose`, 30-day, httpOnly). Signing
  key is `SESSION_SECRET` (falls back to `TWITTER_CLIENT_SECRET` — set a
  distinct secret in any real deploy).
- X tokens are encrypted at rest (AES-256-GCM). Refresh goes through
  `getValidTokens()` only — the refresh token is single-use; concurrent
  refreshes are coalesced.
- `/api/auth/me` is the client source of truth (`identities.x` /
  `identities.email`, `xConnected`). A fatal X refresh deletes the X tokens
  and keeps the session.

## The URL-prefix preview trick

| Source link                     | Becomes                       |
| ------------------------------- | ----------------------------- |
| `x.com/{user}/status/{id}`      | `adhx.com/{user}/status/{id}` |
| `instagram.com/reels/{id}`      | `adhx.com/reels/{id}`         |
| `tiktok.com/@{user}/video/{id}` | `adhx.com/@{user}/video/{id}` |
| `youtube.com/shorts/{id}`       | `adhx.com/shorts/{id}`        |

Full source URLs after `adhx.com/` also work (with or without protocol).

Playback differs because the upstreams differ:

- **X / Twitter** — FxTwitter metadata; video through `/api/media/video`.
- **Instagram Reels** — Instagram OG tags for poster/caption; MP4 via
  vxinstagram, Range-probed before `<video src>`; official iframe fallback.
- **TikTok** — fxTikTok (`tnktok.com`) metadata; MP4 through
  `/api/media/tiktok/video` (follows the signed CDN redirect).
- **YouTube Shorts** — official oEmbed + privacy-enhanced iframe. No download.

## Database (multi-user, composite keys)

SQLite via `better-sqlite3` + Drizzle ORM (`src/lib/db/schema.ts`). Most
user-owned tables key on `(userId, platform, id)`:

- `userId` lets two users independently save the same post.
- `platform` (`twitter` | `instagram` | `tiktok` | `youtube`) keeps a 19-digit
  TikTok id from colliding with a same-length tweet id.

| Table               | Primary key                           | Holds                       |
| ------------------- | ------------------------------------- | --------------------------- |
| `bookmarks`         | `(userId, platform, id)`              | the saved item              |
| `bookmark_media`    | `(userId, platform, id)`              | photos / video metadata     |
| `bookmark_tags`     | `(userId, platform, bookmarkId, tag)` | per-user tags               |
| `bookmark_links`    | autoinc `id` (+ `userId`, `platform`) | enriched outbound links     |
| `archived_posts`    | `(userId, platform, bookmarkId)`      | archive (was `read_status`) |
| `tag_shares`        | `(userId, tag)`                       | public playlist settings    |
| `user_preferences`  | `(userId, key)`                       | theme, font, etc.           |
| `oauth_tokens`      | `userId`                              | encrypted X tokens          |
| `users`             | `id`                                  | account                     |
| `user_identities`   | `(provider, providerId)`              | `x` / `email` links         |
| `activity`          | autoinc `id`                          | public pulse (below)        |
| `collection_events` | autoinc `id`                          | playlist view/clone log     |

**Invariant:** every user-data query filters by `userId`, and any query
touching a `bookmarkId` also filters by `platform`. Multi-table writes go
through `runInTransaction()`. Local boot: `pnpm db:migrate` (Docker runs it
on start).

## Trending & the activity pulse

`/trending` is a public, anonymous, crawlable feed of what the community is
saving, previewing, and sending. `/discover` 308s here.

- `recordActivity()` writes an append-only `activity` row. Content is always
  resolved server-side. `userId` is stored and **never** exposed.
  Archive does **not** write a pulse.
- `getTrendingItems()` (`src/lib/trending/query.ts`) is the anonymity-safe
  read path — one row per post, newest event wins. `/`, `/trending`,
  `/api/activity`, and `/api/trending` all go through it.
- Playlists rank separately via `collection_events` + `src/lib/discovery/rank.ts`
  (views + clones; `viewerId` never selected).
