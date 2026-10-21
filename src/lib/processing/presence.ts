import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'

/**
 * Is a remote worker (the Mac helper) connected? Workers poll
 * `/api/processing/jobs` every few seconds even when there's nothing to do,
 * so the last authorised request is a heartbeat. Kept in memory (the routes
 * and the status pages share one process); a live lease also counts, for
 * the moments after a restart.
 */

const g = globalThis as unknown as { __adhxWorkerSeenAt?: number }

/** A worker has this long between polls before it reads as gone. */
export const WORKER_GONE_AFTER_MS = 2 * 60_000

export function noteWorkerSeen(now = Date.now()): void {
  g.__adhxWorkerSeenAt = now
}

export function workerLastSeen(): number | null {
  return g.__adhxWorkerSeenAt ?? null
}

export function remoteWorkerConnected(now = Date.now()): boolean {
  const seen = workerLastSeen()
  if (seen && now - seen < WORKER_GONE_AFTER_MS) return true
  const [live] = db.all<{ one: number }>(sql`
    SELECT 1 AS one WHERE EXISTS (SELECT 1 FROM processing_leases WHERE expires_at > ${now})
      OR EXISTS (SELECT 1 FROM media_conversions WHERE status = 'running' AND expires_at > ${now})`)
  return !!live
}
