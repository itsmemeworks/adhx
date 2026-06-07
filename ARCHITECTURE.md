# Architecture

A human-facing tour of how ADHX is put together. For the exhaustive,
convention-by-convention reference (security invariants, every API route,
deployment runbooks) see [`CLAUDE.md`](CLAUDE.md).

ADHX is a single Next.js 16 (App Router) + React 19 application backed by a
local SQLite database. There is no separate backend service — the Next.js API
routes _are_ the backend, and they talk to SQLite via Drizzle ORM.

## Data flow

The core loop is: pull bookmarks from Twitter/X, store them locally, and serve
them back to the UI.

```
Twitter API  ──►  /api/sync (SSE)  ──►  SQLite (Drizzle)  ──►  /api/feed  ──►  React UI
```

1. **Sync** — `/api/sync` opens a Server-Sent Events stream. It pages through
   the user's Twitter bookmarks, enriches each tweet (media, links, quote/reply
   context), and writes the results into SQLite, emitting progress events as it
   goes so the UI can show a live counter.
2. **Add** — `/api/bookmarks/add` (and its Twitter-only delegate
   `/api/tweets/add`) save a single item from a pasted URL. Twitter items are
   enriched via FxTwitter; Instagram/TikTok/YouTube go through their respective
   resolvers.
3. **View** — `/api/feed` reads from SQLite with filtering, pagination, and
   tag/read-status joins (carefully de-N+1'd) and returns JSON the feed
   components render.
4. **Media** — Twitter blocks direct browser requests to its CDN, so media is
   served through proxy routes under `/api/media/*` (video, HLS segments,
   thumbnails) that add the right headers and stream the bytes back.

## Auth flow

Authentication is Twitter OAuth 2.0 with PKCE, and sessions are signed JWTs in a
cookie:

```
/api/auth/twitter ──► Twitter consent ──► /api/auth/twitter/callback
        (PKCE)                                      │
                                                    ▼
                              encrypt tokens (AES-256-GCM) → SQLite
                                                    │
                                                    ▼
                              signed JWT session cookie (jose)
```

- The callback exchanges the auth code for access/refresh tokens, which are
  **encrypted at rest** (AES-256-GCM) before being stored in `oauth_tokens`.
- The session itself is a JWT signed with `jose` (cookie `adhx_session`,
  30-day, httpOnly). Every data-modifying route calls `getCurrentUserId()`
  (`src/lib/auth/session.ts`) and returns 401 if there is no valid session.
- `/api/auth/twitter/status` refreshes expiring tokens transparently.

## The URL-prefix preview trick

ADHX's signature feature: take any supported link and swap its host for
`adhx.com` to get an on-site preview.

| Source link                     | Becomes                       |
| ------------------------------- | ----------------------------- |
| `x.com/{user}/status/{id}`      | `adhx.com/{user}/status/{id}` |
| `instagram.com/reels/{id}`      | `adhx.com/reels/{id}`         |
| `tiktok.com/@{user}/video/{id}` | `adhx.com/@{user}/video/{id}` |
| `youtube.com/shorts/{id}`       | `adhx.com/shorts/{id}`        |

You can also paste the _full_ source URL after `adhx.com/`; the Next.js
middleware (`src/proxy.ts`) recognises the shape and 307-redirects to the right
preview route.

Four platforms, one shared preview shell, but different playback strategies
because the upstreams differ:

- **X / Twitter** — metadata and media via FxTwitter; video streamed through the
  `/api/media/video` proxy (MP4, or HLS for long videos).
- **Instagram Reels** — poster + caption + link only (the free MP4 mirrors are
  dead); thumbnails resolved through a proxy.
- **TikTok** — metadata via an fxTikTok mirror; MP4 streamed through
  `/api/media/tiktok/video`, which follows the signed CDN redirect.
- **YouTube Shorts** — metadata via the official oEmbed API, playback via the
  official privacy-enhanced iframe embed. No download (deliberate — there is no
  compliant zero-cost MP4 source).

Authenticated visitors see an "Add to Collection" button on every preview;
saved items land in the same feed as tweets, tagged with a platform badge.

## Database (multi-user, composite keys)

SQLite via `better-sqlite3` + Drizzle ORM. The schema lives in
`src/lib/db/schema.ts`. The defining design choice is **multi-user isolation
through composite primary keys**.

Most user-owned tables key on `(userId, platform, id)`:

- `userId` lets two users independently bookmark the same tweet.
- `platform` (`twitter` | `instagram` | `tiktok` | `youtube`) keeps a 19-digit
  TikTok id from colliding with a same-length tweet id.

| Table               | Primary key                                    | Holds                         |
| ------------------- | ---------------------------------------------- | ----------------------------- |
| `bookmarks`         | `(userId, platform, id)`                       | the saved item                |
| `bookmark_media`    | `(userId, platform, id)`                       | photos / video metadata       |
| `bookmark_tags`     | `(userId, platform, bookmarkId, tag)`          | per-user tags                 |
| `bookmark_links`    | autoinc `id` (+ `userId`, `platform`)          | enriched outbound links       |
| `read_status`       | `(userId, platform, bookmarkId)`               | read / unread                 |
| `collections`       | `id` (+ `userId`)                              | custom collections            |
| `collection_tweets` | `(userId, collectionId, platform, bookmarkId)` | items in a collection         |
| `tag_shares`        | `(userId, tag)`                                | public tag-share settings     |
| `user_preferences`  | `(userId, key)`                                | theme, font, etc.             |
| `oauth_tokens`      | `userId`                                       | encrypted Twitter tokens      |
| `activity`          | autoinc `id`                                   | public Discover pulse (below) |

**Invariant:** every query filters by `userId`, and any query touching a
`bookmarkId` also filters by `platform`. There are no `isNull(userId)`
fallbacks — those would leak data across users. Multi-table writes go through
`runInTransaction()` from `@/lib/db`.

## Discover & the activity pulse

`/discover` is a public, anonymous, real-time feed of what the community is
saving and previewing right now.

- Saves, previews, and reads call `recordActivity()`
  (`src/lib/activity/record.ts`), which writes an append-only row to the
  `activity` table. Content is **always** resolved server-side — the recorder
  never trusts client-supplied text or thumbnails (that would be a stored-XSS
  vector), and there is intentionally no public write endpoint.
- `GET /api/activity` serves the pulse. It selects an explicit public column
  list (the stored `userId` is **never** exposed — the pulse is anonymous by
  construction) and enriches each sparse row server-side by joining the saved
  bookmark for the right thumbnail, content type, author avatar, and a distinct
  "save count" that powers the Trending badge.
- The `DiscoverFeed` component polls `/api/activity`, de-dupes, and links each
  card to the on-ADHX preview path to keep clicks on-site.
