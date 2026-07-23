import { db } from '@/lib/db'
import {
  tagShares,
  bookmarkTags,
  bookmarks,
  bookmarkMedia,
  bookmarkLinks,
  oauthTokens,
} from '@/lib/db/schema'
import { eq, and, inArray, desc } from 'drizzle-orm'
import { previewPath, sourceUrl } from '@/lib/activity/preview-path'
import { getThumbnailUrl } from '@/lib/media/fxembed'

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

export type ContentType = 'video' | 'photo' | 'text' | 'quote' | 'article'

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
  | { status: 'not_found' }
  | { status: 'private' }
  | { status: 'ok'; data: TagCollection }

const ITEM_LIMIT = 60

const CACHE_TTL_MS = 30_000
type TagCache = Map<string, { value: TagCollectionResult; expiresAt: number }>
const cachesByDb = new WeakMap<object, TagCache>()

function getCache(): TagCache {
  let c = cachesByDb.get(db as object)
  if (!c) {
    c = new Map()
    cachesByDb.set(db as object, c)
  }
  return c
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
  const cache = getCache()
  const key = `${username.toLowerCase()}:${tagName}`
  const now = Date.now()
  const hit = cache.get(key)
  if (hit && hit.expiresAt > now) return hit.value

  const value = await fetchTagCollection(username, tagName)
  cache.set(key, { value, expiresAt: now + CACHE_TTL_MS })
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

async function fetchTagCollection(username: string, tagName: string): Promise<TagCollectionResult> {
  const [user] = await db
    .select({ userId: oauthTokens.userId })
    .from(oauthTokens)
    .where(eq(oauthTokens.username, username))
    .limit(1)
  if (!user) return { status: 'not_found' }

  const [share] = await db
    .select()
    .from(tagShares)
    .where(and(eq(tagShares.userId, user.userId), eq(tagShares.tag, tagName)))
    .limit(1)
  if (!share) return { status: 'not_found' }
  if (!share.isPublic) return { status: 'private' }

  const taggedRows = db
    .select({ bookmarkId: bookmarkTags.bookmarkId, platform: bookmarkTags.platform })
    .from(bookmarkTags)
    .where(and(eq(bookmarkTags.userId, user.userId), eq(bookmarkTags.tag, tagName)))
    .all()

  if (taggedRows.length === 0) {
    return { status: 'ok', data: { tag: tagName, username, items: [], tweetCount: 0 } }
  }

  // Match on (platform, id) — not just id — so a bookmark id that happens to
  // collide across platforms (e.g. a numeric TikTok id equal to a tweet id)
  // can never be mismatched to the wrong platform's content.
  const taggedKeySet = new Set(taggedRows.map((r) => `${r.platform}:${r.bookmarkId}`))
  const allIds = [...new Set(taggedRows.map((r) => r.bookmarkId))]

  const bookmarkResults = db
    .select()
    .from(bookmarks)
    .where(and(eq(bookmarks.userId, user.userId), inArray(bookmarks.id, allIds)))
    .orderBy(desc(bookmarks.processedAt))
    .all()

  const matched = bookmarkResults.filter((b) => taggedKeySet.has(`${b.platform}:${b.id}`))
  const ids = matched.map((b) => b.id)

  const mediaResults =
    ids.length > 0
      ? db
          .select()
          .from(bookmarkMedia)
          .where(and(eq(bookmarkMedia.userId, user.userId), inArray(bookmarkMedia.bookmarkId, ids)))
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
          .where(and(eq(bookmarkLinks.userId, user.userId), inArray(bookmarkLinks.bookmarkId, ids)))
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

    let contentType: ContentType
    if (b.platform === 'tiktok' || b.platform === 'youtube' || b.platform === 'instagram') {
      contentType = 'video'
    } else if (hasVideo) {
      contentType = 'video'
    } else if (b.category === 'article') {
      contentType = 'article'
    } else if (hasPhoto) {
      contentType = 'photo'
    } else if (b.isQuote) {
      contentType = 'quote'
    } else {
      contentType = 'text'
    }

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
      url: previewPath(b.platform, b.author, b.id),
      externalUrl: sourceUrl(b.platform, b.author, b.id),
    }
  })

  return {
    status: 'ok',
    data: { tag: tagName, username, items, tweetCount: matched.length },
  }
}
