import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { REACTION_EMOJI, type ReactionEmoji } from '@/lib/moments/reactions'
import { recordAnalytic } from '@/lib/analytics/record'

/**
 * Counters behind the admin area (tables in ./schema-sql.ts). Every write is
 * best effort: a counter must never break a reaction, a tune-in or a moment.
 *
 * Reactions are counted, never kept: one row per member, UTC day and kind
 * (`laughing`, `fire`, `crying`, `eyes`, `skull`, `heart`, or `text` for
 * words). The words, the post and the moment are not stored here; the moment
 * log only counts how many reactions it had.
 */

/** A reaction kind's stable id: the emoji's label, lowercased, or `text`. */
export type ReactionKind = Lowercase<(typeof REACTION_EMOJI)[number]['label']> | 'text'

export const REACTION_KINDS: ReactionKind[] = [
  ...REACTION_EMOJI.map((r) => r.label.toLowerCase() as ReactionKind),
  'text',
]

/** The emoji for a kind (`text` → null). */
export function emojiForKind(kind: string): string | null {
  return REACTION_EMOJI.find((r) => r.label.toLowerCase() === kind)?.emoji ?? null
}

export function reactionKind(emoji: ReactionEmoji | null | undefined): ReactionKind {
  if (!emoji) return 'text'
  const found = REACTION_EMOJI.find((r) => r.emoji === emoji)
  return found ? (found.label.toLowerCase() as ReactionKind) : 'text'
}

/** `YYYY-MM-DD` in UTC. */
export function utcDay(at: number | Date = Date.now()): string {
  return new Date(at).toISOString().slice(0, 10)
}

/** Count one reaction a member sent (and one more for the moment it was sent in). */
export function countReaction(
  userId: string,
  kind: ReactionKind,
  slug?: string | null,
  now = Date.now(),
): void {
  try {
    db.run(sql`
      INSERT INTO reaction_counts (day, user_id, kind, count)
      VALUES (${utcDay(now)}, ${userId}, ${kind}, 1)
      ON CONFLICT(day, user_id, kind) DO UPDATE SET count = count + 1`)
    if (slug) db.run(sql`UPDATE moment_log SET reactions = reactions + 1 WHERE slug = ${slug}`)
  } catch {
    // Best effort.
  }
}

/** A moment went live (formed from a forming group, or found by a regroup). Once per slug. */
export function logMomentFormed(slug: string, title: string, now = Date.now()): void {
  try {
    db.run(sql`
      INSERT INTO moment_log (slug, title, formed_at)
      VALUES (${slug}, ${title}, ${new Date(now).toISOString()})
      ON CONFLICT(slug) DO NOTHING`)
  } catch {
    // Best effort.
  }
}

/** "It's live" alerts a moment sent when it formed. */
export function noteMomentAlerts(
  slug: string,
  title: string,
  sent: number,
  now = Date.now(),
): void {
  if (sent <= 0) return
  try {
    db.run(sql`
      INSERT INTO moment_log (slug, title, formed_at, alerts)
      VALUES (${slug}, ${title}, ${new Date(now).toISOString()}, ${sent})
      ON CONFLICT(slug) DO UPDATE SET alerts = alerts + ${sent}`)
  } catch {
    // Best effort.
  }
}

/** A member opened (saw) these alerts: one more opened for each one's moment. */
export function noteAlertsOpened(userId: string, ids: number[]): void {
  if (!userId || !ids.length) return
  try {
    const rows = db.all<{ slug: string; n: number }>(sql`
      SELECT slug, COUNT(*) AS n FROM moment_alerts
      WHERE user_id = ${userId} AND seen_at IS NULL AND id IN (${sql.join(
        ids.map((id) => sql`${id}`),
        sql`, `,
      )})
      GROUP BY slug`)
    for (const r of rows) {
      db.run(
        sql`UPDATE moment_log SET alerts_opened = alerts_opened + ${r.n} WHERE slug = ${r.slug}`,
      )
    }
  } catch {
    // Best effort.
  }
}

const g = globalThis as unknown as { __adhxTunedIn?: Map<string, Set<string>> }

/**
 * A member joined a moment's room. Counted once per member per moment (in
 * memory, so a restart may count a member again), and the most watching at
 * once is kept. The member's id never reaches the log.
 */
export function noteTuneIn(slug: string, userId: string, watchingNow: number): void {
  const seen = (g.__adhxTunedIn ??= new Map())
  let members = seen.get(slug)
  if (!members) {
    members = new Set()
    seen.set(slug, members)
    // Bound memory: forget the oldest moments.
    if (seen.size > 500) seen.delete(seen.keys().next().value as string)
  }
  const first = !members.has(userId)
  members.add(userId)
  try {
    db.run(sql`
      UPDATE moment_log
      SET tune_ins = tune_ins + ${first ? 1 : 0},
          peak_watching = MAX(peak_watching, ${watchingNow})
      WHERE slug = ${slug}`)
  } catch {
    // Best effort.
  }
}

/** Tests only. */
export function __resetTunedIn(): void {
  g.__adhxTunedIn = undefined
}

const searches = globalThis as unknown as { __adhxSearchNoted?: Map<string, number> }

/** A person's searches closer together than this count once (search runs as you type). */
export const SEARCH_GAP_MS = 15_000

/**
 * Count a finished search for admins' Analytics: whether it found something
 * close, and whether it searched by meaning or by words. Never the words
 * searched for, never what was found.
 */
export function noteSearch(
  userId: string,
  opts: { mode: 'meaning' | 'words'; found: boolean },
  now = Date.now(),
): boolean {
  if (!userId) return false
  const map = (searches.__adhxSearchNoted ??= new Map())
  const last = map.get(userId)
  if (last !== undefined && now - last < SEARCH_GAP_MS) return false
  map.set(userId, now)
  if (map.size > 5000) map.delete(map.keys().next().value as string)
  recordAnalytic({
    name: opts.found ? 'search.found' : 'search.none',
    source: opts.mode,
    userId,
  })
  return true
}

/** Tests only. */
export function __resetSearchNoted(): void {
  searches.__adhxSearchNoted = undefined
}
