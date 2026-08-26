import { db } from '@/lib/db'
import { tagShares, bookmarkTags, bookmarks, bookmarkMedia, bookmarkLinks } from '@/lib/db/schema'
import { eq, and, inArray, desc } from 'drizzle-orm'
import { getUserIdForUsername } from '@/lib/users/lookup'
import { previewPath, sourceUrl } from '@/lib/activity/preview-path'
import { getThumbnailUrl } from '@/lib/media/fxembed'
import { inferContentType } from '@/lib/content-type'
import {
  moderationStateFingerprint,
  readModeratedPostKeys,
  readUserBan,
} from '@/lib/admin/moderation'
import { TtlLruCache } from '@/lib/cache/ttl-lru'

/**
 * Public tag-collection query — the data layer for `/t/{username}/{tag}`.
 * Mirrors the shape/invariants of `src/lib/authors/query.ts`: a pure async
 * fetch function, short-lived per-db TTL cache, dependency-free result type
 * safe to render straight into server-rendered HTML + JSON-LD.
 *
 * PRIVACY INVARIANT: a tag's contents are only ever returned when the owning
 * user has explicitly marked the tag public (`tag_shares.is_public`). This is
 * the exact same gate `/api/share/tag/by-name/[username]/[tag]` enforces —
 * this module is a second, independent implementation (not a re-export of the
 * API route) so review both together if the sharing rule ever changes.
 */

export type ContentType = 'video' | 'photo' | 'text' | 'article'

export interface TagItem {
  bookmarkId: string
  platform: string
  author: string
  authorName: string | null
  authorAvatarUrl: string | null
  text: string | null
  thumbnailUrl: string | null
  /** Extra photos beyond the first, for a "+N" badge (0 for single/no media). */
  extraMediaCount: number
  contentType: ContentType
  createdAt: string | null
  /** When the bookmark was saved to ADHX — THE displayed time in the theater (owner decision: never the source platform's own publish date). Optional so older fixtures/consumers don't break; absent reads as unknown. */
  addedAt?: string | null
  /** On-ADHX preview path — the primary, on-site link for the card. */
  url: string
  /** Original platform URL — demoted to a small secondary icon on the card. */
  externalUrl: string | null
}

export interface TagCollection {
  tag: string
  username: string
  items: TagItem[]
  tweetCount: number
}

export type TagCollectionResult =
  { status: 'not_found' } | { status: 'private' } | { status: 'ok'; data: TagCollection }

const ITEM_LIMIT = 60

const CACHE_TTL_MS = 30_000
const CACHE_MAX_ENTRIES = 128
interface TagCacheEntry {
  value: TagCollectionResult
  moderationKey: string
}
type TagCache = TtlLruCache<string, TagCacheEntry>
const cachesByDb = new WeakMap<object, TagCache>()

function getCache(): TagCache {
  let c = cachesByDb.get(db as object)
  if (!c) {
    c = new TtlLruCache({ maxSize: CACHE_MAX_ENTRIES, ttlMs: CACHE_TTL_MS })
    cachesByDb.set(db as object, c)
  }
  return c
}

/** Drop a cached playlist read so a visibility PATCH is visible immediately. */
export function invalidateTagCollectionCache(username?: string, tag?: string): void {
  const cache = getCache()
  if (!username || !tag) {
    cache.clear()
    return
  }
  cache.delete(`${username.toLowerCase()}:${tag}`)
}

/**
 * Fetch a public tag collection by username + tag name. Returns `not_found`
 * when the user or tag doesn't exist, `private` when the tag exists but isn't
 * publicly shared (never renders its contents), or `ok` with the items.
 */
