import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { activity, bookmarks, bookmarkMedia, bookmarkLinks } from '@/lib/db/schema'
import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm'

/**
 * GET /api/activity — the public, anonymous pulse for the landing + Discover.
 *
 * Returns the most recent community actions. Deliberately selects ONLY public
 * fields: `userId` is never included, so the feed can't be tied back to anyone.
 * Each item is enriched with:
 *   - `saveCount` — DISTINCT users who saved the post (anonymous count) → powers
 *     the "Trending" ranking + flame badge.
 *   - `contentType` — the post's real type (video/photo/text/quote/article),
 *     derived from the saved bookmark's media so the badge is accurate (a text
 *     tweet isn't mislabelled "photo", a video tweet isn't "photo", etc.). Left
 *     undefined for preview-only posts that were never saved; the client then
 *     falls back to a platform/thumbnail heuristic.
 *   - `thumbnailUrl` — resolved so Discover shows the same hero image as the
 *     collection: TikTok posters are derived as the deterministic proxy URL
 *     (the CDN needs signing the proxy adds), and article covers are pulled
 *     from the saved bookmark's enriched link.
 * Short cache + SWR keeps it lively without hammering the DB.
 */
export const dynamic = 'force-dynamic'

const FETCH = 80
const LIMIT = 30

type ContentType = 'video' | 'photo' | 'text' | 'quote' | 'article'

