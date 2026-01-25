import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { syncLogs } from '@/lib/db/schema'
import { desc, eq, count } from 'drizzle-orm'
import { getCurrentUserId } from '@/lib/auth/session'

// GET /api/sync/logs - List sync logs with pagination
export async function GET(request: NextRequest) {
  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const searchParams = request.nextUrl.searchParams
  const page = parseInt(searchParams.get('page') || '1')
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100)
  const latestOnly = searchParams.get('latest') === 'true'

  try {
    if (latestOnly) {
      // Return just the most recent sync log for this user
      const [latest] = await db
        .select()
        .from(syncLogs)
        .where(eq(syncLogs.userId, userId))
        .orderBy(desc(syncLogs.startedAt))
        .limit(1)

      return NextResponse.json({ log: latest || null })
    }

    // Get paginated logs for this user
    const offset = (page - 1) * limit

    const [logs, countResult] = await Promise.all([
      db
        .select()
        .from(syncLogs)
        .where(eq(syncLogs.userId, userId))
        .orderBy(desc(syncLogs.startedAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: count() })
        .from(syncLogs)
        .where(eq(syncLogs.userId, userId))
    ])

    const total = countResult[0]?.count ?? 0

    return NextResponse.json({
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('Failed to fetch sync logs:', error)
    return NextResponse.json({ error: 'Failed to fetch sync logs' }, { status: 500 })
  }
}
