import { db, runInTransaction } from '@/lib/db'
import { tagShares, bookmarkTags, bookmarks, bookmarkMedia, bookmarkLinks } from '@/lib/db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import { readModeratedPostKeys, readUserBan } from '@/lib/admin/moderation'
import { addedAtForIndex } from '@/lib/sync/added-at'
import { recordCollectionEvent } from '@/lib/discovery/record'
import { resolveMediaUrl, getShareableUrl, getThumbnailUrl } from '@/lib/media/fxembed'

export const MAX_CLONE_SIZE = 100

/** Public reads and clones must use the same fail-closed gate as playlist pages. */
function readPublicTagModeration(ownerId: string): ReadonlySet<string> | null {
  const ban = readUserBan(ownerId)
  const moderated = readModeratedPostKeys()
  if (!ban.ok || ban.value || !moderated.ok) return null
  return moderated.value
}

export function pairKey(platform: string, bookmarkId: string): string {
  return `${platform}:${bookmarkId}`
}

export type CloneTagOk = {
  ok: true
  tag: string
  clonedCount: number
  taggedCount: number
  clonedIds: string[]
  skipped: number
  total: number
}

export type CloneTagErr = {
  ok: false
  status: 400 | 403 | 404
  error: string
}

export type CloneTagResult = CloneTagOk | CloneTagErr

/**
 * Copy a public tag's posts onto `currentUserId`. Pair-safe: every lookup
 * matches `(platform, id)`, not a bare id. Both `/api/share/tag/by-name/…/clone`
 * and the legacy `/api/share/tag/[code]/clone` go through this.
 */
