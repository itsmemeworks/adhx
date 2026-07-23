import { db } from '@/lib/db'
import { activity, bookmarks, bookmarkMedia, bookmarkLinks } from '@/lib/db/schema'
import { and, desc, gte, inArray, lt, sql } from 'drizzle-orm'
import type { ContentType } from '@/components/matter'
import type { TrendingItem } from './query'

/**
 * Weekly trending archive — permanent, crawlable snapshots of the anonymous
 * activity pulse, one page per ISO-8601 week ("2026-w30").
 *
 * `/trending` is ephemeral (a rolling window of recent events), so it accrues
 * no lasting SEO value: yesterday's community pulse vanishes without a trace.
 * This module buckets the same `activity` log into permanent weekly snapshots
 * that accrete forever into a growing corpus.
 *
 * ANONYMITY INVARIANT (mirrors `./query`, the audited choke point for the
 * live pulse): `activity.userId` is NEVER selected here, and the bookmark
 * join used for enrichment must never surface an owner's identity. Any read
 * path added to this module must keep `userId` out of the select list.
 *
 * This module deliberately duplicates a slice of `./query`'s enrichment logic
 * (save counts, content type, thumbnail resolution) rather than importing it,
 * because `./query` exports only the high-level `getTrendingItems()` — there
 * is no lower-level enrichment function to reuse, and this file does not own
 * (and must not edit) `./query`.
 */

// ─────────────────────────────────────────────────────────────────────────
// ISO-8601 week helpers (no external deps). Weeks start Monday; week 1 is the
// week containing the year's first Thursday (equivalently, the week
// containing January 4th). Verified against Python's `date.isocalendar()`
// for the standard edge cases (year-boundary weeks, 53-week years).
// ─────────────────────────────────────────────────────────────────────────

export interface IsoWeek {
  isoYear: number
  isoWeek: number
}

const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_MS = 7 * DAY_MS

/** The ISO week (year + week number) containing `date`, per UTC calendar day. */
export function isoWeekOf(date: Date): IsoWeek {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const dayNum = (d.getUTCDay() + 6) % 7 // Monday=0 .. Sunday=6
  d.setUTCDate(d.getUTCDate() - dayNum + 3) // move to the Thursday of this ISO week
  const isoYear = d.getUTCFullYear()
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4))
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3)
  const isoWeek = 1 + Math.round((d.getTime() - firstThursday.getTime()) / WEEK_MS)
  return { isoYear, isoWeek }
}

/** Lowercase slug for an ISO week, e.g. `2026-w30`. */
export function isoWeekSlugOf({ isoYear, isoWeek }: IsoWeek): string {
  return `${isoYear}-w${String(isoWeek).padStart(2, '0')}`
}

/** The Monday 00:00:00 UTC that starts a given ISO week. */
export function isoWeekStart(isoYear: number, isoWeek: number): Date {
  const jan4 = new Date(Date.UTC(isoYear, 0, 4))
  const jan4DayNum = (jan4.getUTCDay() + 6) % 7 // Monday=0
  const week1Monday = new Date(jan4)
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4DayNum)
  const start = new Date(week1Monday)
  start.setUTCDate(week1Monday.getUTCDate() + (isoWeek - 1) * 7)
  return start
}

/** Number of ISO weeks in `isoYear` (52 or 53). Dec 28 always falls in the last ISO week. */
export function isoWeeksInYear(isoYear: number): number {
  return isoWeekOf(new Date(Date.UTC(isoYear, 11, 28))).isoWeek
}

/**
 * Parse a `yyyy-wNN` slug (case-insensitive) into its ISO year/week, validating
 * that the week actually exists for that ISO year (rejects e.g. `2026-w53`
 * when 2026 only has 52 weeks). Returns null for anything malformed.
 */