export async function getPublicTagCollection(
  username: string,
  tagName: string,
): Promise<TagCollectionResult> {
  const ownerId = await getUserIdForUsername(username)
  if (!ownerId) return { status: 'not_found' }
  const ban = readUserBan(ownerId)
  const moderated = readModeratedPostKeys()
  if (!ban.ok || ban.value || !moderated.ok) return { status: 'not_found' }
  const moderationKey = moderationStateFingerprint(moderated.value)

  const cache = getCache()
  const key = `${username.toLowerCase()}:${tagName}`
  const hit = cache.get(key)
  if (hit && hit.moderationKey === moderationKey) return hit.value

  const value = await fetchTagCollection(username, tagName, ownerId, moderated.value)
  // Never cache private/not_found — a visibility PATCH must be visible on the
  // next request, and those misses are a cheap local read.
  if (value.status === 'ok') {
    cache.set(key, { value, moderationKey })
  }
  return value
}

/** Best-effort thumbnail for a tagged item, platform-aware (mirrors trending/query.ts's thumbOf). */
function resolveThumbnail(
  item: {
    platform: string
    id: string
    author: string
    contentType: ContentType
  },
  firstMedia: { mediaType: string; previewUrl: string | null } | undefined,
): string | null {
  if (item.platform === 'tiktok') {
    return `/api/media/tiktok/thumbnail?username=${encodeURIComponent(item.author)}&id=${encodeURIComponent(item.id)}`
  }
  if (item.platform === 'instagram') {
    return `/api/media/instagram/thumbnail?id=${encodeURIComponent(item.id)}`
  }
  if (item.platform === 'youtube') {
    return `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`
  }
  // Twitter: use FxEmbed URLs, which need media type + preview url.
  if (!firstMedia) return null
  const mediaType = firstMedia.mediaType as 'photo' | 'video' | 'animated_gif'
  return getThumbnailUrl({
    tweetId: item.id,
    author: item.author,
    mediaType,
    mediaIndex: 1,
    previewUrl: firstMedia.previewUrl || undefined,
  })
}

