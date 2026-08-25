/**
 * Private growth log. Fire-and-forget, never throws — a stats write must
 * not break a save, tag, or click.
 *
 * Two invariants, same as `recordActivity` / `recordCollectionEvent`:
 *  1. Callers pass identifiers + allowlisted dimensions only. No captions,
 *     thumbnails, or free-form client text.
 *  2. `userId` is stored for moderation / rate-limiting and is never selected
 *     by `/api/analytics`.
 *
 * Dual-writes a Sentry counter (`analytics.<name>`) with the same dimensions
 * so ops dashboards stay in lockstep with the durable SQLite log.
 */

import { db } from '@/lib/db'
import { activity, analyticsEvents, bookmarkMedia, bookmarks } from '@/lib/db/schema'
import { and, eq, gt } from 'drizzle-orm'
import { metricCount } from '@/lib/sentry'
import {
  isAnalyticContentType,
  isAnalyticEventName,
  isAnalyticPlatform,
  isAnalyticSource,
  isAnalyticSurface,
  type AnalyticContentType,
  type AnalyticEventName,
  type AnalyticPlatform,
  type AnalyticSource,
  type AnalyticSurface,
} from './events'
import { inferContentType } from '@/lib/content-type'

const DEDUPE_WINDOW_MS = 60_000
const TAG_CAP = 15
const ID_CAP = 80

export interface AnalyticInput {
  name: AnalyticEventName
  userId?: string | null
  platform?: string | null
  contentType?: string | null
  surface?: string | null
  source?: string | null
  bookmarkId?: string | null
  tag?: string | null
}

function cleanDim(value: string | null | undefined, cap: number): string | null {
  if (!value) return null
  const trimmed = value.replace(/\s+/g, ' ').trim()
  if (!trimmed) return null
  return trimmed.length > cap ? trimmed.slice(0, cap) : trimmed
}

/**
 * Best-effort type for a post already in the DB. Used when the caller only
 * has identifiers (client pings). Never trusts a client-supplied type.
 */
export function resolveContentType(
  platform: string | null,
  bookmarkId: string | null,
): AnalyticContentType | null {
  if (!platform || !bookmarkId) return null
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
        hasVideo: media.some((m) => m.mediaType === 'video' || m.mediaType === 'animated_gif'),
        hasPhoto: media.some((m) => m.mediaType === 'photo'),
      })
      return isAnalyticContentType(inferred) ? inferred : null
    }

    const [pulse] = db
      .select({ contentType: activity.contentType })
      .from(activity)
      .where(and(eq(activity.platform, platform), eq(activity.bookmarkId, bookmarkId)))
      .limit(1)
      .all()
    return pulse?.contentType && isAnalyticContentType(pulse.contentType) ? pulse.contentType : null
  } catch {
    return null
  }
}

export function recordAnalytic(input: AnalyticInput): void {
  try {
    if (!isAnalyticEventName(input.name)) return

    const platform = isAnalyticPlatform(input.platform) ? input.platform : null
    const contentType = isAnalyticContentType(input.contentType) ? input.contentType : null
    const surface = isAnalyticSurface(input.surface) ? input.surface : null
    const source = isAnalyticSource(input.source) ? input.source : null
    const bookmarkId = cleanDim(input.bookmarkId, ID_CAP)
    const tag = cleanDim(input.tag, TAG_CAP)
    const userId = cleanDim(input.userId, ID_CAP)

    // Dedupe only when we have an identity (user, post, or tag). A bare
    // `theater.open` from signed-out `/` must NOT collapse every visitor
    // into one row per minute.
    if (bookmarkId || tag || userId) {
      const cutoff = new Date(Date.now() - DEDUPE_WINDOW_MS).toISOString()
      const dedupe = [eq(analyticsEvents.name, input.name), gt(analyticsEvents.createdAt, cutoff)]
      if (platform) dedupe.push(eq(analyticsEvents.platform, platform))
      if (bookmarkId) dedupe.push(eq(analyticsEvents.bookmarkId, bookmarkId))
      if (tag) dedupe.push(eq(analyticsEvents.tag, tag))
      if (userId) dedupe.push(eq(analyticsEvents.userId, userId))
      const recent = db
        .select({ id: analyticsEvents.id })
        .from(analyticsEvents)
        .where(and(...dedupe))
        .limit(1)
        .all()
      if (recent.length > 0) return
    }

    db.insert(analyticsEvents)
      .values({
        name: input.name,
        platform,
        contentType,
        surface,
        source,
        bookmarkId,
        tag,
        userId,
        createdAt: new Date().toISOString(),
      })
      .run()

    const attributes: Record<string, string> = {}
    if (platform) attributes.platform = platform
    if (contentType) attributes.content_type = contentType
    if (surface) attributes.surface = surface
    if (source) attributes.source = source
    metricCount(
      `analytics.${input.name}`,
      1,
      Object.keys(attributes).length ? attributes : undefined,
    )
  } catch {
    // Best-effort: a stats write must never break the caller.
  }
}

export function recordPostAnalytic(
  name: Extract<
    AnalyticEventName,
    | 'post.view'
    | 'post.save'
    | 'post.share'
    | 'post.send'
    | 'post.copy'
    | 'post.open'
    | 'post.tag'
    | 'post.untag'
    | 'post.archive'
    | 'post.unarchive'
    | 'post.delete'
  >,
  opts: {
    userId?: string | null
    platform?: string | null
    contentType?: string | null
    surface?: string | null
    source?: string | null
    bookmarkId?: string | null
    tag?: string | null
  },
): void {
  const platform = isAnalyticPlatform(opts.platform) ? (opts.platform as AnalyticPlatform) : null
  const contentType = isAnalyticContentType(opts.contentType)
    ? opts.contentType
    : resolveContentType(platform, opts.bookmarkId ?? null)
  recordAnalytic({
    name,
    userId: opts.userId,
    platform,
    contentType,
    surface: opts.surface as AnalyticSurface | null | undefined,
    source: opts.source as AnalyticSource | null | undefined,
    bookmarkId: opts.bookmarkId,
    tag: opts.tag,
  })
}