export function parseIsoWeekSlug(slug: string): IsoWeek | null {
  const m = /^(\d{4})-w(\d{2})$/i.exec(slug.trim())
  if (!m) return null
  const isoYear = Number(m[1])
  const isoWeek = Number(m[2])
  if (!Number.isInteger(isoWeek) || isoWeek < 1) return null
  if (isoWeek > isoWeeksInYear(isoYear)) return null
  return { isoYear, isoWeek }
}

/**
 * `[start, end)` UTC range for an ISO week — `start` is Monday 00:00:00 UTC,
 * `end` is the following Monday 00:00:00 UTC (exclusive upper bound).
 */
export function isoWeekRange(isoYear: number, isoWeek: number): { start: Date; end: Date } {
  const start = isoWeekStart(isoYear, isoWeek)
  const end = new Date(start.getTime() + WEEK_MS)
  return { start, end }
}

/**
 * Human date-range label for a week, e.g. `Jul 20–26, 2026`, `Jun 29 – Jul 5,
 * 2026` (crosses a month), or `Dec 29, 2025 – Jan 4, 2026` (crosses a year).
 * `end` is the exclusive next-Monday bound (from `isoWeekRange`).
 */
export function formatIsoWeekRange(start: Date, end: Date): string {
  const lastDay = new Date(end.getTime() - DAY_MS) // the week's Sunday
  const sameYear = start.getUTCFullYear() === lastDay.getUTCFullYear()
  const sameMonth = sameYear && start.getUTCMonth() === lastDay.getUTCMonth()

  const monthDay = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
  const dayOnly = new Intl.DateTimeFormat('en-US', { day: 'numeric', timeZone: 'UTC' })
  const withYear = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })

  if (sameMonth) {
    return `${monthDay.format(start)}–${dayOnly.format(lastDay)}, ${lastDay.getUTCFullYear()}`
  }
  if (sameYear) {
    return `${monthDay.format(start)} – ${monthDay.format(lastDay)}, ${lastDay.getUTCFullYear()}`
  }
  return `${withYear.format(start)} – ${withYear.format(lastDay)}`
}

/** The slug for the ISO week containing "now" — used to exclude the in-progress week. */
export function currentIsoWeekSlug(): string {
  return isoWeekSlugOf(isoWeekOf(new Date()))
}

/** Whether `slug` names the current, still-in-progress ISO week. */
export function isCurrentIsoWeek(slug: string): boolean {
  return slug.toLowerCase() === currentIsoWeekSlug()
}

/**
 * The slug `deltaWeeks` weeks before/after `slug` (negative = earlier). Null
 * if `slug` doesn't parse.
 */
export function shiftWeekSlug(slug: string, deltaWeeks: number): string | null {
  const parsed = parseIsoWeekSlug(slug)
  if (!parsed) return null
  const { start } = isoWeekRange(parsed.isoYear, parsed.isoWeek)
  const shifted = new Date(start.getTime() + deltaWeeks * WEEK_MS)
  return isoWeekSlugOf(isoWeekOf(shifted))
}

// ─────────────────────────────────────────────────────────────────────────
// Data layer
// ─────────────────────────────────────────────────────────────────────────

/** Max cards shown/counted per week — keeps a busy week's page a fixed size. */
const MAX_ITEMS_PER_WEEK = 50

/**
 * Raw rows scanned when discovering which weeks exist at all. A soft cap, not
 * a hard guarantee: an extremely long-running instance with more than this
 * many total activity rows could miss its very oldest weeks from the archive
 * index (they'd still render fine at their direct URL, since `getArchiveItems`
 * queries by date range, not by this scan). Mirrors the over-fetch-and-cap
 * tolerance documented on `./query`'s `rawFetchSize`.
 */
const WEEK_DISCOVERY_ROW_CAP = 20_000

/** Raw rows scanned for a single week — generous; a week is a bounded window. */
const PER_WEEK_ROW_CAP = 3_000

