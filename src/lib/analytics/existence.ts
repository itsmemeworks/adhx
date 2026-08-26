import { and, eq } from 'drizzle-orm'
import { readPostModeration, readUserBan } from '@/lib/admin/moderation'
import { inferContentType } from '@/lib/content-type'
import { db } from '@/lib/db'
import { activity, bookmarkMedia, bookmarks } from '@/lib/db/schema'
import { isAnalyticContentType, type AnalyticContentType, type AnalyticPlatform } from './events'

export interface TrustedAnalyticsPost {
  contentType: AnalyticContentType | null
}

/**
 * Resolve a client-supplied post identity against server-owned data.
 *
 * This deliberately searches across bookmark owners: analytics pings are
 * anonymous public interactions, not reads of a viewer's private collection.
 * Moderation failures fail closed so an unavailable moderation store cannot
 * turn hidden or banned content into analytics rows.
 */
export function resolveTrustedAnalyticsPost(
  platform: AnalyticPlatform,
  bookmarkId: string,
  actorUserId?: string | null,
): TrustedAnalyticsPost | null {
  const moderation = readPostModeration(platform, bookmarkId)
  if (!moderation.ok || moderation.value) return null

  const actorBan = readUserBan(actorUserId)
  if (!actorBan.ok || actorBan.value) return null

  try {
    const [bookmark] = db
      .select({
        platform: bookmarks.platform,
        category: bookmarks.category,
      })
      .from(bookmarks)
      .where(and(eq(bookmarks.platform, platform), eq(bookmarks.id, bookmarkId)))
      .limit(1)
      .all()

    if (bookmark) {
      const media = db
        .select({ mediaType: bookmarkMedia.mediaType })
        .from(bookmarkMedia)
        .where(and(eq(bookmarkMedia.platform, platform), eq(bookmarkMedia.bookmarkId, bookmarkId)))
        .all()
      const inferred = inferContentType({
        platform: bookmark.platform,
        category: bookmark.category,
        hasVideo: media.some(
          ({ mediaType }) => mediaType === 'video' || mediaType === 'animated_gif',
        ),
        hasPhoto: media.some(({ mediaType }) => mediaType === 'photo'),
      })
      return { contentType: isAnalyticContentType(inferred) ? inferred : null }
    }

    const [pulse] = db
      .select({ contentType: activity.contentType })
      .from(activity)
      .where(
        and(
          eq(activity.platform, platform),
          eq(activity.bookmarkId, bookmarkId),
          eq(activity.hidden, 0),
        ),
      )
      .limit(1)
      .all()

    if (!pulse) return null
    return {
      contentType:
        pulse.contentType && isAnalyticContentType(pulse.contentType) ? pulse.contentType : null,
    }
  } catch {
    return null
  }
}
