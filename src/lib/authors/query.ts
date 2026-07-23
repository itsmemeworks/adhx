import { db } from '@/lib/db'
import { activity, bookmarks, bookmarkMedia, bookmarkLinks } from '@/lib/db/schema'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { previewPath } from '@/lib/activity/preview-path'

/**
 * Author hub query — the anonymity-safe data layer for the public `/{username}`
 * pages. Mirrors the invariants of `src/lib/trending/query.ts` (read that file
 * first if you're touching this one):
 *
 * ANONYMITY INVARIANT: `activity.userId` is NEVER selected. `bookmarks.userId`
 * is only ever touched inside a `count(distinct …)` SQL aggregate (to produce
 * an anonymous save count) — the raw value is never returned to a caller.
 *
 * Unlike the trending pulse (a recent-events window), this is a per-author
 * lookup across ALL of an author's public history: every `activity` row
 * recorded for them (preview/save events) UNIONed with every `bookmarks` row
 * any user has saved for them (aggregated so multiple savers of the same post
 * collapse into one row + a save count). X/Twitter only — IG/TikTok/YouTube
 * have no author-only URL in this app, and `/{username}` is specifically
 * catching X handle-name search queries.
 */

export type ContentType = 'video' | 'photo' | 'text' | 'quote' | 'article'
const CONTENT_TYPES = new Set<string>(['video', 'photo', 'text', 'quote', 'article'])
function asContentType(v: string | null | undefined): ContentType | undefined {
  return v && CONTENT_TYPES.has(v) ? (v as ContentType) : undefined
}

/** X handle validation: 1-15 alphanumeric/underscore chars, same rule the status route uses. */
const HANDLE_RE = /^\w{1,15}$/
export function isValidHandle(handle: string): boolean {
  return HANDLE_RE.test(handle)
}

/** Public per-post item shown on the author hub. No `userId` anywhere. */
export interface AuthorItem {
  bookmarkId: string
  text: string | null
  thumbnailUrl: string | null
  url: string
  createdAt: string
  /** Distinct ADHX users who've saved this specific post (anonymous count). */
  saveCount: number
  contentType: ContentType
}

export interface AuthorProfile {
  /** Canonical-cased handle, taken from the most recent record we have. */
  handle: string
  authorName: string | null
  avatarUrl: string | null
  items: AuthorItem[]
  /** Total distinct public posts for this author (not capped to `items.length`). */
  totalCount: number
}

const ITEM_LIMIT = 30
// Raw activity rows fetched per author before dedup — generous cap so an
// active author's full recent history is available, without an unbounded scan.
const ACTIVITY_FETCH_CAP = 500

const CACHE_TTL_MS = 30_000
type AuthorCache = Map<string, { value: AuthorProfile | null; expiresAt: number }>
const cachesByDb = new WeakMap<object, AuthorCache>()

function getCache(): AuthorCache {
  let c = cachesByDb.get(db as object)
  if (!c) {
    c = new Map()
    cachesByDb.set(db as object, c)
  }
  return c
}

/**
 * Fetch a public author profile (handle + display info + recent public
 * items). Returns `null` for an invalid handle or one with zero public
 * activity — callers should treat `null` as "404".
 */
export async function getAuthorProfile(handleParam: string): Promise<AuthorProfile | null> {
  const handle = handleParam.trim()
  if (!isValidHandle(handle)) return null

  const cache = getCache()
  const key = handle.toLowerCase()
  const now = Date.now()
  const hit = cache.get(key)
  if (hit && hit.expiresAt > now) return hit.value

  const value = await fetchAuthorProfile(handle)
  cache.set(key, { value, expiresAt: now + CACHE_TTL_MS })
  return value
}

interface MergedItem {
  bookmarkId: string
  author: string
  authorName: string | null
  authorAvatarUrl: string | null
  text: string | null
  thumbnailUrl: string | null
  url: string
  createdAt: string
  saveCount: number
  isQuote: boolean
  category: string | null
  /** Server-resolved type recorded at preview time, for posts never saved. */
  previewContentType: ContentType | undefined
  /** Whether this post has a saved bookmark (authoritative type source). */
  isSaved: boolean
}

