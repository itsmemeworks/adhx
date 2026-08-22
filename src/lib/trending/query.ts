import { db } from '@/lib/db'
import { activity, bookmarks, bookmarkMedia, bookmarkLinks } from '@/lib/db/schema'
import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm'
import type { PlatformId } from '@/lib/platform/url'
import { asContentType, inferContentType } from '@/lib/content-type'
import type { ContentType } from '@/components/matter'

/**
 * Anonymity-safe trending query — the SINGLE audited choke point for the
 * public pulse. This module reads recent community actions and enriches them
 * into display-ready items for the landing + Discover.
 *
 * ANONYMITY INVARIANT: `activity.userId` is NEVER selected here. The pulse is
 * anonymous by construction — `userId` exists in the table only for future
 * moderation/rate-limiting and must never reach a read path. Any change that
 * adds a column to the recent-events select MUST keep `userId` out.
 *
 * Each item is enriched with:
 *   - `saveCount` — DISTINCT users who saved the post (anonymous count).
 *   - `trendCount` — savers + preview events + send events → powers the "Trending" ranking +
 *     flame badge, so a heavily-previewed or widely-sent post trends before anyone saves it.
 *   - `contentType` — the post's real type (video/photo/text/quote/article),
 *     derived from the saved bookmark's media so the badge is accurate (a text
 *     tweet isn't mislabelled "photo", a video tweet isn't "photo", etc.). Left
 *     undefined for preview-only posts that were never saved; the client then
 *     falls back to a platform/thumbnail heuristic.
 *   - `thumbnailUrl` — resolved so Discover shows the same hero image as the
 *     collection: TikTok posters are derived as the deterministic proxy URL
 *     (the CDN needs signing the proxy adds), and article covers are pulled
 *     from the saved bookmark's enriched link.
 */

/**
 * A short-link expansion carried alongside a post's text (spec §6b) so the
 * theater never shows a raw `t.co` when the real destination is known.
 * Public data only — comes from `bookmark_links` (or FxTwitter's `urls[]` on
 * preview pages); never anything user-derived.
 */
export interface TextLinkRef {
  /** The short link as it appears in the text (t.co). Null when unknown. */
  shortUrl?: string | null
  expandedUrl: string
  /** bookmark_links.link_type: 'tweet' = twitter content, 'link'/'article' = external. */
  linkType?: string | null
}

/**
 * The quoted post a tweet references, when the source can supply it (the
 * FxTwitter tweet on preview pages carries the full quote). Public content
 * only — the quoted tweet is public by construction; never anything
 * user-derived. When present, the stage renders it as a quote card and the
 * trailing quote link is stripped (spec §6b).
 */
export interface TheaterQuoteRef {
  author: string
  authorName?: string | null
  text?: string | null
  authorAvatarUrl?: string | null
}

/** Parse a stored JSON column back into a value, defensively — malformed JSON serves absent, never throws. */
function safeParse<T>(json: string | null | undefined): T | undefined {
  if (!json) return undefined
  try {
    return JSON.parse(json) as T
  } catch {
    return undefined
  }
}

/**
 * Shape of `bookmarks.quote_context` (legacy JSON, see `QuoteContext` in
 * `src/components/feed/types.ts`) — read defensively, mapped to the public
 * `TheaterQuoteRef` shape below.
 */
interface StoredQuoteContext {
  author?: string | null
  authorName?: string | null
  text?: string | null
  authorProfileImageUrl?: string | null
}

/** Map a saved bookmark's legacy `quoteContext` JSON to a `TheaterQuoteRef`, when it has anything worth showing. */
function quoteFromBookmarkContext(json: string | null | undefined): TheaterQuoteRef | undefined {
  const parsed = safeParse<StoredQuoteContext>(json)
  if (!parsed) return undefined
  const author = parsed.author || ''
  const text = parsed.text || null
  if (!author && !text) return undefined
  return {
    author,
    authorName: parsed.authorName || null,
    text,
    authorAvatarUrl: parsed.authorProfileImageUrl || null,
  }
}

/**
 * Canonical public item shape returned to clients. Matches the enriched
 * `/api/activity` items + the fields `DiscoverFeed`'s `ActivityItem` needs.
 * Deliberately carries NO `userId` — see the anonymity invariant above.
 */
/**
 * Theater / pulse item. Narrower than library `FeedItem` (no media[], no
 * article body). Convert a saved post with `feedItemToTheaterItem`.
 */
