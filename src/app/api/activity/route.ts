import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { activity } from '@/lib/db/schema'
import { desc } from 'drizzle-orm'

/**
 * GET /api/activity — the public, anonymous pulse for the landing page.
 *
 * Returns the most recent community actions. Deliberately selects ONLY public
 * fields: `userId` is never included, so the feed can't be tied back to anyone.
 * Short cache + SWR keeps it lively without hammering the DB when many visitors
 * poll at once.
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

    return NextResponse.json(
      { items },
      { headers: { 'Cache-Control': 'public, max-age=5, stale-while-revalidate=15' } },
    )
  } catch {
    return NextResponse.json({ items: [] })
  }
}