export interface ArchiveWeekSummary {
  slug: string
  isoYear: number
  isoWeek: number
  /** ISO 8601 UTC start (Monday 00:00:00). */
  start: string
  /** ISO 8601 UTC end, exclusive (following Monday 00:00:00). */
  end: string
  label: string
  /** Deduped post count for the week, capped at `MAX_ITEMS_PER_WEEK` (matches what the week page shows). */
  itemCount: number
}

/** One row per deduped post — enough to bucket into weeks and count. */
function postKey(row: { platform: string; bookmarkId: string | null; url: string }): string {
  return `${row.platform}:${row.bookmarkId || row.url}`
}

/**
 * List ISO weeks that have at least one activity event, newest first,
 * EXCLUDING the current in-progress week (it isn't a finished snapshot yet).
 *
 * ANONYMITY: selects only `platform`, `bookmarkId`, `url`, `createdAt` — no
 * `userId`.
 */
export async function listArchiveWeeks(): Promise<ArchiveWeekSummary[]> {
  const rows = db
    .select({
      platform: activity.platform,
      bookmarkId: activity.bookmarkId,
      url: activity.url,
      createdAt: activity.createdAt,
    })
    .from(activity)
    .orderBy(desc(activity.createdAt))
    .limit(WEEK_DISCOVERY_ROW_CAP)
    .all()

  const currentSlug = currentIsoWeekSlug()

  // Bucket by week slug, deduping to one post per week (newest event wins —
  // matches the trending feed's dedup rule, action-agnostic).
  const seenPerWeek = new Map<string, Set<string>>()
  const orderedSlugs: string[] = []
  const weekOf = new Map<string, IsoWeek>()

  for (const row of rows) {
    const created = new Date(row.createdAt)
    const iso = isoWeekOf(created)
    const slug = isoWeekSlugOf(iso)
    if (slug === currentSlug) continue

    let seen = seenPerWeek.get(slug)
    if (!seen) {
      seen = new Set()
      seenPerWeek.set(slug, seen)
      orderedSlugs.push(slug)
      weekOf.set(slug, iso)
    }
    seen.add(postKey(row))
  }

  return orderedSlugs.map((slug) => {
    const iso = weekOf.get(slug)!
    const { start, end } = isoWeekRange(iso.isoYear, iso.isoWeek)
    return {
      slug,
      isoYear: iso.isoYear,
      isoWeek: iso.isoWeek,
      start: start.toISOString(),
      end: end.toISOString(),
      label: formatIsoWeekRange(start, end),
      itemCount: Math.min(seenPerWeek.get(slug)!.size, MAX_ITEMS_PER_WEEK),
    }
  })
}

export interface ArchiveWeekResult {
  slug: string
  isoYear: number
  isoWeek: number
  start: string
  end: string
  label: string
  items: TrendingItem[]
  /** Deduped post count before the `MAX_ITEMS_PER_WEEK` cap. */
  totalCount: number
}

const CONTENT_TYPES = new Set<string>(['video', 'photo', 'text', 'quote', 'article'])
function asContentType(v: string | null | undefined): ContentType | undefined {
  return v && CONTENT_TYPES.has(v) ? (v as ContentType) : undefined
}

/**
 * Fetch + enrich the deduped, ranked posts for one ISO week. Returns null for
 * an unparseable slug, the current in-progress week (not archived yet), or a
 * week with zero activity — callers should treat null as `notFound()`.
 *
 * Enrichment mirrors `./query`'s `fetchTrendingItems` (save count, real
 * content type from the saved bookmark, thumbnail resolution incl. the TikTok
 * proxy + article covers, author avatar) — duplicated here rather than
 * imported since `./query` doesn't export that layer separately.
 */