export interface TrendingItem {
  action: 'preview' | 'save' | 'read' | string
  platform: PlatformId | string
  bookmarkId?: string | null
  author: string
  authorName?: string | null
  text?: string | null
  thumbnailUrl?: string | null
  /** The post author's avatar, for tweet-style text/quote cards. */
  authorAvatarUrl?: string | null
  url: string
  /**
   * The pulse EVENT time (when this post was last previewed/saved/sent) —
   * load-bearing for feed ordering, fresh-arrival detection, and "N new".
   * NOT the post's age: the same post re-surfacing refreshes this. Display
   * surfaces must show `addedAt` instead (owner report: the time chip "kept
   * changing").
   */
  createdAt: string
  /**
   * The stable display time: when the post was FIRST added/linked to ADHX —
   * the earliest of any saver's `bookmarks.processedAt` and the earliest
   * activity event (owner decision: never the source platform's own publish
   * date). Stable by construction (MINs never move), unlike `createdAt`
   * above. Display-only; never used for ordering.
   */
  addedAt?: string | null
  /** Distinct ADHX users who've saved this post (anonymous count). */
  saveCount?: number
  /** Trending score = savers + preview events + send events. Drives the flame + Trending sort. */
  trendCount?: number
  /** Real post type from the saved bookmark, when known (else client infers it). */
  contentType?: ContentType
  /** Short-link expansions for URLs in `text` (spec §6b). Absent when never saved. */
  textLinks?: TextLinkRef[]
  /** The quoted post, when the source supplies it (preview pages). See TheaterQuoteRef. */
  quote?: TheaterQuoteRef
}

const FETCH = 80
const LIMIT = 30
/** Max short-link expansions attached per post (spec §6b) — keeps the payload bounded. */
const MAX_TEXT_LINKS = 8
/**
 * Max chars of post text served to clients. `activity.text` is capped at write
 * time (240/500 chars, see `record.ts`'s TEXT_CAP) so "Show more" on a
 * preview-only pulse item can dead-end mid-sentence with a bare "…". For SAVED
 * posts we have the full, uncapped `bookmarks.text` — serve that instead, but
 * still cap it here so the payload stays bounded.
 */
const MAX_SERVED_TEXT = 2000

export interface GetTrendingOptions {
  /** Restrict to a single platform's recent events. */
  platform?: PlatformId
  /** Max items to return after dedup. Defaults to 30. */
  limit?: number
  /** Drop items with `trendCount` below this. Defaults to none. */
  minTrend?: number
  /**
   * How many deduped posts to skip before taking `limit` (offset pagination
   * over the deduped, newest-first sequence — NOT a raw-row offset). Defaults
   * to 0. Used by `/api/activity` to fetch older pages for infinite scroll.
   */
  offset?: number
  /**
   * Only consider activity from the last N hours. Opt-in, and deliberately
   * NOT applied to `/trending`: the theater's live mode is defined as "what
   * the community previewed, saved and sent in the last 24 hours" (owner), so
   * a quiet night must leave the queue short rather than backfilling it with
   * last week's posts. The `/trending` hubs are a ranked all-time-ish board
   * and keep their unbounded window so a quiet day can't empty an SEO page.
   */
  withinHours?: number
}

/** The live window for the theater + `/api/activity` (see `withinHours`). */
export const LIVE_WINDOW_HOURS = 24

export interface TrendingResult {
  items: TrendingItem[]
  savedToday: number
  recentActivity: number
  /**
   * Whether another page exists past this one (more deduped posts beyond
   * `offset + items.length`). Best-effort: pagination reads a bounded window
   * of raw events (see `rawFetchSize` below), so an extremely deep offset on a
   * high-volume pulse could under-report — acceptable for a public, anonymous
   * "keep scrolling" feed with no hard pagination guarantee.
   */
  hasMore: boolean
}

