import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { syncLogs, bookmarks } from '@/lib/db/schema'
import { eq, desc, and, count } from 'drizzle-orm'
import { withAuth } from '@/lib/api/with-auth'

// GET /api/sync/history - Last 5 completed syncs + bookmark counts.
// Feeds the Settings "Sync history" card and the "Last sync … synced from X" line.
// X's bookmarks API does not expose a total (it returns at most ~800 recent
// items), so `xSynced` / `xOnAdhx` are what we actually hold — not X's own pile.
export const GET = withAuth(async (_request, userId) => {
  const [syncs, totalResult, xOnAdhxResult, xSyncedResult] = await Promise.all([
    db
      .select({
        id: syncLogs.id,
        startedAt: syncLogs.startedAt,
        completedAt: syncLogs.completedAt,
        status: syncLogs.status,
        newBookmarks: syncLogs.newBookmarks,
        totalFetched: syncLogs.totalFetched,
      })
      .from(syncLogs)
      .where(and(eq(syncLogs.userId, userId), eq(syncLogs.status, 'completed')))
      .orderBy(desc(syncLogs.completedAt))
      .limit(5),
    db.select({ count: count() }).from(bookmarks).where(eq(bookmarks.userId, userId)),
    db
      .select({ count: count() })
      .from(bookmarks)
      .where(and(eq(bookmarks.userId, userId), eq(bookmarks.platform, 'twitter'))),
    db
      .select({ count: count() })
      .from(bookmarks)
      .where(
        and(
          eq(bookmarks.userId, userId),
          eq(bookmarks.platform, 'twitter'),
          eq(bookmarks.source, 'sync'),
        ),
      ),
  ])

  const totalBookmarks = totalResult[0]?.count ?? 0
  const xOnAdhx = xOnAdhxResult[0]?.count ?? 0
  const xSynced = xSyncedResult[0]?.count ?? 0
  const lastSyncAt = syncs[0]?.completedAt ?? null

  return NextResponse.json({ syncs, lastSyncAt, totalBookmarks, xOnAdhx, xSynced })
})