async function fetchTagCollection(
  username: string,
  tagName: string,
  ownerId: string,
  moderated: ReadonlySet<string>,
): Promise<TagCollectionResult> {
  const [share] = await db
    .select()
    .from(tagShares)
    .where(and(eq(tagShares.userId, ownerId), eq(tagShares.tag, tagName)))
    .limit(1)
  if (!share) return { status: 'not_found' }
  if (!share.isPublic) return { status: 'private' }

  const taggedRows = db
    .select({
      bookmarkId: bookmarkTags.bookmarkId,
      platform: bookmarkTags.platform,
      // When the curator added this post to THIS tag — what the playlist shows
      // and orders by. Null for rows predating the column; the fallback below
      // is the bookmark's own save time, which is what migrate.ts backfills.
      taggedAt: bookmarkTags.createdAt,
    })
    .from(bookmarkTags)
    .where(and(eq(bookmarkTags.userId, ownerId), eq(bookmarkTags.tag, tagName)))
    .all()

  if (taggedRows.length === 0) {
    return { status: 'ok', data: { tag: tagName, username, items: [], tweetCount: 0 } }
  }

  // Match on (platform, id) — not just id — so a bookmark id that happens to
  // collide across platforms (e.g. a numeric TikTok id equal to a tweet id)
  // can never be mismatched to the wrong platform's content.
  const taggedKeySet = new Set(taggedRows.map((r) => `${r.platform}:${r.bookmarkId}`))
  const taggedAtByKey = new Map(
    taggedRows.map((r) => [`${r.platform}:${r.bookmarkId}`, r.taggedAt ?? null]),
  )
  const allIds = [...new Set(taggedRows.map((r) => r.bookmarkId))]

  const bookmarkResults = db
    .select()
    .from(bookmarks)
    .where(and(eq(bookmarks.userId, ownerId), inArray(bookmarks.id, allIds)))
    .orderBy(desc(bookmarks.processedAt))
    .all()

  const matched = bookmarkResults
    .filter((b) => taggedKeySet.has(`${b.platform}:${b.id}`))
    .filter((b) => !moderated.has(`${b.platform}:${b.id}`))
    // Newest-added-to-the-tag first. A playlist is ordered by when its curator
    // put each post IN it (owner) — not by when they first saved the post,
    // which is what `bookmarks.processedAt` above says. Rows with no
    // membership time fall back to that save time so pre-column playlists keep
    // a sensible order.
    .sort((a, b) => {
      const at = taggedAtByKey.get(`${a.platform}:${a.id}`) ?? a.processedAt ?? ''
      const bt = taggedAtByKey.get(`${b.platform}:${b.id}`) ?? b.processedAt ?? ''
      return bt.localeCompare(at)
    })
  const ids = matched.map((b) => b.id)

  const mediaResults =
    ids.length > 0
      ? db
          .select()
          .from(bookmarkMedia)
          .where(and(eq(bookmarkMedia.userId, ownerId), inArray(bookmarkMedia.bookmarkId, ids)))
          .all()
      : []

  const linkResults =
    ids.length > 0
      ? db
          .select({
            bookmarkId: bookmarkLinks.bookmarkId,
            platform: bookmarkLinks.platform,
            linkType: bookmarkLinks.linkType,
            imageUrl: bookmarkLinks.previewImageUrl,
            title: bookmarkLinks.previewTitle,
          })
          .from(bookmarkLinks)
          .where(and(eq(bookmarkLinks.userId, ownerId), inArray(bookmarkLinks.bookmarkId, ids)))
          .all()
      : []

  const mediaByKey = new Map<string, typeof mediaResults>()
  for (const m of mediaResults) {
    const k = `${m.platform}:${m.bookmarkId}`
    const arr = mediaByKey.get(k) ?? []
    arr.push(m)
    mediaByKey.set(k, arr)
  }

  const articleCovers = new Map<string, string>()
  const articleTitles = new Map<string, string>()
  for (const l of linkResults) {
    const k = `${l.platform}:${l.bookmarkId}`
    if (l.imageUrl && (!articleCovers.has(k) || l.linkType === 'article'))
      articleCovers.set(k, l.imageUrl)
    if (l.title && (!articleTitles.has(k) || l.linkType === 'article'))
      articleTitles.set(k, l.title)
  }

  const items: TagItem[] = matched.slice(0, ITEM_LIMIT).map((b) => {
    const key = `${b.platform}:${b.id}`
    const media = mediaByKey.get(key) ?? []
    const hasVideo = media.some((m) => m.mediaType === 'video' || m.mediaType === 'animated_gif')
    const hasPhoto = media.some((m) => m.mediaType === 'photo')

    const contentType = inferContentType({
      platform: b.platform,
      category: b.category,
      hasVideo,
      hasPhoto,
    })

    const isArticle = contentType === 'article'
    const thumbnailUrl = isArticle
      ? (articleCovers.get(key) ??
        resolveThumbnail(
          { platform: b.platform, id: b.id, author: b.author, contentType },
          media[0],
        ))
      : resolveThumbnail(
          { platform: b.platform, id: b.id, author: b.author, contentType },
          media[0],
        )

    return {
      bookmarkId: b.id,
      platform: b.platform,
      author: b.author,
      authorName: b.authorName,
      authorAvatarUrl: b.authorProfileImageUrl,
      text: isArticle ? (articleTitles.get(key) ?? b.text) : b.text,
      thumbnailUrl,
      extraMediaCount: Math.max(0, media.length - 1),
      contentType,
      createdAt: b.createdAt,
      // The playlist's own time: when this post was added to the tag.
      addedAt: taggedAtByKey.get(key) ?? b.processedAt ?? null,
      url: previewPath(b.platform, b.author, b.id),
      externalUrl: sourceUrl(b.platform, b.author, b.id),
    }
  })

  return {
    status: 'ok',
    data: { tag: tagName, username, items, tweetCount: matched.length },
  }
}