/**
 * Short-lived in-memory cache around `fetchTrendingItems`. This module is the
 * single choke point for the PUBLIC, anonymous, force-dynamic `/trending`
 * pages + `/api/activity` + `/api/trending` — each request runs ~5 aggregate
 * scans against the single synchronous better-sqlite3 connection, so a burst
 * of public traffic can starve the Fly health probe. A short TTL absorbs
 * bursts without meaningfully staling the "live" feel (the client already
 * polls every 12s).
 *
 * Cached by the same args callers already pass (`platform`/`limit`/`minTrend`)
 * — the cached value is exactly `fetchTrendingItems`'s return shape, so the
 * anonymity invariant (no `userId`, ever) holds automatically: we never touch
 * or re-shape the value, just store and replay it.
 *
 * Keyed per-`db`-instance via a WeakMap (not a single flat Map): in production
 * there's only ever one `db`, so this behaves like a normal module-level
 * cache. In tests, each test swaps in a fresh in-memory database (see
 * `src/__tests__/api/setup.ts`'s `createTestDb()`), and without this indirection
 * a same-millisecond call with identical default args would return a stale hit
 * from a *previous* test's database — this keeps every db instance's cache
 * isolated instead.
 */
const CACHE_TTL_MS = 12_000
type TrendingCache = Map<string, { value: TrendingResult; expiresAt: number }>
const cachesByDb = new WeakMap<object, TrendingCache>()

function getCache(): TrendingCache {
  let c = cachesByDb.get(db as object)
  if (!c) {
    c = new Map()
    cachesByDb.set(db as object, c)
  }
  return c
}

function cacheKey(opts: GetTrendingOptions): string {
  // `withinHours` MUST be part of the key — the windowed live feed and the
  // unbounded /trending board otherwise share a cache entry and one serves
  // the other's rows. The key carries the hours, not the derived cutoff
  // timestamp, so the entry stays hittable for its whole TTL.
  return [
    opts.platform ?? '*',
    opts.limit ?? LIMIT,
    opts.minTrend ?? '*',
    opts.offset ?? 0,
    opts.withinHours ?? '*',
  ].join(':')
}

/**
 * Fetch + enrich the most recent community actions into display-ready items,
 * cached for `CACHE_TTL_MS` per distinct `(platform, limit, minTrend)` combo.
 *
 * Defaults reproduce today's `/api/activity` behaviour exactly: FETCH 80 recent
 * events → dedup by `action:platform:url` → LIMIT 30, no platform filter, no
 * minTrend threshold.
 */
export async function getTrendingItems(opts: GetTrendingOptions = {}): Promise<TrendingResult> {
  const cache = getCache()
  const key = cacheKey(opts)
  const now = Date.now()
  const hit = cache.get(key)
  if (hit && hit.expiresAt > now) return hit.value

  const value = await fetchTrendingItems(opts)
  cache.set(key, { value, expiresAt: now + CACHE_TTL_MS })
  return value
}

