# Discovery: collection view stats + leaderboards (and rank-mode plumbing)

**Status: spec (2026-08-21), not yet building.** Public tagged collections become discoverable
and competitive: we track views on collections, rank them on leaderboards by day / week /
month / all-time, and give curators a reason to make collections public and share them. This
also lays the plumbing for future Reddit-style theater sorts (hot / rising / new) — the ranking
layer is built mode-aware from day one even though MVP ships only "top".

## 1. Why

- **Discovery for new users**: today the only community surfaces are the live pulse and
  `/trending` (post-level). There is no way to find _collections_ — the durable, curated,
  highest-signal objects in the product. A leaderboard of the best public collections is the
  natural browse-first entry point.
- **Gamification for curators**: view counts + a ranked ladder make "Make public" mean
  something. Rank movement is the retention loop for the people doing the curating.
- **SEO**: one more public, crawlable, force-dynamic surface built from real user activity —
  same growth loop as `/trending`.

## 2. What already exists (don't rebuild)

Post-level view stats are DONE — the `activity` event log already records `preview` (preview
pages server-side + 2s theater dwell via `POST /api/activity/preview`), `save`, `read`,
`share`, and `getTrendingItems()` derives `saveCount`/`trendCount` from it. Nothing in this
spec touches that pipeline.

What does NOT exist, verified 2026-08-21:

- The collection theater (`TheaterShell mode="collection"`) deliberately records **no** events
  (see the comment in `TheaterShell.tsx` — collection mode marks seen locally only).
- The `/t/{username}/{tag}` page server component records nothing.
- The clone endpoint (`/api/share/tag/by-name/[username]/[tag]/clone`) records nothing.

So a collection can be shared, viewed, and cloned a thousand times and we have zero signal.

## 3. Data model: `collection_events` (new append-only table)

Collections are keyed by `(ownerUserId, tag)`, not `(platform, bookmarkId)`, so they get their
**own event log** rather than nullable columns bolted onto `activity` (which would complicate
the anonymity choke point in `src/lib/trending/query.ts` for no benefit).

```ts
// src/lib/db/schema.ts — mirrors the `activity` conventions
export const collectionEvents = sqliteTable(
  'collection_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    action: text('action').notNull(), // 'view' | 'clone' — future: 'item_view' | 'share'
    ownerUserId: text('owner_user_id').notNull(),
    tag: text('tag').notNull(),
    viewerId: text('viewer_id'), // private — session userId when present, NEVER exposed
    createdAt: text('created_at').notNull(),
    hidden: integer('hidden').notNull().default(0), // same moderation lever as activity
  },
  (t) => ({
    collectionIdx: index('collection_events_collection_idx').on(t.ownerUserId, t.tag, t.createdAt),
    createdAtIdx: index('collection_events_created_at_idx').on(t.createdAt),
  }),
)
```

Invariants carried over from `activity` (all four are load-bearing — see CLAUDE.md):

1. **Append-only event log** — exempt from the composite-PK user-owned-data convention.
2. **`viewerId` is stored but never exposed.** Every read path goes through the single query
   module (§5); no route ever `select()`s the whole row. The _curator_ (owner username) IS
   public — it's already on every `/t` page and it's the whole point of the leaderboard.
3. **Nothing client-supplied is displayed.** Events carry identifiers only; display data
   (tag name, curator, poster tiles, counts) is always joined server-side at read time.
4. **Recording is fire-and-forget** (sync better-sqlite3, swallow all errors) — a stats write
   must never break a page view or a clone.

Migration: guarded `CREATE TABLE IF NOT EXISTS` in `migrate.ts` **and** the same DDL added to
the in-memory test DB (`src/__tests__/api/setup.ts`) — the documented gotcha.

## 4. Recording (`src/lib/discovery/record.ts`)

`recordCollectionEvent({ action, ownerUserId, tag, viewerId })`, hooked into:

| Action  | Hooked into                                                              | Notes                                                                  |
| ------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| `view`  | `/t/[username]/[tag]/page.tsx` server component (the collection theater) | Bot-filtered via existing `isLikelyBot()`; only when the tag is public |
| `clone` | `/api/share/tag/by-name/[username]/[tag]/clone` on a successful clone    | The strongest signal — someone saved the whole collection              |

Rules, enforced inside the recorder so call sites stay dumb:

- **Self-views never count**: `viewerId === ownerUserId` → no-op. Otherwise every curator
  refresh inflates their own rank.
- **Write-side dedupe** (mirrors `recordActivity`'s 60s window): signed-in viewers are deduped
  per `(viewerId, owner, tag, action)` within 30 minutes; anonymous viewers fall back to a 60s
  floor per `(owner, tag, action)` plus the existing IP rate limiter on the route. Not
  Sybil-proof — doesn't need to be at this scale; `hidden` + admin route (§8) is the backstop.
- **Public-only**: recording checks `tag_shares.isPublic` — private collections accrue nothing
  (and a private collection's historical events are excluded at read time anyway, §5).
- `item_view` (per-post dwell _inside_ a collection theater) is deliberately **not** in MVP.
  The theater's "collection mode records nothing to the public pulse" rule stays; if we later
  want per-item stats for curators, they land in `collection_events` (never `activity`) so the
  public pulse stays uncontaminated.

## 5. Ranking: `src/lib/discovery/rank.ts` (the single choke point)

One audited query module, same role `trending/query.ts` plays for posts:

```ts
export type RankWindow = 'day' | 'week' | 'month' | 'all'
export type RankMode = 'top' | 'hot' | 'rising' | 'new' // MVP implements 'top' only

export interface LeaderboardEntry {
  username: string // curator (public by construction)
  tag: string
  rank: number
  score: number
  viewCount: number
  cloneCount: number
  itemCount: number
  tileThumbs: string[] // up to 4 poster tiles, same source as CollectionPosterCard
}

export function getCollectionLeaderboard(opts: {
  window: RankWindow
  mode?: RankMode // default 'top' — the hot/rising/new plumbing (§7)
  limit?: number // default 24
}): LeaderboardEntry[]
```

- **Score (`top`)** = `views + 5 × clones` within the window, computed by a single GROUP BY
  over `collection_events` (`createdAt >= windowStart`, `hidden = 0`), **inner-joined to
  `tag_shares` on `isPublic = 1`** — a collection made private drops off every board
  instantly, full history intact if it returns — and to `users` for the username. Ties break
  by most-recent event.
- Enrichment (item counts, poster thumbs) reuses the same bookmark joins the `/t/{username}`
  profile and `CollectionPosterCard` already use.
- Cheap by construction: indexed range scan + GROUP BY on local SQLite, zero external calls,
  zero per-user marginal cost. If all-time ever gets slow (millions of rows), add a rollup
  table then — explicitly deferred, don't pre-build it.
- 60s in-process cache per `(window, mode)`, same pattern as the trending cache.

## 6. Surfaces (MVP)

**`/leaderboard`** (shipped at `/collections`, renamed post-launch — that path collided with the
unrelated `/api/collections` custom-collections API; old URLs redirect) **— the leaderboard
page** (public, anonymous, crawlable). Design settled
2026-08-21 on the "Collection Leaderboard" design canvas: **direction A — Podium**:

- `export const dynamic = 'force-dynamic'` (reads SQLite — same runtime-render rule as
  `/trending`; no `generateStaticParams`).
- Window tabs **Today · This week · Month · All-time** as tidy paths `/leaderboard/{window}`
  (`/leaderboard` = week, the default — day is too jumpy pre-scale, all-time too static),
  reflected via `history.replaceState` exactly like `/trending/[filter]`.
- **Podium layout**: centered hero of the top 3 as large `CollectionPosterCard`s (#1 biggest,
  clay-grad rank medallion + flame + glow; #2/#3 flanking with clay medallions), then a
  "Ranks 4–9" 3-col poster grid with glass rank badges, closed by a "See the full top 24 →"
  continuation. Every card carries curator handle + post count + a mono stat line
  (eye views · bookmark saves). Click → the existing looping collection theater at
  `/t/{username}/{tag}`. Mobile = featured #1 poster + compact chart rows.
- SEO: sr-only ranked list + `CollectionPage`/`ItemList` JSON-LD, Matter dark styling to match
  `/trending`'s ranked list. Add to the sitemap (weekly, 0.7) and link it from the theater's
  static hero copy + `/trending`.
- Not selected (kept on the canvas for reference): B — dense chart rows with movement arrows
  (rank vs prior window — derivable from the event log, could migrate into A later), C —
  uniform rank-badged grid.

**`GET /api/collections/trending?window=&limit=`** — public anonymous JSON wrapping
`getCollectionLeaderboard()` (GEO/AI-search sibling of `/api/trending`). Rate-limited 120/min/IP,
60s cache headers, listed in `llms.txt`.

**Curator stat surfaces** (both designed on the same canvas, both MVP):

- **Owner `/tags` upgrade**: title row gains a "This week" summary chip (total views · saves ·
  best rank); each public poster card gains the mono stat line (views · saves) + a clay
  "#N this week" rank chip when charting; private cards read "Private · no public stats"
  instead of nothing; a "New tag" ghost card and a leaderboard cross-promo band
  ("#memes is #4 on this week's leaderboard · 14 views to #3 · See the leaderboard →")
  fill the previously-empty page and close the gamification loop.
- **Public profile `/t/{username}`**: the hero gains a curator stat strip under the handle
  (views this week · saves · leaderboard rank), and each collection card gains the same
  stat line, with the "#N this week" chip top-right on charting collections. All counts are
  anonymous aggregates — nothing viewer-identifying (§3 invariant 2 applies).
- The full "your rank ladder" Settings card is a follow-up, not MVP.

## 7. Hot / rising / new — the plumbing (future theater filter, NOT MVP)

The ask: theater sort modes like Reddit's. What must exist _now_ so that's a small PR later:

1. **Timestamped event logs** — already true for posts (`activity`) and now collections (§3).
   Velocity math needs event times, not counters. This is the one thing that can't be
   retrofitted, and it's why we log events instead of incrementing a `view_count` column.
2. **Mode-aware ranking signatures** — `getCollectionLeaderboard` takes `mode` from day one
   (throws on unimplemented modes); `getTrendingItems()` grows the same optional
   `{ mode }` param when theater sorts land. Definitions, so future-us doesn't bikeshed:
   - `new` — pure recency (createdAt desc).
   - `hot` — Reddit-style time decay: `log10(max(score, 1)) − ageHours / G` (gravity `G ≈ 12`
     to start; tune live). Computable in the same SQL pass.
   - `rising` — velocity ratio: score in the last 6h vs the prior 7-day baseline, minimum
     3 events to qualify (else everything with 1 view "rises").
3. **Shared filter enum** — `RankMode`/`RankWindow` + slug↔mode helpers live in
   `src/lib/discovery/rank.ts` (the `trending/filter.ts` pattern: one module imported by both
   server pages and client chrome, so crawlable HTML and hydrated UI can't drift). The theater
   dock's future sort pill reads the same enum.
4. **No baked-in "latest N" assumptions** — the leaderboard page and API take `(window, mode)`
   from the URL, so adding a mode is a new slug, not a refactor.

## 8. Moderation & abuse

- `collection_events.hidden` + extending `POST /api/admin/activity/hide` (or a sibling
  `/api/admin/collections/hide`) to take `{ username, tag }` — gated by the existing
  `ADMIN_USERNAMES`. Hiding removes a collection from leaderboards without touching the
  curator's data.
- Recording routes sit behind the existing IP rate limiter; self-view exclusion + signed-in
  dedupe (§4) blunt casual inflation. Accept that a determined anon can pad views — the clone
  weight (×5) keeps the top of the board anchored to the harder-to-fake signal.

## 9. Tests

- Recorder: self-view no-op, private-tag no-op, dedupe windows (signed-in 30min / anon 60s),
  bot filter, errors swallowed.
- Rank: window boundaries (day/week/month/all), clone weighting, public-only join (private tag
  vanishes), `hidden` exclusion, tie-break, anonymity (no `viewerId` in any returned shape —
  a `discovery-anonymity.test.ts` mirroring `trending-anonymity.test.ts`).
- API: rate limit, cache headers, invalid window/mode → 400.
- Multi-user isolation: user A's events never affect user B's private collections.

## 10. MVP cut-line

**In**: `collection_events` table + migration + test DDL, recorder with view/clone hooks,
`rank.ts` with `top` × 4 windows, `/leaderboard/{window}` page (podium direction A) + JSON-LD

- sitemap, `/api/collections/trending`, the /tags owner upgrade + profile stat strip (§6),
  moderation hide, tests.

**Out (explicitly)**: hot/rising/new implementations (plumbing only), per-item `item_view`
events, curator rank ladder in Settings, rank-change notifications/digest, rollup tables,
per-category leaderboards.