export async function cloneTagToUser(opts: {
  sourceUserId: string
  tagName: string
  currentUserId: string
}): Promise<CloneTagResult> {
  const { sourceUserId, tagName, currentUserId } = opts

  if (sourceUserId === currentUserId) {
    return { ok: false, status: 400, error: 'Cannot clone your own tag' }
  }

  const moderated = readPublicTagModeration(sourceUserId)
  if (!moderated) return { ok: false, status: 404, error: 'Tag not found' }

  const [share] = await db
    .select()
    .from(tagShares)
    .where(and(eq(tagShares.userId, sourceUserId), eq(tagShares.tag, tagName)))
    .limit(1)

  if (!share) return { ok: false, status: 404, error: 'Tag not found' }
  if (!share.isPublic) return { ok: false, status: 403, error: 'This tag is private' }

  const sourceTaggedRows = await db
    .select({
      bookmarkId: bookmarkTags.bookmarkId,
      platform: bookmarkTags.platform,
      taggedAt: bookmarkTags.createdAt,
    })
    .from(bookmarkTags)
    .where(and(eq(bookmarkTags.userId, sourceUserId), eq(bookmarkTags.tag, tagName)))

  const sourceTaggedBookmarks = sourceTaggedRows.filter(
    (row) => !moderated.has(pairKey(row.platform, row.bookmarkId)),
  )

  if (sourceTaggedBookmarks.length === 0) {
    return {
      ok: true,
      tag: tagName,
      clonedCount: 0,
      taggedCount: 0,
      clonedIds: [],
      skipped: 0,
      total: 0,
    }
  }

  if (sourceTaggedBookmarks.length > MAX_CLONE_SIZE) {
    return {
      ok: false,
      status: 400,
      error: `Cannot clone more than ${MAX_CLONE_SIZE} bookmarks at once`,
    }
  }

  const taggedPairKeys = new Set(
    sourceTaggedBookmarks.map((t) => pairKey(t.platform, t.bookmarkId)),
  )
  const pairsToTagMap = new Map<
    string,
    { platform: string; bookmarkId: string; taggedAt: string | null }
  >()
  for (const t of sourceTaggedBookmarks) {
    pairsToTagMap.set(pairKey(t.platform, t.bookmarkId), {
      platform: t.platform,
      bookmarkId: t.bookmarkId,
      taggedAt: t.taggedAt ?? null,
    })
  }
  const pairsToTag = [...pairsToTagMap.values()]
  const sourceBookmarkIds = [...new Set(sourceTaggedBookmarks.map((t) => t.bookmarkId))]

  const sourceBookmarksRaw = await db
    .select()
    .from(bookmarks)
    .where(and(eq(bookmarks.userId, sourceUserId), inArray(bookmarks.id, sourceBookmarkIds)))
  const sourceBookmarks = sourceBookmarksRaw.filter((b) =>
    taggedPairKeys.has(pairKey(b.platform, b.id)),
  )

  const sourceMediaRaw = await db
    .select()
    .from(bookmarkMedia)
    .where(
      and(
        eq(bookmarkMedia.userId, sourceUserId),
        inArray(bookmarkMedia.bookmarkId, sourceBookmarkIds),
      ),
    )
  const sourceMedia = sourceMediaRaw.filter((m) =>
    taggedPairKeys.has(pairKey(m.platform, m.bookmarkId)),
  )

  const sourceLinksRaw = await db
    .select()
    .from(bookmarkLinks)
    .where(
      and(
        eq(bookmarkLinks.userId, sourceUserId),
        inArray(bookmarkLinks.bookmarkId, sourceBookmarkIds),
      ),
    )
  const sourceLinks = sourceLinksRaw.filter((l) =>
    taggedPairKeys.has(pairKey(l.platform, l.bookmarkId)),
  )

  const existingBookmarksRaw = await db
    .select({ id: bookmarks.id, platform: bookmarks.platform })
    .from(bookmarks)
    .where(and(eq(bookmarks.userId, currentUserId), inArray(bookmarks.id, sourceBookmarkIds)))
  const existingPairKeys = new Set(
    existingBookmarksRaw
      .map((b) => pairKey(b.platform, b.id))
      .filter((key) => taggedPairKeys.has(key)),
  )

  const newBookmarks = sourceBookmarks.filter(
    (b) => !existingPairKeys.has(pairKey(b.platform, b.id)),
  )
  const newBookmarkPairKeys = new Set(newBookmarks.map((b) => pairKey(b.platform, b.id)))
  const newMedia = sourceMedia.filter((m) =>
    newBookmarkPairKeys.has(pairKey(m.platform, m.bookmarkId)),
  )
  const newLinks = sourceLinks.filter((l) =>
    newBookmarkPairKeys.has(pairKey(l.platform, l.bookmarkId)),
  )

  const clonedAtMs = Date.now()
  const orderedPairsToTag = [...pairsToTag].sort((a, b) =>
    (b.taggedAt ?? '').localeCompare(a.taggedAt ?? ''),
  )
  const orderedNewBookmarks = [...newBookmarks].sort((a, b) =>
    (b.processedAt ?? '').localeCompare(a.processedAt ?? ''),
  )

  runInTransaction(() => {
    if (orderedNewBookmarks.length > 0) {
      db.insert(bookmarks)
        .values(
          orderedNewBookmarks.map((b, i) => ({
            ...b,
            userId: currentUserId,
            source: 'clone' as const,
            processedAt: addedAtForIndex(clonedAtMs, i),
          })),
        )
        .run()
    }

    if (newMedia.length > 0) {
      db.insert(bookmarkMedia)
        .values(newMedia.map((m) => ({ ...m, userId: currentUserId })))
        .run()
    }

    if (newLinks.length > 0) {
      db.insert(bookmarkLinks)
        .values(
          newLinks.map((l) => ({
            userId: currentUserId,
            platform: l.platform,
            bookmarkId: l.bookmarkId,
            originalUrl: l.originalUrl,
            expandedUrl: l.expandedUrl,
            linkType: l.linkType,
            domain: l.domain,
            contentJson: l.contentJson,
            previewTitle: l.previewTitle,
            previewDescription: l.previewDescription,
            previewImageUrl: l.previewImageUrl,
          })),
        )
        .run()
    }

    db.insert(bookmarkTags)
      .values(
        orderedPairsToTag.map((pair, i) => ({
          userId: currentUserId,
          platform: pair.platform,
          bookmarkId: pair.bookmarkId,
          tag: tagName,
          createdAt: addedAtForIndex(clonedAtMs, i),
        })),
      )
      .onConflictDoNothing()
      .run()
  })

  recordCollectionEvent({
    action: 'clone',
    ownerUserId: sourceUserId,
    tag: tagName,
    viewerId: currentUserId,
  })

  return {
    ok: true,
    tag: tagName,
    clonedCount: newBookmarks.length,
    taggedCount: pairsToTag.length,
    clonedIds: newBookmarks.map((b) => b.id),
    skipped: existingPairKeys.size,
    total: sourceBookmarks.length,
  }
}

