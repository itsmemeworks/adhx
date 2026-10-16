import { and, desc, eq, inArray, isNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  archivedPosts,
  bookmarkLinks,
  bookmarkMedia,
  bookmarkTags,
  bookmarks,
  userBans,
  type Bookmark,
  type BookmarkLink,
} from '@/lib/db/schema'
import { buildFeedItem, type FeedItemResponse } from '@/lib/feed/build-item'
import type { MatchSignal, MatchStrength, SearchHit } from './search'

/**
 * Turn search hits into feed-shaped posts.
 *
 * The viewer's own saves come from their own copy (their tags, their archive
 * state). Anyone else's post is built from one non-banned saver's copy and
 * stripped of everything about that saver: no tags, no archive state, no
 * save time, no summary, and link rows lose their `userId` and row id.
 * Nothing in the response says who saved it.
 */

export interface SearchItem {
  post: FeedItemResponse
  /** The viewer has this post in their own saves. */
  saved: boolean
  matched: MatchSignal[]
  strength: MatchStrength
  /** Its picture or video isn't understood yet (matched on words only). */
  learning?: boolean
}

type Owned = { row: Bookmark; viewer: boolean }

function isArticleLink(link: BookmarkLink): boolean {
  return !!(link.expandedUrl?.includes('/article/') || link.expandedUrl?.includes('/i/article/'))
}

/** Public copy of a post built from someone else's save. */
function anonymize(item: FeedItemResponse): FeedItemResponse {
  return {
    ...item,
    processedAt: item.createdAt ?? '',
    isArchived: false,
    tags: [],
    summary: null,
    links: item.links ? item.links.map((link) => ({ ...link, id: 0, userId: '' })) : null,
    parentTweets: null,
  }
}

export async function loadSearchItems(
  hits: SearchHit[],
  viewerUserId: string,
): Promise<SearchItem[]> {
  if (hits.length === 0) return []
  const ids = [...new Set(hits.map((h) => h.postId))]
  const wanted = new Set(hits.map((h) => h.key))
  const owners = new Map<string, Owned>()

  const own = await db
    .select()
    .from(bookmarks)
    .where(and(eq(bookmarks.userId, viewerUserId), inArray(bookmarks.id, ids)))
  for (const row of own) {
    const key = `${row.platform}:${row.id}`
    if (wanted.has(key)) owners.set(key, { row, viewer: true })
  }

  const missing = hits.filter((h) => !owners.has(h.key))
  if (missing.length > 0) {
    const others = await db
      .select({ bookmark: bookmarks })
      .from(bookmarks)
      .leftJoin(userBans, eq(userBans.userId, bookmarks.userId))
      .where(
        and(
          isNull(userBans.userId),
          inArray(
            bookmarks.id,
            missing.map((h) => h.postId),
          ),
        ),
      )
      .orderBy(desc(bookmarks.processedAt))
    for (const { bookmark } of others) {
      const key = `${bookmark.platform}:${bookmark.id}`
      if (wanted.has(key) && !owners.has(key)) owners.set(key, { row: bookmark, viewer: false })
    }
  }

  // Related rows, fetched per saver (each copy's media and links live under it).
  const byUser = new Map<string, string[]>()
  for (const { row } of owners.values()) {
    byUser.set(row.userId, [...(byUser.get(row.userId) ?? []), row.id])
  }
  const media = new Map<string, (typeof bookmarkMedia.$inferSelect)[]>()
  const links = new Map<string, BookmarkLink[]>()
  for (const [userId, userIds] of byUser) {
    const [m, l] = await Promise.all([
      db
        .select()
        .from(bookmarkMedia)
        .where(and(eq(bookmarkMedia.userId, userId), inArray(bookmarkMedia.bookmarkId, userIds))),
      db
        .select()
        .from(bookmarkLinks)
        .where(and(eq(bookmarkLinks.userId, userId), inArray(bookmarkLinks.bookmarkId, userIds))),
    ])
    for (const r of m) {
      const key = `${userId}|${r.platform}:${r.bookmarkId}`
      media.set(key, [...(media.get(key) ?? []), r])
    }
    for (const r of l) {
      const key = `${userId}|${r.platform}:${r.bookmarkId}`
      links.set(key, [...(links.get(key) ?? []), r])
    }
  }

  const viewerIds = own.map((r) => r.id)
  const [tags, archived] = viewerIds.length
    ? await Promise.all([
        db
          .select()
          .from(bookmarkTags)
          .where(
            and(eq(bookmarkTags.userId, viewerUserId), inArray(bookmarkTags.bookmarkId, viewerIds)),
          ),
        db
          .select()
          .from(archivedPosts)
          .where(
            and(
              eq(archivedPosts.userId, viewerUserId),
              inArray(archivedPosts.bookmarkId, viewerIds),
            ),
          ),
      ])
    : [[], []]
  const tagsByKey = new Map<string, string[]>()
  for (const t of tags) {
    const key = `${t.platform}:${t.bookmarkId}`
    tagsByKey.set(key, [...(tagsByKey.get(key) ?? []), t.tag])
  }
  const archivedKeys = new Set(archived.map((a) => `${a.platform}:${a.bookmarkId}`))

  const items: SearchItem[] = []
  for (const hit of hits) {
    const owned = owners.get(hit.key)
    if (!owned) continue // unsaved or banned-only since the search ran
    const related = `${owned.row.userId}|${hit.key}`
    const postLinks = links.get(related) ?? []
    const item = buildFeedItem(
      owned.row,
      postLinks,
      media.get(related) ?? [],
      owned.viewer ? (tagsByKey.get(hit.key) ?? []) : [],
      owned.viewer && archivedKeys.has(hit.key),
      postLinks.some(isArticleLink),
    )
    items.push({
      post: owned.viewer ? item : anonymize(item),
      saved: owned.viewer,
      matched: hit.matched,
      strength: hit.strength,
    })
  }
  return items
}
