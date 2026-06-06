import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { activity, bookmarks } from '@/lib/db/schema'
import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm'

/**
 * GET /api/activity — the public, anonymous pulse for the landing + Discover.
 *
 * Returns the most recent community actions. Deliberately selects ONLY public
 * fields: `userId` is never included, so the feed can't be tied back to anyone.
 * Each item is enriched with `saveCount` — how many DISTINCT users have saved
 * that post across ADHX (anonymous count only) — which powers the "Trending"
 * ranking and the flame badge on hot items. Short cache + SWR keeps it lively
 * without hammering the DB when many visitors poll at once.
 */
export const dynamic = 'force-dynamic'

const FETCH = 80
const LIMIT = 30

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

    // Enrich with the real cross-user save count per post (anonymous — a count,
    // never any user identity). One grouped query over the items on screen.
    const counts = new Map<string, number>()
    const ids = [...new Set(items.map((i) => i.bookmarkId).filter(Boolean))]
    if (ids.length > 0) {
      const rows2 = db
        .select({
          platform: bookmarks.platform,
          id: bookmarks.id,
          saveCount: sql<number>`count(distinct ${bookmarks.userId})`,
        })
        .from(bookmarks)
        .where(inArray(bookmarks.id, ids))
        .groupBy(bookmarks.platform, bookmarks.id)
        .all()
      for (const r of rows2) counts.set(`${r.platform}:${r.id}`, Number(r.saveCount) || 0)
    }

    const enriched = items.map((i) => ({
      ...i,
      saveCount: counts.get(`${i.platform}:${i.bookmarkId}`) ?? 0,
    }))

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