export function serializeSharedPosts(
  bookmarkResults: Array<{
    id: string
    platform: string
    author: string
    authorName: string | null
    authorProfileImageUrl: string | null
    text: string
    tweetUrl: string
    createdAt: string | null
    category: string | null
  }>,
  mediaResults: Array<{
    id: string
    platform: string
    bookmarkId: string
    mediaType: string
    width: number | null
    height: number | null
    previewUrl: string | null
  }>,
) {
  return bookmarkResults.map((bookmark) => {
    const media = mediaResults
      .filter((m) => m.bookmarkId === bookmark.id && m.platform === bookmark.platform)
      .map((m, index) => {
        const mediaType = m.mediaType as 'photo' | 'video' | 'animated_gif'
        const urlOptions = {
          tweetId: bookmark.id,
          author: bookmark.author,
          mediaType,
          mediaIndex: index + 1,
        }
        return {
          id: m.id,
          mediaType: m.mediaType,
          width: m.width,
          height: m.height,
          url: resolveMediaUrl(urlOptions),
          thumbnailUrl: getThumbnailUrl({ ...urlOptions, previewUrl: m.previewUrl || undefined }),
          shareUrl: getShareableUrl(urlOptions),
        }
      })

    return {
      id: bookmark.id,
      author: bookmark.author,
      authorName: bookmark.authorName,
      authorProfileImageUrl: bookmark.authorProfileImageUrl,
      text: bookmark.text,
      tweetUrl: bookmark.tweetUrl,
      createdAt: bookmark.createdAt,
      category: bookmark.category,
      media,
    }
  })
}

/** Pair-safe rows for a public tag JSON list (legacy [code] + by-name GET). */
export async function listTaggedBookmarks(ownerId: string, tagName: string) {
  const moderated = readPublicTagModeration(ownerId)
  if (!moderated) return null

  const taggedRows = await db
    .select({
      bookmarkId: bookmarkTags.bookmarkId,
      platform: bookmarkTags.platform,
    })
    .from(bookmarkTags)
    .where(and(eq(bookmarkTags.userId, ownerId), eq(bookmarkTags.tag, tagName)))

  const tagged = taggedRows.filter((row) => !moderated.has(pairKey(row.platform, row.bookmarkId)))

  if (tagged.length === 0)
    return { bookmarks: [], media: [] as (typeof bookmarkMedia.$inferSelect)[] }

  const pairKeys = new Set(tagged.map((t) => pairKey(t.platform, t.bookmarkId)))
  const ids = [...new Set(tagged.map((t) => t.bookmarkId))]

  const bookmarkResults = (
    await db
      .select()
      .from(bookmarks)
      .where(and(eq(bookmarks.userId, ownerId), inArray(bookmarks.id, ids)))
  ).filter((b) => pairKeys.has(pairKey(b.platform, b.id)))

  const mediaResults = (
    await db
      .select()
      .from(bookmarkMedia)
      .where(and(eq(bookmarkMedia.userId, ownerId), inArray(bookmarkMedia.bookmarkId, ids)))
  ).filter((m) => pairKeys.has(pairKey(m.platform, m.bookmarkId)))

  return { bookmarks: bookmarkResults, media: mediaResults }
}
