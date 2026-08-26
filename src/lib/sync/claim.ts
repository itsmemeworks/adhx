import { and, desc, eq, lt, sql } from 'drizzle-orm'
import { db, runInTransaction } from '@/lib/db'
import { syncLogs } from '@/lib/db/schema'

export const STALE_RUNNING_SYNC_MS = 30 * 60 * 1000
export const STALE_RUNNING_SYNC_MESSAGE = 'Sync timed out (stuck in running state)'

export type SyncClaimResult =
  | { claimed: true; syncId: string; startedAt: string }
  | { claimed: false; syncId: string; startedAt: string }

export interface OwnedSyncTerminalUpdate {
  status: 'completed' | 'failed'
  completedAt: string
  totalFetched?: number
  newBookmarks?: number
  duplicatesSkipped?: number
  errorMessage?: string | null
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string' &&
    error.code.startsWith('SQLITE_CONSTRAINT')
  )
}

/**
 * Atomically reaps this user's stale claim and creates a new running sync.
 *
 * The partial unique index on sync_logs(user_id) WHERE status = 'running' is
 * the durable cross-process backstop. The explicit lookup provides the current
 * claim details for a useful 409 response and keeps this helper correct in test
 * databases while their DDL is being upgraded.
 */
export function claimSync(userId: string, syncId: string, now = new Date()): SyncClaimResult {
  return runInTransaction(() => {
    const startedAt = now.toISOString()
    const staleBefore = new Date(now.getTime() - STALE_RUNNING_SYNC_MS).toISOString()

    db.update(syncLogs)
      .set({
        status: 'failed',
        errorMessage: STALE_RUNNING_SYNC_MESSAGE,
        completedAt: startedAt,
      })
      .where(
        and(
          eq(syncLogs.userId, userId),
          eq(syncLogs.status, 'running'),
          lt(sql<string>`coalesce(${syncLogs.heartbeatAt}, ${syncLogs.startedAt})`, staleBefore),
        ),
      )
      .run()

    const [running] = db
      .select({ id: syncLogs.id, startedAt: syncLogs.startedAt })
      .from(syncLogs)
      .where(and(eq(syncLogs.userId, userId), eq(syncLogs.status, 'running')))
      .orderBy(desc(syncLogs.startedAt))
      .limit(1)
      .all()

    if (running) {
      return { claimed: false, syncId: running.id, startedAt: running.startedAt }
    }

    try {
      db.insert(syncLogs)
        .values({
          id: syncId,
          userId,
          startedAt,
          heartbeatAt: startedAt,
          status: 'running',
          triggerType: 'manual',
        })
        .run()
    } catch (error) {
      // A second process can win between the lookup and insert. The DB partial
      // unique index makes exactly one claimant succeed.
      if (!isUniqueConstraintError(error)) throw error

      const [winner] = db
        .select({ id: syncLogs.id, startedAt: syncLogs.startedAt })
        .from(syncLogs)
        .where(and(eq(syncLogs.userId, userId), eq(syncLogs.status, 'running')))
        .orderBy(desc(syncLogs.startedAt))
        .limit(1)
        .all()

      if (!winner) throw error
      return { claimed: false, syncId: winner.id, startedAt: winner.startedAt }
    }

    return { claimed: true, syncId, startedAt }
  })
}

/** Renew a claim only while this exact sync still owns the user's running row. */
export function renewSyncLease(userId: string, syncId: string, now = new Date()): boolean {
  const result = db
    .update(syncLogs)
    .set({ heartbeatAt: now.toISOString() })
    .where(
      and(eq(syncLogs.id, syncId), eq(syncLogs.userId, userId), eq(syncLogs.status, 'running')),
    )
    .run()

  return result.changes === 1
}

/**
 * Complete or fail a sync only if it still owns the running lease.
 *
 * A stale worker may resume after its row was reaped. This conditional write
 * prevents it from overwriting the reaper's failure or a replacement claim.
 */
export function finishOwnedSync(
  userId: string,
  syncId: string,
  update: OwnedSyncTerminalUpdate,
): boolean {
  const result = db
    .update(syncLogs)
    .set(update)
    .where(
      and(eq(syncLogs.id, syncId), eq(syncLogs.userId, userId), eq(syncLogs.status, 'running')),
    )
    .run()

  return result.changes === 1
}
