import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { syncLogs } from '@/lib/db/schema'
import { eq, desc, and } from 'drizzle-orm'
import { getCurrentUserId } from '@/lib/auth/session'
import { getSyncCooldownMs } from '@/lib/sync/config'

// GET /api/sync/cooldown - Check if user can sync
export async function GET() {
  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [lastSync] = await db
    .select()
    .from(syncLogs)
    .where(
      and(
        eq(syncLogs.status, 'completed'),
        eq(syncLogs.userId, userId)
      )
    )
    .orderBy(desc(syncLogs.completedAt))
    .limit(1)

  if (!lastSync?.completedAt) {
    return NextResponse.json({
      canSync: true,
      cooldownRemaining: 0,
      lastSyncAt: null,
    })
  }

  const elapsed = Date.now() - new Date(lastSync.completedAt).getTime()
  const cooldownMs = getSyncCooldownMs()
  const cooldownRemaining = Math.max(0, cooldownMs - elapsed)

  return NextResponse.json({
    canSync: cooldownRemaining === 0,
    cooldownRemaining,
    lastSyncAt: lastSync.completedAt,
  })
}
