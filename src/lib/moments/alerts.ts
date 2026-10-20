import { sql } from 'drizzle-orm'
import { db, runInTransaction } from '@/lib/db'
import { captureException } from '@/lib/sentry'

/**
 * "Tell me when it's live" (boards j7-1, j7-3): a member's bell on a forming
 * group, and the one alert each gets when that group goes live.
 *
 * Subscriptions are keyed by the engine's forming id. When a forming group is
 * merged or regrouped, the engine moves its subscriptions to the group that
 * holds most of its posts (`carryFormingSubscriptions`); when it forms into a
 * moment, every subscriber gets one alert (`fireFormingAlerts`); a group that
 * dissolves drops its subscriptions silently. Alerts are listed unseen,
 * newest first, for 24 hours. Per user: nobody ever sees another's bells or
 * alerts.
 */

export const ALERT_TTL_MS = 24 * 3_600_000
export const MAX_ALERTS = 20
/** Ids per "seen" call. */
export const MAX_SEEN_IDS = 50

export interface MomentAlert {
  id: string
  slug: string
  title: string
  at: string
}

/** The bell on: tell this member when the forming group goes live. */
export function subscribeForming(userId: string, formingId: string, now = new Date()): void {
  db.run(sql`
    INSERT INTO moment_alert_subs (user_id, forming_id, created_at)
    VALUES (${userId}, ${formingId}, ${now.toISOString()})
    ON CONFLICT (user_id, forming_id) DO NOTHING
  `)
}

export function unsubscribeForming(userId: string, formingId: string): void {
  db.run(sql`
    DELETE FROM moment_alert_subs WHERE user_id = ${userId} AND forming_id = ${formingId}
  `)
}

/** Which of these forming groups the member asked to be told about. */
export function formingAlertsFor(userId: string, ids: string[]): Set<string> {
  const out = new Set<string>()
  if (!userId || ids.length === 0) return out
  const rows = db.all<{ forming_id: string }>(sql`
    SELECT forming_id FROM moment_alert_subs
    WHERE user_id = ${userId} AND forming_id IN (${sql.join(
      ids.map((id) => sql`${id}`),
      sql`, `,
    )})
  `)
  for (const r of rows) out.add(r.forming_id)
  return out
}

/** Move subscriptions from groups that merged or regrouped into their successors. */
export function carryFormingSubscriptions(moves: { from: string; to: string }[]): void {
  if (moves.length === 0) return
  try {
    runInTransaction(() => {
      for (const { from, to } of moves) {
        if (from === to) continue
        db.run(sql`
          INSERT INTO moment_alert_subs (user_id, forming_id, created_at)
          SELECT user_id, ${to}, created_at FROM moment_alert_subs WHERE forming_id = ${from}
          ON CONFLICT (user_id, forming_id) DO NOTHING
        `)
        db.run(sql`DELETE FROM moment_alert_subs WHERE forming_id = ${from}`)
      }
    })
  } catch (error) {
    captureException(error, { endpoint: 'moments.alerts.carry' })
  }
}

/** Groups that dissolved: their subscriptions go, silently. */
export function dropFormingSubscriptions(ids: string[]): void {
  if (ids.length === 0) return
  try {
    db.run(sql`
      DELETE FROM moment_alert_subs WHERE forming_id IN (${sql.join(
        ids.map((id) => sql`${id}`),
        sql`, `,
      )})
    `)
  } catch (error) {
    captureException(error, { endpoint: 'moments.alerts.drop' })
  }
}

/** A forming group went live as this moment: one alert per subscriber, then the bells go. */
export function fireFormingAlerts(
  formingId: string,
  moment: { slug: string; title: string },
  now = new Date(),
): number {
  let fired = 0
  try {
    runInTransaction(() => {
      const subs = db.all<{ user_id: string }>(sql`
        SELECT s.user_id FROM moment_alert_subs s
        WHERE s.forming_id = ${formingId}
          AND EXISTS (SELECT 1 FROM users u WHERE u.id = s.user_id)
      `)
      for (const s of subs) {
        db.run(sql`
          INSERT INTO moment_alerts (user_id, slug, title, created_at, seen_at)
          VALUES (${s.user_id}, ${moment.slug}, ${moment.title}, ${now.toISOString()}, NULL)
        `)
        fired++
      }
      db.run(sql`DELETE FROM moment_alert_subs WHERE forming_id = ${formingId}`)
      // Expired alerts go on the next write.
      db.run(sql`
        DELETE FROM moment_alerts WHERE created_at < ${new Date(now.getTime() - ALERT_TTL_MS).toISOString()}
      `)
    })
  } catch (error) {
    captureException(error, { endpoint: 'moments.alerts.fire' })
    return 0
  }
  return fired
}

/** The member's unseen alerts from the last 24 hours, newest first (at most 20). */
export function listAlerts(userId: string, now = new Date()): MomentAlert[] {
  if (!userId) return []
  const since = new Date(now.getTime() - ALERT_TTL_MS).toISOString()
  const rows = db.all<{ id: number; slug: string; title: string; created_at: string }>(sql`
    SELECT id, slug, title, created_at FROM moment_alerts
    WHERE user_id = ${userId} AND seen_at IS NULL AND created_at >= ${since}
    ORDER BY created_at DESC, id DESC
    LIMIT ${MAX_ALERTS}
  `)
  return rows.map((r) => ({ id: `a${r.id}`, slug: r.slug, title: r.title, at: r.created_at }))
}

/** `{ ids: ["a1", …] }` → the numeric ids, or what's wrong. */
export function parseSeenIds(body: unknown): number[] | { error: string } {
  const ids = (body as { ids?: unknown } | null)?.ids
  if (!Array.isArray(ids)) return { error: 'Send { ids: [...] }.' }
  if (ids.length > MAX_SEEN_IDS) return { error: `At most ${MAX_SEEN_IDS} at a time.` }
  const out: number[] = []
  for (const id of ids) {
    const m = typeof id === 'string' ? /^a(\d{1,15})$/.exec(id) : null
    if (!m) return { error: 'Each id is an alert id.' }
    out.push(Number(m[1]))
  }
  return [...new Set(out)]
}

/** Mark the member's own alerts seen (anyone else's ids are ignored). */
export function markAlertsSeen(userId: string, ids: number[], now = new Date()): void {
  if (!userId || ids.length === 0) return
  db.run(sql`
    UPDATE moment_alerts SET seen_at = ${now.toISOString()}
    WHERE user_id = ${userId} AND seen_at IS NULL AND id IN (${sql.join(
      ids.map((id) => sql`${id}`),
      sql`, `,
    )})
  `)
}
