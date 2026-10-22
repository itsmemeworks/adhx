import { postKeyBatches, postKeyWhere } from '@/lib/db/post-keys'
import { and, eq, like, or } from 'drizzle-orm'
import { db } from '@/lib/db'
import { bookmarkLinks, bookmarkMedia, bookmarks, userPreferences } from '@/lib/db/schema'
import { DEFAULT_FEED_KINDS, FEED_TYPES_KEY, parseFeedTypes, type FeedKind } from './blend'

/**
 * What kind of post each one is, for the feed's "What's in your feed" filter.
 * The same reading as the phone (`toPhonePost`) and search's type filter,
 * judged from any saver's copy: an article (category, or an X article link)
 * first, then a video (sound counts as video), then photos, else text.
 */
export async function postKinds(keys: string[]): Promise<Map<string, FeedKind>> {
  const wanted = new Set(keys)
  const video = new Set<string>()
  const photo = new Set<string>()
  const article = new Set<string>()
  for (const part of postKeyBatches(keys)) {
    const [media, cats, links] = await Promise.all([
      db
        .selectDistinct({
          platform: bookmarkMedia.platform,
          id: bookmarkMedia.bookmarkId,
          type: bookmarkMedia.mediaType,
        })
        .from(bookmarkMedia)
        .where(postKeyWhere(bookmarkMedia.platform, bookmarkMedia.bookmarkId, part)),
      db
        .selectDistinct({ platform: bookmarks.platform, id: bookmarks.id })
        .from(bookmarks)
        .where(
          and(
            eq(bookmarks.category, 'article'),
            postKeyWhere(bookmarks.platform, bookmarks.id, part),
          ),
        ),
      db
        .selectDistinct({ platform: bookmarkLinks.platform, id: bookmarkLinks.bookmarkId })
        .from(bookmarkLinks)
        .where(
          and(
            postKeyWhere(bookmarkLinks.platform, bookmarkLinks.bookmarkId, part),
            or(
              like(bookmarkLinks.expandedUrl, '%/article/%'),
              like(bookmarkLinks.expandedUrl, '%/i/article/%'),
            ),
          ),
        ),
    ])
    for (const m of media) {
      const key = `${m.platform}:${m.id}`
      if (m.type === 'video' || m.type === 'animated_gif') video.add(key)
      else photo.add(key)
    }
    for (const r of [...cats, ...links]) article.add(`${r.platform}:${r.id}`)
  }
  const out = new Map<string, FeedKind>()
  for (const key of wanted) {
    out.set(
      key,
      article.has(key) ? 'article' : video.has(key) ? 'video' : photo.has(key) ? 'photo' : 'text',
    )
  }
  return out
}

/** The kinds this person keeps in their feed (`feed.types`), else videos and photos. */
export function readFeedTypes(userId: string): FeedKind[] {
  const [row] = db
    .select({ value: userPreferences.value })
    .from(userPreferences)
    .where(and(eq(userPreferences.userId, userId), eq(userPreferences.key, FEED_TYPES_KEY)))
    .all()
  return parseFeedTypes(row?.value) ?? [...DEFAULT_FEED_KINDS]
}

export function writeFeedTypes(userId: string, types: FeedKind[]): FeedKind[] {
  const value = types.join(',')
  const updatedAt = new Date().toISOString()
  db.insert(userPreferences)
    .values({ userId, key: FEED_TYPES_KEY, value, updatedAt })
    .onConflictDoUpdate({
      target: [userPreferences.userId, userPreferences.key],
      set: { value, updatedAt },
    })
    .run()
  return types
}