export async function getArchiveItems(slug: string): Promise<ArchiveWeekResult | null> {
  const parsed = parseIsoWeekSlug(slug)
  if (!parsed) return null
  if (isCurrentIsoWeek(slug)) return null

  const { start, end } = isoWeekRange(parsed.isoYear, parsed.isoWeek)

  // ANONYMITY CHOKE POINT: public columns only, no `userId`.
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
      url: activity.url,
      createdAt: activity.createdAt,
    })
    .from(activity)
    .where(
      and(gte(activity.createdAt, start.toISOString()), lt(activity.createdAt, end.toISOString())),
    )
    .orderBy(desc(activity.createdAt))
    .limit(PER_WEEK_ROW_CAP)
    .all()

  if (rows.length === 0) return null

  // One row per post, newest event wins (matches the live pulse's dedup rule).
  const seen = new Set<string>()
  const deduped: typeof rows = []
  for (const row of rows) {
    const key = postKey(row)
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(row)
  }
  const totalCount = deduped.length

  const ids = [...new Set(deduped.map((i) => i.bookmarkId).filter(Boolean))]

  const counts = new Map<string, number>()
  const flags = new Map<string, { isQuote: boolean; category: string | null }>()
  const mediaKinds = new Map<string, { video: boolean; photo: boolean }>()
  const articleCovers = new Map<string, string>()
  const articleTitles = new Map<string, string>()
  const avatars = new Map<string, string>()

  if (ids.length > 0) {
    const aggRows = db
      .select({
        platform: bookmarks.platform,
        id: bookmarks.id,
        saveCount: sql<number>`count(distinct ${bookmarks.userId})`,
        isQuote: sql<number>`max(${bookmarks.isQuote})`,
        category: sql<string | null>`max(${bookmarks.category})`,
        avatar: sql<string | null>`max(${bookmarks.authorProfileImageUrl})`,
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

    const linkRows = db
      .select({
        platform: bookmarkLinks.platform,
        bookmarkId: bookmarkLinks.bookmarkId,
        linkType: bookmarkLinks.linkType,
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
    }
  }

  const typeOf = (platform: string, key: string): ContentType | undefined => {
    if (platform === 'tiktok' || platform === 'youtube' || platform === 'instagram') return 'video'
    if (!flags.has(key)) return undefined
    const m = mediaKinds.get(key)
    if (m?.video) return 'video'
    if (flags.get(key)?.category === 'article') return 'article'
    if (m?.photo) return 'photo'
    if (flags.get(key)?.isQuote) return 'quote'
    return 'text'
  }

  const thumbOf = (
    i: (typeof deduped)[number],
    key: string,
    type: ContentType | undefined,
  ): string | null => {
    if (i.platform === 'tiktok' && i.author && i.bookmarkId) {
      return `/api/media/tiktok/thumbnail?username=${encodeURIComponent(i.author)}&id=${encodeURIComponent(i.bookmarkId)}`
    }
    if (type === 'article') return articleCovers.get(key) ?? i.thumbnailUrl ?? null
    return i.thumbnailUrl ?? null
  }

  const enriched: TrendingItem[] = deduped.map((i) => {
    const key = `${i.platform}:${i.bookmarkId}`
    const contentType = typeOf(i.platform, key) ?? asContentType(i.contentType)
    return {
      ...i,
      text: contentType === 'article' ? (articleTitles.get(key) ?? i.text) : i.text,
      saveCount: counts.get(key) ?? 0,
      contentType,
      thumbnailUrl: thumbOf(i, key, contentType),
      authorAvatarUrl: i.authorAvatarUrl ?? avatars.get(key) ?? null,
    }
  })

  // Rank by save count, then recency — the archive is a "best of" snapshot,
  // not a chronological feed.
  enriched.sort((a, b) => {
    const d = (b.saveCount ?? 0) - (a.saveCount ?? 0)
    if (d !== 0) return d
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })

  const { start: startRange, end: endRange } = isoWeekRange(parsed.isoYear, parsed.isoWeek)
  return {
    slug: isoWeekSlugOf(parsed),
    isoYear: parsed.isoYear,
    isoWeek: parsed.isoWeek,
    start: startRange.toISOString(),
    end: endRange.toISOString(),
    label: formatIsoWeekRange(startRange, endRange),
    items: enriched.slice(0, MAX_ITEMS_PER_WEEK),
    totalCount,
  }
}
