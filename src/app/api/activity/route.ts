import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { activity, bookmarks, bookmarkMedia } from '@/lib/db/schema'
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
    if (ids.length > 0) {
      const aggRows = db
        .select({
          platform: bookmarks.platform,
          id: bookmarks.id,
          saveCount: sql<number>`count(distinct ${bookmarks.userId})`,
          isQuote: sql<number>`max(${bookmarks.isQuote})`,
          category: sql<string | null>`max(${bookmarks.category})`,
        })
        .from(bookmarks)
        .where(inArray(bookmarks.id, ids))
        .groupBy(bookmarks.platform, bookmarks.id)
        .all()
      for (const r of aggRows) {
        const k = `${r.platform}:${r.id}`
        counts.set(k, Number(r.saveCount) || 0)
        flags.set(k, { isQuote: !!Number(r.isQuote), category: r.category ?? null })
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

    const enriched = items.map((i) => {
      const key = `${i.platform}:${i.bookmarkId}`
      return {
        ...i,
        saveCount: counts.get(key) ?? 0,
        contentType: typeOf(i.platform, key),
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
