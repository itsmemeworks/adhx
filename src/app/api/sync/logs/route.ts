import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { syncLogs } from '@/lib/db/schema'
import { desc } from 'drizzle-orm'

// GET /api/sync/logs - List sync logs with pagination
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const page = parseInt(searchParams.get('page') || '1')
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100)
  const latestOnly = searchParams.get('latest') === 'true'

  try {
    if (latestOnly) {
      // Return just the most recent sync log
      const [latest] = await db
        .select()
        .from(syncLogs)
        .orderBy(desc(syncLogs.startedAt))
        .limit(1)

      return NextResponse.json({ log: latest || null })
    }

    // Get paginated logs
    const offset = (page - 1) * limit

    const [logs, countResult] = await Promise.all([
      db
        .select()
        .from(syncLogs)
        .orderBy(desc(syncLogs.startedAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: syncLogs.id })
        .from(syncLogs)
    ])

    const total = countResult.length

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
