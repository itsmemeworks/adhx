import { db } from '@/lib/db'
import { activity, type NewActivity } from '@/lib/db/schema'
import { and, eq, gt } from 'drizzle-orm'

/**
 * The public activity "pulse".
 *
 * Records community actions (preview / save / read) so the landing page can
 * show a live, anonymous ticker of what people are finding interesting.
 *
 * Two hard rules, enforced here so callers can't get them wrong:
 *  1. Content is ALWAYS resolved server-side by the caller. We never accept
 *     display text/thumbnails from the client — that would be a stored-XSS /
 *     spam-injection hole straight onto the front page.
 *  2. `userId` is stored only for moderation / rate-limiting and is never read
 *     back by the public endpoint. The pulse is anonymous ("Someone saved …").
 */

export type ActivityAction = 'preview' | 'save' | 'read'

/**
 * Canonical on-ADHX preview path for a piece of content. Used as the pulse
 * item's link target so a click keeps the visitor on ADHX (and shows the
 * save CTA) instead of bouncing them to the source platform.
 */
export function previewPath(platform: string, author: string, id: string): string {
  if (platform === 'instagram') return `/reels/${id}`
  if (platform === 'tiktok') return `/@${author}/video/${id}`
  return `/${author}/status/${id}`
}

export interface ActivityInput {
  action: ActivityAction
  platform: string
  bookmarkId: string
  author: string
  authorName?: string | null
  text?: string | null
  thumbnailUrl?: string | null
  url: string
  /** Private — for abuse handling only, never surfaced publicly. */
  userId?: string | null
}

const TEXT_CAP = 240
const AUTHOR_CAP = 40
const AUTHOR_NAME_CAP = 60
const DEDUPE_WINDOW_MS = 60_000

/** Collapse whitespace, trim, and cap length so the pulse stays tidy and small. */
function clean(value: string | null | undefined, cap: number): string | null {
  if (!value) return null
  const trimmed = value.replace(/\s+/g, ' ').trim()
  if (!trimmed) return null
  return trimmed.length > cap ? `${trimmed.slice(0, cap - 1)}…` : trimmed
}

/** Only keep an http(s) URL for the thumbnail; ignore anything else. */
function safeThumb(url: string | null | undefined): string | null {
  if (!url) return null
  return /^https?:\/\//i.test(url) || url.startsWith('/api/') ? url : null
}

/**
 * Append an event to the pulse. Fire-and-forget: never throws, so a logging
 * failure can't break a save / preview / read. Synchronous (better-sqlite3),
 * so callers don't need to await.
 */
export function recordActivity(input: ActivityInput): void {
  try {
    if (!input.bookmarkId || !input.author || !input.url) return

    // De-dupe: skip if the same (action, platform, bookmark) landed in the last
    // minute. Stops refreshes, prefetches, and double-fires from flooding.
    const cutoff = new Date(Date.now() - DEDUPE_WINDOW_MS).toISOString()
    const recent = db
      .select({ id: activity.id })
      .from(activity)
      .where(
        and(
          eq(activity.action, input.action),
          eq(activity.platform, input.platform),
          eq(activity.bookmarkId, input.bookmarkId),
          gt(activity.createdAt, cutoff),
        ),
      )
      .limit(1)
      .all()
    if (recent.length > 0) return

    const row: NewActivity = {
      action: input.action,
      platform: input.platform,
      bookmarkId: input.bookmarkId,
      author: clean(input.author, AUTHOR_CAP) || 'unknown',
      authorName: clean(input.authorName, AUTHOR_NAME_CAP),
      text: clean(input.text, TEXT_CAP),
      thumbnailUrl: safeThumb(input.thumbnailUrl),
      url: input.url,
      userId: input.userId ?? null,
      createdAt: new Date().toISOString(),
    }
    db.insert(activity).values(row).run()
  } catch {
    // Best-effort: a pulse write must never break the user's action.
  }
}
