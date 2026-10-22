import {
  ownedPostKeyBatches,
  ownedPostKeyWhere,
  postKeyBatches,
  postKeyWhere,
} from '@/lib/db/post-keys'
import { and, desc, eq, sql } from 'drizzle-orm'
import { withoutGone } from './gone'
import { db } from '@/lib/db'
import {
  archivedPosts,
  bookmarkLinks,
  bookmarkMedia,
  bookmarkTags,
  bookmarks,
  type Bookmark,
  type BookmarkLink,
} from '@/lib/db/schema'
import { buildFeedItem, type FeedItemResponse } from '@/lib/feed/build-item'
import type { MatchSignal, MatchStrength, SearchHit } from './search'
import { saversFor, visibleSaveFilter } from '@/lib/people/savers'

/**
 * Turn search hits into feed-shaped posts.
 *
 * The viewer's own saves come from their own copy (their tags, their archive
 * state). Anyone else's post is built from one visible save's copy (never a
 * private, quoted or banned saver's) and stripped of everything about that
 * saver: no tags, no archive state, no save time, no summary, and link rows
 * lose their `userId` and row id.
 *
 * Signed in, each post then gets `savers` (members who saved it, by name —
 * `saversFor`) and `isPrivate` (the viewer's own save is just for them).
 * Signed out (`viewerUserId === ''`), nothing in the response says who saved it.
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
  opts: { savers?: boolean } = {},
): Promise<SearchItem[]> {
  hits = await withoutGone(hits) // channels pass keys straight here
  if (hits.length === 0) return []
  const refs = hits.map((h) => ({ platform: h.platform, id: h.postId }))
  const wanted = new Set(hits.map((h) => h.key))
  const owners = new Map<string, Owned>()
  const own: Bookmark[] = []
  for (const part of postKeyBatches(refs)) {
    own.push(
      ...(await db
        .select()
        .from(bookmarks)
        .where(
          and(
            eq(bookmarks.userId, viewerUserId),
            postKeyWhere(bookmarks.platform, bookmarks.id, part),
          ),
        )),
    )
  }
  for (const row of own) {
    const key = `${row.platform}:${row.id}`
    if (wanted.has(key)) owners.set(key, { row, viewer: true })
  }

  for (const part of postKeyBatches(refs.filter((r) => !owners.has(`${r.platform}:${r.id}`)))) {
    const others = await db
      .select({ bookmark: bookmarks })
      .from(bookmarks)
      .where(and(visibleSaveFilter, postKeyWhere(bookmarks.platform, bookmarks.id, part)))
      .orderBy(desc(bookmarks.processedAt))
    for (const { bookmark } of others) {
      const key = `${bookmark.platform}:${bookmark.id}`
      if (wanted.has(key) && !owners.has(key)) owners.set(key, { row: bookmark, viewer: false })
    }
  }

  // Bound queries by requested keys, not the number of different savers.
  // Each disjunct retains owner AND platform AND post identity.
  const related = [...owners.values()].map(({ row }) => ({
    userId: row.userId,
    platform: row.platform,
    id: row.id,
  }))
  const media = new Map<string, (typeof bookmarkMedia.$inferSelect)[]>()
  const links = new Map<string, BookmarkLink[]>()
  for (const part of ownedPostKeyBatches(related)) {
    const [m, l] = await Promise.all([
      db
        .select()
        .from(bookmarkMedia)
        .where(
          ownedPostKeyWhere(
            bookmarkMedia.userId,
            bookmarkMedia.platform,
            bookmarkMedia.bookmarkId,
            part,
          ),
        )
        .orderBy(sql`${bookmarkMedia}.rowid`),
      db
        .select()
        .from(bookmarkLinks)
        .where(
          ownedPostKeyWhere(
            bookmarkLinks.userId,
            bookmarkLinks.platform,
            bookmarkLinks.bookmarkId,
            part,
          ),
        )
        .orderBy(sql`${bookmarkLinks}.rowid`),
    ])
    for (const r of m) {
      const key = `${r.userId}|${r.platform}:${r.bookmarkId}`
      media.set(key, [...(media.get(key) ?? []), r])
    }
    for (const r of l) {
      const key = `${r.userId}|${r.platform}:${r.bookmarkId}`
      links.set(key, [...(links.get(key) ?? []), r])
    }
  }

  const tags: (typeof bookmarkTags.$inferSelect)[] = []
  const archived: (typeof archivedPosts.$inferSelect)[] = []
  for (const part of postKeyBatches(own)) {
    const [t, a] = await Promise.all([
      db
        .select()
        .from(bookmarkTags)
        .where(
          and(
            eq(bookmarkTags.userId, viewerUserId),
            postKeyWhere(bookmarkTags.platform, bookmarkTags.bookmarkId, part),
          ),
        ),
      db
        .select()
        .from(archivedPosts)
        .where(
          and(
            eq(archivedPosts.userId, viewerUserId),
            postKeyWhere(archivedPosts.platform, archivedPosts.bookmarkId, part),
          ),
        ),
    ])
    tags.push(...t)
    archived.push(...a)
  }
  const tagsByKey = new Map<string, string[]>()
  for (const t of tags) {
    const key = `${t.platform}:${t.bookmarkId}`
    tagsByKey.set(key, [...(tagsByKey.get(key) ?? []), t.tag])
  }
  const archivedKeys = new Set(archived.map((a) => `${a.platform}:${a.bookmarkId}`))

  const items: SearchItem[] = []
  for (const hit of hits) {
    const owned = owners.get(hit.key)
    if (!owned) continue // unsaved, private-only or banned-only since the search ran
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
  if (viewerUserId && opts.savers !== false && items.length > 0) {
    const savers = saversFor(
      items.map((i) => ({ platform: i.post.platform, id: i.post.id })),
      viewerUserId,
    )
    for (const item of items) {
      const key = `${item.post.platform}:${item.post.id}`
      item.post = {
        ...item.post,
        savers: savers.get(key) ?? [],
        isPrivate: item.saved && !!owners.get(key)?.row.isPrivate,
      }
    }
  }
  return items
}
