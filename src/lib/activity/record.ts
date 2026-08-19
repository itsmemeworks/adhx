import { db } from '@/lib/db'
import { activity, bookmarks, type NewActivity } from '@/lib/db/schema'
import { and, desc, eq, gt } from 'drizzle-orm'
import { previewPath } from './preview-path'
import type { TextLinkRef, TheaterQuoteRef } from '@/lib/trending/query'

/**
 * The public activity "pulse".
 *
 * Records community actions (preview / save / read / share) so the landing
 * page can show a live, anonymous ticker of what people are finding interesting.
 *
 * Two hard rules, enforced here so callers can't get them wrong:
 *  1. Content is ALWAYS resolved server-side by the caller. We never accept
 *     display text/thumbnails from the client — that would be a stored-XSS /
 *     spam-injection hole straight onto the front page.
 *  2. `userId` is stored only for moderation / rate-limiting and is never read
 *     back by the public endpoint. The pulse is anonymous ("Someone saved …").
 */

export type ActivityAction = 'preview' | 'save' | 'read' | 'share'

const PULSE_PLATFORMS = new Set(['twitter', 'instagram', 'tiktok', 'youtube'])

/** Post types the pulse understands. Used to type preview-only cards. */
export type ActivityContentType = 'video' | 'photo' | 'text' | 'quote' | 'article'
const CONTENT_TYPES = new Set<string>(['video', 'photo', 'text', 'quote', 'article'])

/**
 * Canonical on-ADHX preview path for a piece of content. Used as the pulse
 * item's link target so a click keeps the visitor on ADHX (and shows the
 * save CTA) instead of bouncing them to the source platform.
 *
 * Defined in the dependency-free `./preview-path` module (no DB import) and
 * re-exported here so client components can import the path helper without
 * pulling in better-sqlite3 through this server-only module.
 */
export { previewPath }

export interface ActivityInput {
  action: ActivityAction
  platform: string
  bookmarkId: string
  author: string
  authorName?: string | null
  /** The post author's avatar — shown on tweet-style text/quote cards. */
  authorAvatarUrl?: string | null
  text?: string | null
  thumbnailUrl?: string | null
  /** Server-resolved post type, so preview-only cards render correctly. */
  contentType?: ActivityContentType | string | null
  /**
   * Server-resolved short-link expansions for URLs in `text` (spec §6b) — same
   * invariant as everything else here: the caller must have fetched these
   * itself (e.g. from FxTwitter's `urls[]`), never client-supplied.
   */
  textLinks?: TextLinkRef[] | null
  /** Server-resolved quoted-post reference, same server-resolved-only rule. */
  quote?: TheaterQuoteRef | null
  url: string
  /** Private — for abuse handling only, never surfaced publicly. */
  userId?: string | null
}

const TEXT_CAP = 500
const AUTHOR_CAP = 40
const AUTHOR_NAME_CAP = 60
const DEDUPE_WINDOW_MS = 60_000
const MAX_TEXT_LINKS = 8

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

const isHttpUrl = (v: unknown): v is string => typeof v === 'string' && /^https?:\/\//i.test(v)

/**
 * Sanitize + serialize short-link expansions for storage. Only keeps entries
 * with a real http(s) `expandedUrl`, caps the list, and drops anything else —
 * malformed/oversized input just yields fewer (or no) links, never a throw.
 */
function packTextLinks(links: TextLinkRef[] | null | undefined): string | null {
  if (!Array.isArray(links) || links.length === 0) return null
  const cleaned: TextLinkRef[] = []
  for (const link of links) {
    if (!link || !isHttpUrl(link.expandedUrl)) continue
    cleaned.push({
      shortUrl: isHttpUrl(link.shortUrl) ? link.shortUrl : null,
      expandedUrl: link.expandedUrl,
      linkType: typeof link.linkType === 'string' ? link.linkType : null,
    })
    if (cleaned.length >= MAX_TEXT_LINKS) break
  }
  return cleaned.length > 0 ? JSON.stringify(cleaned) : null
}

/**
 * Sanitize + serialize a quoted-post reference for storage. Mirrors the
 * preview page's own guard (`quoteAuthor || quote.text`) — a quote with
 * neither an author nor any text has nothing worth showing.
 */
function packQuote(quote: TheaterQuoteRef | null | undefined): string | null {
  if (!quote) return null
  const author = clean(quote.author, AUTHOR_CAP) || ''
  const text = clean(quote.text, TEXT_CAP)
  if (!author && !text) return null
  const cleaned: TheaterQuoteRef = {
    author,
    authorName: clean(quote.authorName, AUTHOR_NAME_CAP),
    text,
    authorAvatarUrl: safeThumb(quote.authorAvatarUrl),
  }
  return JSON.stringify(cleaned)
}

/** Parse a stored JSON column back into a value, defensively. */
function safeParse<T>(json: string | null | undefined): T | undefined {
  if (!json) return undefined
  try {
    return JSON.parse(json) as T
  } catch {
    return undefined
  }
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
      authorAvatarUrl: safeThumb(input.authorAvatarUrl),
      text: clean(input.text, TEXT_CAP),
      thumbnailUrl: safeThumb(input.thumbnailUrl),
      contentType:
        input.contentType && CONTENT_TYPES.has(input.contentType) ? input.contentType : null,
      textLinks: packTextLinks(input.textLinks),
      quoteJson: packQuote(input.quote),
      url: input.url,
      userId: input.userId ?? null,
      createdAt: new Date().toISOString(),
    }
    db.insert(activity).values(row).run()
  } catch {
    // Best-effort: a pulse write must never break the user's action.
  }
}

