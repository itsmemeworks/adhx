import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { nanoid } from '@/lib/utils'
import { captureException } from '@/lib/sentry'
import { claimSync } from '@/lib/sync/claim'
import { runBookmarkSync } from '@/lib/sync/run'

/**
 * The hourly X bookmark sync.
 *
 * Every few minutes this looks for people whose X is connected, who have
 * synced at least once, who haven't turned "Bring in new bookmarks
 * automatically" off, and whose last sync started at least
 * `AUTO_SYNC_EVERY_MINUTES` ago (default 50). Each one gets a `'new'` sync:
 * newest bookmarks only, stopping at the first page that ends on a post
 * already saved. With a 5-minute check the gap between two syncs stays under
 * an hour, so a bookmark made on X is here within the hour.
 *
 * Runs in the web process (one Fly machine, like the moments engine). The
 * per-user sync claim keeps it from overlapping a sync started by hand, or a
 * second machine's scheduler.
 */

const DEFAULT_EVERY_MINUTES = 50
const TICK_MS = 5 * 60 * 1000
const FIRST_TICK_MS = 60 * 1000
/** X said the developer app is out of API credits: stop asking for a while. */
const NO_CREDITS_PAUSE_MS = 6 * 60 * 60 * 1000
/** X rate-limited us: try the rest next hour. */
const RATE_LIMIT_PAUSE_MS = 15 * 60 * 1000
/** People synced per check, so one check can't run for hours. */
const MAX_PER_TICK = 50

/** Minutes between one person's automatic syncs; 0 turns the job off. */
export function autoSyncEveryMinutes(): number {
  const raw = process.env['AUTO_SYNC_EVERY_MINUTES']
  if (raw === undefined || raw === '') return DEFAULT_EVERY_MINUTES
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_EVERY_MINUTES
}

interface State {
  timer: ReturnType<typeof setInterval> | null
  first: ReturnType<typeof setTimeout> | null
  owner: symbol | null
  ticking: boolean
  pausedUntil: number
}

const g = globalThis as unknown as { __adhxAutoSync?: State }
function state(): State {
  g.__adhxAutoSync ??= { timer: null, first: null, owner: null, ticking: false, pausedUntil: 0 }
  return g.__adhxAutoSync
}

/** Who is due an automatic sync now, longest-waiting first. */
export function dueForAutoSync(now = new Date(), limit = MAX_PER_TICK): string[] {
  const every = autoSyncEveryMinutes()
  if (every <= 0) return []
  const cutoff = new Date(now.getTime() - every * 60 * 1000).toISOString()
  const rows = db.all<{ userId: string }>(sql`
    SELECT t.user_id AS userId
    FROM oauth_tokens t
    JOIN sync_logs s ON s.user_id = t.user_id
    WHERE NOT EXISTS (SELECT 1 FROM user_bans b WHERE b.user_id = t.user_id)
      AND NOT EXISTS (
        SELECT 1 FROM user_preferences p
        WHERE p.user_id = t.user_id AND p.key = 'autoSync' AND p.value = 'false'
      )
    GROUP BY t.user_id
    HAVING SUM(s.status = 'completed') > 0
      AND MAX(s.started_at) <= ${cutoff}
    ORDER BY MAX(s.started_at) ASC
    LIMIT ${limit}
  `)
  return rows.map((r) => r.userId)
}

/** One check: sync everyone due, one at a time. */
export async function autoSyncTick(now = new Date()): Promise<{ synced: number; added: number }> {
  const s = state()
  if (s.ticking || Date.now() < s.pausedUntil) return { synced: 0, added: 0 }
  s.ticking = true
  let synced = 0
  let added = 0
  try {
    for (const userId of dueForAutoSync(now)) {
      const claim = claimSync(userId, nanoid(), new Date(), 'auto')
      if (!claim.claimed) continue
      const outcome = await runBookmarkSync(userId, claim.syncId, { mode: 'new' })
      synced++
      added += outcome.newBookmarks
      const status = outcome.error?.httpStatus
      if (status === 402) {
        s.pausedUntil = Date.now() + NO_CREDITS_PAUSE_MS
        break
      }
      if (status === 429) {
        s.pausedUntil = Date.now() + RATE_LIMIT_PAUSE_MS
        break
      }
    }
  } catch (error) {
    captureException(error, { endpoint: 'sync.auto' })
  } finally {
    s.ticking = false
  }
  return { synced, added }
}

const MODULE = Symbol('auto-sync')

/** Start the checks (once per process; a dev reload swaps in the new code). */
export function startAutoSync(): void {
  if (process.env['NODE_ENV'] === 'test' || autoSyncEveryMinutes() <= 0) return
  const s = state()
  if (s.owner && s.owner !== MODULE) {
    if (s.timer) clearInterval(s.timer)
    if (s.first) clearTimeout(s.first)
    s.timer = null
    s.first = null
  }
  if (s.timer) return
  s.owner = MODULE
  s.first = setTimeout(() => void autoSyncTick(), FIRST_TICK_MS)
  s.first.unref?.()
  s.timer = setInterval(() => void autoSyncTick(), TICK_MS)
  s.timer.unref?.()
}