async function fetchTrendingItems(opts: GetTrendingOptions = {}): Promise<TrendingResult> {
  const limit = opts.limit ?? LIMIT
  const platformFilter = opts.platform
  const offset = Math.max(0, opts.offset ?? 0)

  // Raw-row fetch window: must be deep enough that, after collapsing to one
  // row per post, we still have `offset + limit` deduped posts to slice from.
  // The dedup ratio isn't known up front, so over-fetch by 3x and cap it — a
  // few hundred rows is a cheap local scan. See `hasMore`'s caveat above for
  // what happens if a very deep offset outruns this window.
  const rawFetchSize = Math.min(600, Math.max(FETCH, (offset + limit) * 3))

  // Live window (opt-in, see `withinHours`). ISO strings compare lexically,
  // which is what every other date filter in this file relies on.
  const since =
    opts.withinHours && opts.withinHours > 0
      ? new Date(Date.now() - opts.withinHours * 60 * 60 * 1000).toISOString()
      : null

  // ANONYMITY CHOKE POINT: this select lists ONLY public columns. `userId` is
  // intentionally absent and must stay that way.
  const rows = db
    .select({
      action: activity.action,
      platform: activity.platform,
      bookmarkId: activity.bookmarkId,
      author: activity.author,
      authorName: activity.authorName,
      authorAvatarUrl: activity.authorAvatarUrl,
      text: activity.text,
      thumbnailUrl: activity.thumbnailUrl,
      contentType: activity.contentType,
      textLinks: activity.textLinks,
      quoteJson: activity.quoteJson,
      url: activity.url,
      createdAt: activity.createdAt,
    })
    .from(activity)
    .where(
      and(
        eq(activity.hidden, 0),
        ...(platformFilter ? [eq(activity.platform, platformFilter)] : []),
        ...(since ? [gte(activity.createdAt, since)] : []),
      ),
    )
    .orderBy(desc(activity.createdAt))
    .limit(rawFetchSize)
    .all()

  // Collapse to ONE row per post (platform + source id), keeping the newest
  // event. A post can have several events — e.g. previewed then saved (now
  // common since sync records a save per new bookmark) — and they must not
  // surface as two cards with the same React key. Matches DiscoverFeed's
  // dedupeByPost so the server list and the hydrated grid agree.
  const seen = new Set<string>()
  const deduped: typeof rows = []
  for (const row of rows) {
    const key = `${row.platform}:${row.bookmarkId || row.url}`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(row)
  }

  // Page over the deduped, newest-first sequence (not the raw rows — an
  // offset there would slice mid-post-group and reintroduce duplicates).
  const items = deduped.slice(offset, offset + limit)
  const hasMore = deduped.length > offset + items.length

  const ids = [...new Set(items.map((i) => i.bookmarkId).filter(Boolean))]

  // Per-post save count + the flags we need to type it (anonymous — counts and
  // shape only, never any user identity).
  const counts = new Map<string, number>()
  const flags = new Map<string, { isQuote: boolean; category: string | null }>()
  const mediaKinds = new Map<string, { video: boolean; photo: boolean }>()
  const articleCovers = new Map<string, string>()
  const articleTitles = new Map<string, string>()
  const fullTexts = new Map<string, string>()
  const textLinksByPost = new Map<string, TextLinkRef[]>()
  const quoteContexts = new Map<string, string>()
  const avatars = new Map<string, string>()
  const earliestSaves = new Map<string, string>()
  const firstSeens = new Map<string, string>()
  const previewCounts = new Map<string, number>()
  const shareCounts = new Map<string, number>()
  if (ids.length > 0) {
    const aggRows = db
      .select({
        platform: bookmarks.platform,
        id: bookmarks.id,
        saveCount: sql<number>`count(distinct ${bookmarks.userId})`,
        isQuote: sql<number>`max(${bookmarks.isQuote})`,
        category: sql<string | null>`max(${bookmarks.category})`,
        avatar: sql<string | null>`max(${bookmarks.authorProfileImageUrl})`,
        // All rows for a post share the same text (it's the same source
        // content regardless of which user saved it) — `max()` picks any one,
        // same trick as `avatar` above. Public post content, fine to select.
        fullText: sql<string | null>`max(${bookmarks.text})`,
        // Legacy quote JSON — same "any row, same content" trick. Only ever
        // populated for twitter quote tweets; public content, fine to select.
        quoteContext: sql<string | null>`max(${bookmarks.quoteContext})`,
        // Earliest save time across all savers — one half of `addedAt`
        // (display), never ordering. Public timing metadata, no user
        // identity.
        earliestSavedAt: sql<string | null>`min(${bookmarks.processedAt})`,
      })
      .from(bookmarks)
      .where(inArray(bookmarks.id, ids))
      .groupBy(bookmarks.platform, bookmarks.id)
      .all()
    for (const r of aggRows) {
      const k = `${r.platform}:${r.id}`
      counts.set(k, Number(r.saveCount) || 0)
      flags.set(k, { isQuote: !!Number(r.isQuote), category: r.category ?? null })
      if (r.avatar) avatars.set(k, r.avatar)
      if (r.fullText) fullTexts.set(k, r.fullText)
      if (r.quoteContext) quoteContexts.set(k, r.quoteContext)
      if (r.earliestSavedAt) earliestSaves.set(k, r.earliestSavedAt)
    }

    // Preview interest — how many times each post has been previewed (events,
    // not users; already de-duped per 60s on write). Folded into the trending
    // score so a much-previewed post trends even before anyone saves it.
    const previewRows = db
      .select({
        platform: activity.platform,
        bookmarkId: activity.bookmarkId,
        n: sql<number>`count(*)`,
      })
      .from(activity)
      .where(and(eq(activity.action, 'preview'), inArray(activity.bookmarkId, ids)))
      .groupBy(activity.platform, activity.bookmarkId)
      .all()
    for (const r of previewRows) {
      previewCounts.set(`${r.platform}:${r.bookmarkId}`, Number(r.n) || 0)
    }

    const shareRows = db
      .select({
        platform: activity.platform,
        bookmarkId: activity.bookmarkId,
        n: sql<number>`count(*)`,
      })
      .from(activity)
      .where(and(eq(activity.action, 'share'), inArray(activity.bookmarkId, ids)))
      .groupBy(activity.platform, activity.bookmarkId)
      .all()
    for (const r of shareRows) {
      shareCounts.set(`${r.platform}:${r.bookmarkId}`, Number(r.n) || 0)
    }

    // First activity event — the other half of `addedAt` (see its doc
    // comment). MIN over ALL actions, so it never moves as the post
    // re-enters the pulse. PUBLIC COLUMNS ONLY — no userId.
    const firstSeenRows = db
      .select({
        platform: activity.platform,
        bookmarkId: activity.bookmarkId,
        firstSeen: sql<string | null>`min(${activity.createdAt})`,
      })
      .from(activity)
      .where(inArray(activity.bookmarkId, ids))
      .groupBy(activity.platform, activity.bookmarkId)
      .all()
    for (const r of firstSeenRows) {
      if (r.firstSeen) firstSeens.set(`${r.platform}:${r.bookmarkId}`, r.firstSeen)
    }

    const mediaRows = db
      .select({
        platform: bookmarkMedia.platform,
        bookmarkId: bookmarkMedia.bookmarkId,
        mediaType: bookmarkMedia.mediaType,
      })
      .from(bookmarkMedia)
      .where(inArray(bookmarkMedia.bookmarkId, ids))
      .all()
    for (const m of mediaRows) {
      const k = `${m.platform}:${m.bookmarkId}`
      const cur = mediaKinds.get(k) ?? { video: false, photo: false }
      if (m.mediaType === 'video' || m.mediaType === 'animated_gif') cur.video = true
      else if (m.mediaType === 'photo') cur.photo = true
      mediaKinds.set(k, cur)
    }

    // Article cover + title — the same hero/headline the collection card uses.
    // Cross-user is fine (they're identical regardless of who saved it). Prefer
    // the explicit article link; otherwise take any link that carries them.
    // PUBLIC COLUMNS ONLY (anonymity choke point) — no userId in this select.
    const linkRows = db
      .select({
        platform: bookmarkLinks.platform,
        bookmarkId: bookmarkLinks.bookmarkId,
        linkType: bookmarkLinks.linkType,
        originalUrl: bookmarkLinks.originalUrl,
        expandedUrl: bookmarkLinks.expandedUrl,
        imageUrl: bookmarkLinks.previewImageUrl,
        title: bookmarkLinks.previewTitle,
      })
      .from(bookmarkLinks)
      .where(inArray(bookmarkLinks.bookmarkId, ids))
      .all()
    for (const l of linkRows) {
      const k = `${l.platform}:${l.bookmarkId}`
      if (l.imageUrl && (!articleCovers.has(k) || l.linkType === 'article'))
        articleCovers.set(k, l.imageUrl)
      if (l.title && (!articleTitles.has(k) || l.linkType === 'article'))
        articleTitles.set(k, l.title)

      // Short-link expansions for the theater's t.co policy (spec §6b) — capped
      // and deduped by expandedUrl so a post with many repeated links doesn't
      // bloat the payload.
      if (l.expandedUrl) {
        const refs = textLinksByPost.get(k) ?? []
        const alreadyHave = refs.some((ref) => ref.expandedUrl === l.expandedUrl)
        if (!alreadyHave && refs.length < MAX_TEXT_LINKS) {
          refs.push({ shortUrl: l.originalUrl, expandedUrl: l.expandedUrl, linkType: l.linkType })
          textLinksByPost.set(k, refs)
        }
      }
    }
  }

  /** Real type from the saved bookmark; undefined if the post was never saved. */
  const typeOf = (
    platform: string,
    key: string,
    recorded?: string | null,
  ): ContentType | undefined => {
    if (!flags.has(key)) return asContentType(recorded)
    const m = mediaKinds.get(key)
    return inferContentType({
      platform,
      category: flags.get(key)?.category,
      isQuote: flags.get(key)?.isQuote,
      hasVideo: m?.video,
      hasPhoto: m?.photo,
    })
  }

  /**
   * The hero image for the card. TikTok posters come from our proxy (the CDN
   * URL needs signing/referer the proxy adds) and are derived from the handle
   * + id, so they work even for preview-only items. Article cards use the
   * saved cover when one exists. Everything else keeps its recorded thumbnail.
   */
  const thumbOf = (
    i: (typeof items)[number],
    key: string,
    type: ContentType | undefined,
  ): string | null => {
    if (i.platform === 'tiktok' && i.author && i.bookmarkId) {
      return `/api/media/tiktok/thumbnail?username=${encodeURIComponent(i.author)}&id=${encodeURIComponent(i.bookmarkId)}`
    }
    if (type === 'article') return articleCovers.get(key) ?? i.thumbnailUrl ?? null
    return i.thumbnailUrl ?? null
  }

  let enriched: TrendingItem[] = items.map((i) => {
    const key = `${i.platform}:${i.bookmarkId}`
    // Bookmark-derived type is authoritative (saved items); otherwise fall back
    // to the type recorded at preview time so preview-only items (esp. articles)
    // still render the right card instead of a bare text "Saved post".
    const contentType = typeOf(i.platform, key, i.contentType) ?? asContentType(i.contentType)
    // Text precedence: article title (unchanged) beats the full saved bookmark
    // text (uncapped at write time, unlike the recorded `activity.text`) beats
    // the recorded text (the only option for preview-only posts). Capped here
    // so the payload stays bounded.
    const text =
      contentType === 'article'
        ? (articleTitles.get(key) ?? i.text)
        : (fullTexts.get(key) ?? i.text)
    // Drop the raw stored JSON columns from the spread below — they're
    // replaced with parsed `textLinks`/`quote` fields and must never leak to
    // clients as opaque JSON strings.
    const { textLinks: _rawTextLinks, quoteJson: _rawQuoteJson, ...rest } = i
    return {
      ...rest,
      text: text && text.length > MAX_SERVED_TEXT ? `${text.slice(0, MAX_SERVED_TEXT - 1)}…` : text,
      saveCount: counts.get(key) ?? 0,
      // Trending score = distinct savers + preview events + send events.
      trendCount:
        (counts.get(key) ?? 0) + (previewCounts.get(key) ?? 0) + (shareCounts.get(key) ?? 0),
      contentType,
      thumbnailUrl: thumbOf(i, key, contentType),
      // Stable display time (see `addedAt`'s doc comment): the earliest
      // moment this post hit ADHX — first save or first activity event,
      // whichever came first (ISO strings sort lexically) — never the
      // moving event time, never the source platform's own date.
      addedAt:
        [earliestSaves.get(key), firstSeens.get(key)].filter((t): t is string => !!t).sort()[0] ??
        null,
      // The post author's avatar for tweet-style cards — the recorded value
      // (preview-only items) else the saved bookmark's avatar (saved items).
      authorAvatarUrl: i.authorAvatarUrl ?? avatars.get(key) ?? null,
      // Short-link expansions (spec §6b). Precedence: bookmark_links (saved
      // posts, resolved at save time) → the recorded `activity.text_links`
      // (server-resolved at preview time) → absent.
      textLinks: textLinksByPost.get(key) ?? safeParse<TextLinkRef[]>(i.textLinks),
      // Quoted-post reference. Precedence: the recorded `activity.quote_json`
      // (server-resolved at preview time) → for saved twitter posts, derived
      // from the bookmark's legacy `quoteContext` JSON → absent. IG/TikTok/
      // YouTube have no quote concept, so this only ever applies to twitter.
      quote:
        safeParse<TheaterQuoteRef>(i.quoteJson) ??
        (i.platform === 'twitter' ? quoteFromBookmarkContext(quoteContexts.get(key)) : undefined),
    }
  })

  if (opts.minTrend != null) {
    const threshold = opts.minTrend
    enriched = enriched.filter((i) => (i.trendCount ?? 0) >= threshold)
  }

  // "saved today" headline count — save events since UTC midnight.
  const midnight = new Date()
  midnight.setUTCHours(0, 0, 0, 0)
  const savedTodayRow = db
    .select({ c: sql<number>`count(*)` })
    .from(activity)
    .where(and(eq(activity.action, 'save'), gte(activity.createdAt, midnight.toISOString())))
    .get()
  const savedToday = Number(savedTodayRow?.c) || 0

  // Rolling-24h engagement count — saves + previews — for the "lots of activity"
  // live pill. Previews dominate, so this reads much livelier than saves alone
  // while staying a real number (reads are excluded — they're not engagement).
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const recentActivityRow = db
    .select({ c: sql<number>`count(*)` })
    .from(activity)
    .where(
      and(inArray(activity.action, ['save', 'preview', 'share']), gte(activity.createdAt, dayAgo)),
    )
    .get()
  const recentActivity = Number(recentActivityRow?.c) || 0

  return { items: enriched, savedToday, recentActivity, hasMore }
}