export async function GET() {
  try {
    const rows = db
      .select({
        action: activity.action,
        platform: activity.platform,
        bookmarkId: activity.bookmarkId,
        author: activity.author,
        authorName: activity.authorName,
        authorAvatarUrl: activity.authorAvatarUrl,
        text: activity.text,
        thumbnailUrl: activity.thumbnailUrl,
        url: activity.url,
        createdAt: activity.createdAt,
      })
      .from(activity)
      .orderBy(desc(activity.createdAt))
      .limit(FETCH)
      .all()

    // Collapse repeats so the same item doesn't appear twice in a row in the
    // ticker (e.g. previewed then saved within seconds).
    const seen = new Set<string>()
    const items: typeof rows = []
    for (const row of rows) {
      const key = `${row.action}:${row.platform}:${row.url}`
      if (seen.has(key)) continue
      seen.add(key)
      items.push(row)
      if (items.length >= LIMIT) break
    }

    const ids = [...new Set(items.map((i) => i.bookmarkId).filter(Boolean))]

    // Per-post save count + the flags we need to type it (anonymous — counts and
    // shape only, never any user identity).
    const counts = new Map<string, number>()
    const flags = new Map<string, { isQuote: boolean; category: string | null }>()
    const mediaKinds = new Map<string, { video: boolean; photo: boolean }>()
    const articleCovers = new Map<string, string>()
    const articleTitles = new Map<string, string>()
    const avatars = new Map<string, string>()
    if (ids.length > 0) {
      const aggRows = db
        .select({
          platform: bookmarks.platform,
          id: bookmarks.id,
          saveCount: sql<number>`count(distinct ${bookmarks.userId})`,
          isQuote: sql<number>`max(${bookmarks.isQuote})`,
          category: sql<string | null>`max(${bookmarks.category})`,
          avatar: sql<string | null>`max(${bookmarks.authorProfileImageUrl})`,
        })
        .from(bookmarks)
        .where(inArray(bookmarks.id, ids))
        .groupBy(bookmarks.platform, bookmarks.id)
        .all()
      for (const r of aggRows) {
        const k = `${r.platform}:${r.id}`
        counts.set(k, Number(r.saveCount) || 0)
        flags.set(k, { isQuote: !!Number(r.isQuote), category: r.category ?? null })
        if (r.avatar) avatars.set(k, r.avatar)
      }

      const mediaRows = db
        .select({
          platform: bookmarkMedia.platform,
          bookmarkId: bookmarkMedia.bookmarkId,
          mediaType: bookmarkMedia.mediaType,
        })
        .from(bookmarkMedia)
        .where(inArray(bookmarkMedia.bookmarkId, ids))
        .all()
      for (const m of mediaRows) {
        const k = `${m.platform}:${m.bookmarkId}`
        const cur = mediaKinds.get(k) ?? { video: false, photo: false }
        if (m.mediaType === 'video' || m.mediaType === 'animated_gif') cur.video = true
        else if (m.mediaType === 'photo') cur.photo = true
        mediaKinds.set(k, cur)
      }

      // Article cover + title — the same hero/headline the collection card uses.
      // Cross-user is fine (they're identical regardless of who saved it). Prefer
      // the explicit article link; otherwise take any link that carries them.
      const linkRows = db
        .select({
          platform: bookmarkLinks.platform,
          bookmarkId: bookmarkLinks.bookmarkId,
          linkType: bookmarkLinks.linkType,
          imageUrl: bookmarkLinks.previewImageUrl,
          title: bookmarkLinks.previewTitle,
        })
        .from(bookmarkLinks)
        .where(inArray(bookmarkLinks.bookmarkId, ids))
        .all()
      for (const l of linkRows) {
        const k = `${l.platform}:${l.bookmarkId}`
        if (l.imageUrl && (!articleCovers.has(k) || l.linkType === 'article')) articleCovers.set(k, l.imageUrl)
        if (l.title && (!articleTitles.has(k) || l.linkType === 'article')) articleTitles.set(k, l.title)
      }
    }

    /** Real type from the saved bookmark; undefined if the post was never saved. */
    const typeOf = (platform: string, key: string): ContentType | undefined => {
      // Single-format platforms: always video, even without a stored poster.
      if (platform === 'tiktok' || platform === 'youtube' || platform === 'instagram') return 'video'
      if (!flags.has(key)) return undefined // preview-only — let the client guess
      const m = mediaKinds.get(key)
      if (m?.video) return 'video'
      if (flags.get(key)?.category === 'article') return 'article'
      if (m?.photo) return 'photo'
      if (flags.get(key)?.isQuote) return 'quote'
      return 'text'
    }

    /**
     * The hero image for the card. TikTok posters come from our proxy (the CDN
     * URL needs signing/referer the proxy adds) and are derived from the handle
     * + id, so they work even for preview-only items. Article cards use the
     * saved cover when one exists. Everything else keeps its recorded thumbnail.
     */
    const thumbOf = (i: (typeof items)[number], key: string, type: ContentType | undefined): string | null => {
      if (i.platform === 'tiktok' && i.author && i.bookmarkId) {
        return `/api/media/tiktok/thumbnail?username=${encodeURIComponent(i.author)}&id=${encodeURIComponent(i.bookmarkId)}`
      }
      if (type === 'article') return articleCovers.get(key) ?? i.thumbnailUrl ?? null
      return i.thumbnailUrl ?? null
    }

    const enriched = items.map((i) => {
      const key = `${i.platform}:${i.bookmarkId}`
      const contentType = typeOf(i.platform, key)
      return {
        ...i,
        // Article cards show the article's own headline (the recorded `text` is
        // usually just the wrapper tweet's t.co link), matching the collection.
        text: contentType === 'article' ? (articleTitles.get(key) ?? i.text) : i.text,
        saveCount: counts.get(key) ?? 0,
        contentType,
        thumbnailUrl: thumbOf(i, key, contentType),
        // The post author's avatar for tweet-style cards — the recorded value
        // (preview-only items) else the saved bookmark's avatar (saved items).
        authorAvatarUrl: i.authorAvatarUrl ?? avatars.get(key) ?? null,
      }
    })

    // "saved today" headline count — save events since UTC midnight.
    const midnight = new Date()
    midnight.setUTCHours(0, 0, 0, 0)
    const savedTodayRow = db
      .select({ c: sql<number>`count(*)` })
      .from(activity)
      .where(and(eq(activity.action, 'save'), gte(activity.createdAt, midnight.toISOString())))
      .get()
    const savedToday = Number(savedTodayRow?.c) || 0

    return NextResponse.json(
      { items: enriched, savedToday },
      { headers: { 'Cache-Control': 'public, max-age=5, stale-while-revalidate=15' } },
    )
  } catch {
    return NextResponse.json({ items: [], savedToday: 0 })
  }
}