/**
 * Record a `share` (send/download) using display fields already stored for
 * this post. Looks up the newest activity row, then any saved bookmark.
 * Unknown posts are a no-op — callers must not invent captions/thumbs.
 *
 * Fire-and-forget: never throws.
 */
export function recordSharePulse(opts: {
  platform: string
  bookmarkId: string
  userId?: string | null
}): void {
  try {
    const platform = opts.platform
    const bookmarkId = opts.bookmarkId
    if (!PULSE_PLATFORMS.has(platform) || !bookmarkId) return

    const existing = db
      .select({
        platform: activity.platform,
        bookmarkId: activity.bookmarkId,
        author: activity.author,
        authorName: activity.authorName,
        authorAvatarUrl: activity.authorAvatarUrl,
        text: activity.text,
        thumbnailUrl: activity.thumbnailUrl,
        contentType: activity.contentType,
        textLinks: activity.textLinks,
        quoteJson: activity.quoteJson,
        url: activity.url,
      })
      .from(activity)
      .where(and(eq(activity.platform, platform), eq(activity.bookmarkId, bookmarkId)))
      .orderBy(desc(activity.createdAt))
      .limit(1)
      .get()

    if (existing) {
      recordActivity({
        action: 'share',
        platform: existing.platform,
        bookmarkId: existing.bookmarkId,
        author: existing.author,
        authorName: existing.authorName,
        authorAvatarUrl: existing.authorAvatarUrl,
        text: existing.text,
        thumbnailUrl: existing.thumbnailUrl,
        contentType: existing.contentType,
        textLinks: safeParse<TextLinkRef[]>(existing.textLinks),
        quote: safeParse<TheaterQuoteRef>(existing.quoteJson),
        url: existing.url,
        userId: opts.userId,
      })
      return
    }

    const saved = db
      .select({
        author: bookmarks.author,
        authorName: bookmarks.authorName,
        text: bookmarks.text,
        authorProfileImageUrl: bookmarks.authorProfileImageUrl,
      })
      .from(bookmarks)
      .where(and(eq(bookmarks.platform, platform), eq(bookmarks.id, bookmarkId)))
      .limit(1)
      .get()

    if (!saved?.author) return

    recordActivity({
      action: 'share',
      platform,
      bookmarkId,
      author: saved.author,
      authorName: saved.authorName,
      authorAvatarUrl: saved.authorProfileImageUrl,
      text: saved.text,
      url: previewPath(platform, saved.author, bookmarkId),
      userId: opts.userId,
    })
  } catch {
    // Best-effort: a pulse write must never break send/download.
  }
}

/**
 * Record a `preview` (theater stage view) using display fields already stored
 * for this post. Same shape as `recordSharePulse` — looks up the newest
 * activity row, then any saved bookmark. Unknown posts are a no-op — callers
 * must not invent captions/thumbs. `recordActivity`'s 60s de-dupe (same
 * action+platform+bookmarkId) means a visitor idling on one post in the
 * theater doesn't flood the pulse with repeated preview events.
 *
 * Fire-and-forget: never throws.
 */
export function recordPreviewPulse(opts: {
  platform: string
  bookmarkId: string
  userId?: string | null
}): void {
  try {
    const platform = opts.platform
    const bookmarkId = opts.bookmarkId
    if (!PULSE_PLATFORMS.has(platform) || !bookmarkId) return

    const existing = db
      .select({
        platform: activity.platform,
        bookmarkId: activity.bookmarkId,
        author: activity.author,
        authorName: activity.authorName,
        authorAvatarUrl: activity.authorAvatarUrl,
        text: activity.text,
        thumbnailUrl: activity.thumbnailUrl,
        contentType: activity.contentType,
        textLinks: activity.textLinks,
        quoteJson: activity.quoteJson,
        url: activity.url,
      })
      .from(activity)
      .where(and(eq(activity.platform, platform), eq(activity.bookmarkId, bookmarkId)))
      .orderBy(desc(activity.createdAt))
      .limit(1)
      .get()

    if (existing) {
      recordActivity({
        action: 'preview',
        platform: existing.platform,
        bookmarkId: existing.bookmarkId,
        author: existing.author,
        authorName: existing.authorName,
        authorAvatarUrl: existing.authorAvatarUrl,
        text: existing.text,
        thumbnailUrl: existing.thumbnailUrl,
        contentType: existing.contentType,
        textLinks: safeParse<TextLinkRef[]>(existing.textLinks),
        quote: safeParse<TheaterQuoteRef>(existing.quoteJson),
        url: existing.url,
        userId: opts.userId,
      })
      return
    }

    const saved = db
      .select({
        author: bookmarks.author,
        authorName: bookmarks.authorName,
        text: bookmarks.text,
        authorProfileImageUrl: bookmarks.authorProfileImageUrl,
      })
      .from(bookmarks)
      .where(and(eq(bookmarks.platform, platform), eq(bookmarks.id, bookmarkId)))
      .limit(1)
      .get()

    if (!saved?.author) return

    recordActivity({
      action: 'preview',
      platform,
      bookmarkId,
      author: saved.author,
      authorName: saved.authorName,
      authorAvatarUrl: saved.authorProfileImageUrl,
      text: saved.text,
      url: previewPath(platform, saved.author, bookmarkId),
      userId: opts.userId,
    })
  } catch {
    // Best-effort: a pulse write must never break the theater's playback.
  }
}