async function fetchAuthorProfile(handle: string): Promise<AuthorProfile | null> {
  // ANONYMITY CHOKE POINT: only public columns selected — `userId` is
  // intentionally absent from the activity select.
  const activityRows = db
    .select({
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
    .where(and(eq(activity.platform, 'twitter'), sql`lower(${activity.author}) = lower(${handle})`))
    .orderBy(desc(activity.createdAt))
    .limit(ACTIVITY_FETCH_CAP)
    .all()

  // Aggregate saved bookmarks for this author across ALL savers, collapsed to
  // one row per post. `count(distinct user_id)` is the only place `userId`
  // is touched — it never leaves this query as a raw value.
  const bookmarkAgg = db
    .select({
      id: bookmarks.id,
      author: sql<string>`max(${bookmarks.author})`,
      authorName: sql<string | null>`max(${bookmarks.authorName})`,
      authorAvatarUrl: sql<string | null>`max(${bookmarks.authorProfileImageUrl})`,
      text: sql<string>`max(${bookmarks.text})`,
      processedAt: sql<string>`max(${bookmarks.processedAt})`,
      isQuote: sql<number>`max(${bookmarks.isQuote})`,
      category: sql<string | null>`max(${bookmarks.category})`,
      saveCount: sql<number>`count(distinct ${bookmarks.userId})`,
    })
    .from(bookmarks)
    .where(
      and(eq(bookmarks.platform, 'twitter'), sql`lower(${bookmarks.author}) = lower(${handle})`),
    )
    .groupBy(bookmarks.id)
    .all()

  if (activityRows.length === 0 && bookmarkAgg.length === 0) return null

  const merged = new Map<string, MergedItem>()

  // Seed from saved bookmarks first — authoritative content for saved posts.
  for (const b of bookmarkAgg) {
    merged.set(b.id, {
      bookmarkId: b.id,
      author: b.author,
      authorName: b.authorName,
      authorAvatarUrl: b.authorAvatarUrl,
      text: b.text,
      thumbnailUrl: null,
      url: previewPath('twitter', b.author, b.id),
      createdAt: b.processedAt,
      saveCount: Number(b.saveCount) || 0,
      isQuote: !!Number(b.isQuote),
      category: b.category,
      previewContentType: undefined,
      isSaved: true,
    })
  }

  // Merge in activity — adds preview-only posts, and backfills avatar/thumbnail/
  // recency for posts that are also saved (activity may be fresher or carry a
  // thumbnail the bookmark aggregate doesn't).
  for (const a of activityRows) {
    const existing = merged.get(a.bookmarkId)
    if (existing) {
      if (a.createdAt > existing.createdAt) existing.createdAt = a.createdAt
      if (!existing.authorAvatarUrl && a.authorAvatarUrl)
        existing.authorAvatarUrl = a.authorAvatarUrl
      if (!existing.thumbnailUrl && a.thumbnailUrl) existing.thumbnailUrl = a.thumbnailUrl
    } else {
      merged.set(a.bookmarkId, {
        bookmarkId: a.bookmarkId,
        author: a.author,
        authorName: a.authorName,
        authorAvatarUrl: a.authorAvatarUrl,
        text: a.text,
        thumbnailUrl: a.thumbnailUrl,
        url: a.url || previewPath('twitter', a.author, a.bookmarkId),
        createdAt: a.createdAt,
        saveCount: 0,
        isQuote: false,
        category: null,
        previewContentType: asContentType(a.contentType),
        isSaved: false,
      })
    }
  }

  const all = [...merged.values()].sort((x, y) => (x.createdAt < y.createdAt ? 1 : -1))
  const totalCount = all.length
  const top = all.slice(0, ITEM_LIMIT)
  const ids = top.map((i) => i.bookmarkId)

  // Media kinds + article cover/title, same enrichment shape as the trending
  // query. Cross-user is fine here (media/links are identical regardless of
  // who saved the post).
  const mediaKinds = new Map<string, { video: boolean; photo: boolean }>()
  const articleCovers = new Map<string, string>()
  const articleTitles = new Map<string, string>()
  if (ids.length > 0) {
    const mediaRows = db
      .select({ bookmarkId: bookmarkMedia.bookmarkId, mediaType: bookmarkMedia.mediaType })
      .from(bookmarkMedia)
      .where(and(eq(bookmarkMedia.platform, 'twitter'), inArray(bookmarkMedia.bookmarkId, ids)))
      .all()
    for (const m of mediaRows) {
      const cur = mediaKinds.get(m.bookmarkId) ?? { video: false, photo: false }
      if (m.mediaType === 'video' || m.mediaType === 'animated_gif') cur.video = true
      else if (m.mediaType === 'photo') cur.photo = true
      mediaKinds.set(m.bookmarkId, cur)
    }

    const linkRows = db
      .select({
        bookmarkId: bookmarkLinks.bookmarkId,
        linkType: bookmarkLinks.linkType,
        imageUrl: bookmarkLinks.previewImageUrl,
        title: bookmarkLinks.previewTitle,
      })
      .from(bookmarkLinks)
      .where(and(eq(bookmarkLinks.platform, 'twitter'), inArray(bookmarkLinks.bookmarkId, ids)))
      .all()
    for (const l of linkRows) {
      if (l.imageUrl && (!articleCovers.has(l.bookmarkId) || l.linkType === 'article'))
        articleCovers.set(l.bookmarkId, l.imageUrl)
      if (l.title && (!articleTitles.has(l.bookmarkId) || l.linkType === 'article'))
        articleTitles.set(l.bookmarkId, l.title)
    }
  }

  const typeOf = (item: MergedItem): ContentType => {
    if (!item.isSaved) return item.previewContentType ?? 'text'
    const m = mediaKinds.get(item.bookmarkId)
    if (m?.video) return 'video'
    if (item.category === 'article') return 'article'
    if (m?.photo) return 'photo'
    if (item.isQuote) return 'quote'
    return 'text'
  }

  const items: AuthorItem[] = top.map((item) => {
    const contentType = typeOf(item)
    const isArticle = contentType === 'article'
    return {
      bookmarkId: item.bookmarkId,
      text: isArticle ? (articleTitles.get(item.bookmarkId) ?? item.text) : item.text,
      thumbnailUrl: isArticle
        ? (articleCovers.get(item.bookmarkId) ?? item.thumbnailUrl)
        : item.thumbnailUrl,
      url: item.url,
      createdAt: item.createdAt,
      saveCount: item.saveCount,
      contentType,
    }
  })

  // Profile identity comes from the most recent record we have for this
  // author (preferring whichever event is newest, saved or preview-only).
  const newest = all[0]

  return {
    handle: newest.author,
    authorName: newest.authorName,
    avatarUrl: newest.authorAvatarUrl,
    items,
    totalCount,
  }
}
