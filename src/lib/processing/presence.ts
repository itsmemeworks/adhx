import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import type { WorkerRefusal } from './auth'

/**
 * Is a remote worker (the Mac helper) connected? Workers poll
 * `/api/processing/jobs` every few seconds even when there's nothing to do,
 * so the last authorised request is a heartbeat. Kept in memory (the routes
 * and the status pages share one process); a live lease also counts, for
 * the moments after a restart.
 *
 * Also kept, for the admin System page: what each worker said about itself
 * when it last asked for work, and the last request that was refused and
 * why, so "Not connected" can say whether a helper is trying with the wrong
 * token or this server isn't set up to take one.
 */

export interface WorkerSeen {
  workerId: string
  model: string
  protocol: number
  kinds: string[] | null
  lastClaimAt: number
  /** Why its last ask for work was refused (a fixed server message), else null. */
  problem: string | null
}

export interface WorkerRefused {
  reason: WorkerRefusal
  at: number
  count: number
}

const g = globalThis as unknown as {
  __adhxWorkerSeenAt?: number
  __adhxWorkers?: Map<string, WorkerSeen>
  __adhxWorkerRefused?: WorkerRefused
}

/** A worker has this long between polls before it reads as gone. */
export const WORKER_GONE_AFTER_MS = 2 * 60_000
/** At most this many workers are remembered (the most recent). */
const MAX_WORKERS = 8

export function noteWorkerSeen(now = Date.now()): void {
  g.__adhxWorkerSeenAt = now
}

export function workerLastSeen(): number | null {
  return g.__adhxWorkerSeenAt ?? null
}

/** A worker asked for work: remember who it says it is (never its token). */
export function noteWorkerClaim(
  claim: { workerId: unknown; model: unknown; protocol: unknown; kinds?: unknown },
  now = Date.now(),
): void {
  if (typeof claim.workerId !== 'string' || !claim.workerId) return
  const workers = (g.__adhxWorkers ??= new Map())
  const workerId = claim.workerId.slice(0, 120)
  workers.delete(workerId)
  workers.set(workerId, {
    workerId,
    model: typeof claim.model === 'string' ? claim.model.slice(0, 120) : '',
    protocol: typeof claim.protocol === 'number' ? claim.protocol : 0,
    kinds: Array.isArray(claim.kinds)
      ? claim.kinds.filter((k): k is string => typeof k === 'string').slice(0, 12)
      : null,
    lastClaimAt: now,
    problem: null,
  })
  while (workers.size > MAX_WORKERS) workers.delete(workers.keys().next().value as string)
}

/** The server refused a worker's ask for work (version or model mismatch). */
export function noteWorkerClaimProblem(workerId: unknown, problem: string): void {
  if (typeof workerId !== 'string') return
  const w = g.__adhxWorkers?.get(workerId.slice(0, 120))
  if (w) w.problem = problem.slice(0, 200)
}

/** Workers seen since this server started, most recent first. */
export function workersSeen(): WorkerSeen[] {
  return [...(g.__adhxWorkers?.values() ?? [])].sort((a, b) => b.lastClaimAt - a.lastClaimAt)
}

export function noteWorkerRefused(reason: WorkerRefusal, now = Date.now()): void {
  const last = g.__adhxWorkerRefused
  g.__adhxWorkerRefused = {
    reason,
    at: now,
    count: last && last.reason === reason ? last.count + 1 : 1,
  }
}

/** The last refused worker request since this server started, if any. */
export function workerLastRefused(): WorkerRefused | null {
  return g.__adhxWorkerRefused ?? null
}

/** Tests: forget every worker this process has seen. */
export function __resetWorkerPresence(): void {
  g.__adhxWorkerSeenAt = undefined
  g.__adhxWorkers = undefined
  g.__adhxWorkerRefused = undefined
}

export function remoteWorkerConnected(now = Date.now()): boolean {
  const seen = workerLastSeen()
  if (seen && now - seen < WORKER_GONE_AFTER_MS) return true
  const [live] = db.all<{ one: number }>(sql`
    SELECT 1 AS one WHERE EXISTS (SELECT 1 FROM processing_leases WHERE expires_at > ${now})
      OR EXISTS (SELECT 1 FROM media_conversions WHERE status = 'running' AND expires_at > ${now})`)
  return !!live
}
