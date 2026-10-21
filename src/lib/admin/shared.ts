import fs from 'node:fs/promises'
import { and, eq, inArray, sql, type SQL } from 'drizzle-orm'
import { db } from '@/lib/db'
import { bookmarks, userPreferences, users, type Bookmark } from '@/lib/db/schema'
import { appPost } from '@/lib/app/phone-app'
import { mediaDir } from '@/lib/keep/config'
import { visibleSave, memberAvatar } from '@/lib/people/savers'
import { networkLabel } from '@/lib/platform/networks'

/**
 * Shared pieces of the admin boards (src/lib/admin/boards/*).
 *
 * The one privacy rule every board keeps: a Just for me save may be counted,
 * never listed. Anything that names a post or a saver goes through
 * `postCards` / `sharedSavers`, which only ever read shared saves
 * (`visibleSave`: not private, not a quoted copy, saver not banned).
 */

export type AdminRange = 'today' | 'week' | 'month' | 'all'

export const ADMIN_RANGES: { id: AdminRange; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'all', label: 'All time' },
]

const RANGE_MS: Record<Exclude<AdminRange, 'all'>, number> = {
  today: 24 * 60 * 60_000,
  week: 7 * 24 * 60 * 60_000,
  month: 30 * 24 * 60 * 60_000,
}

export function parseAdminRange(raw: unknown, fallback: AdminRange = 'week'): AdminRange {
  return raw === 'today' || raw === 'week' || raw === 'month' || raw === 'all' ? raw : fallback
}

/** The start of the range (ISO), or null for all time. */
export function rangeSince(range: AdminRange, now = Date.now()): string | null {
  return range === 'all' ? null : new Date(now - RANGE_MS[range]).toISOString()
}

/** The range before this one, for "+12% on last month" (null for all time). */
export function previousRange(
  range: AdminRange,
  now = Date.now(),
): { since: string; until: string } | null {
  if (range === 'all') return null
  return {
    since: new Date(now - 2 * RANGE_MS[range]).toISOString(),
    until: new Date(now - RANGE_MS[range]).toISOString(),
  }
}

/** "this week", "today", "this month", "all time". */
export function rangeWords(range: AdminRange): string {
  return { today: 'today', week: 'this week', month: 'this month', all: 'all time' }[range]
}

/** `created_at >= since` for an ISO text column, or no condition for all time. */
export function sinceClause(column: SQL, since: string | null): SQL {
  return since ? sql`${column} >= ${since}` : sql`1 = 1`
}

/** Stored times are ISO, but `users.created_at` is SQLite's `YYYY-MM-DD HH:MM:SS` (UTC). */
export function isoTime(value: string | null | undefined): string | null {
  if (!value) return null
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) return `${value.replace(' ', 'T')}Z`
  return value
}

export function num(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/** A member's face, as the client draws it (photo, or initial on their colour). */
export interface Face {
  username: string
  name: string | null
  avatarUrl: string | null
}

/** Faces for these account ids, by id. Never more than the public profile fields. */
export function facesById(ids: string[]): Map<string, Face> {
  const out = new Map<string, Face>()
  const unique = [...new Set(ids.filter(Boolean))]
  for (let i = 0; i < unique.length; i += 400) {
    const rows = db
      .select({
        id: users.id,
        username: users.username,
        name: users.displayName,
        avatarUrl: users.avatarUrl,
        avatarSource: userPreferences.value,
      })
      .from(users)
      .leftJoin(
        userPreferences,
        and(eq(userPreferences.userId, users.id), eq(userPreferences.key, 'avatarSource')),
      )
      .where(inArray(users.id, unique.slice(i, i + 400)))
      .all()
    for (const r of rows) {
      out.set(r.id, {
        username: r.username,
        name: r.name ?? null,
        avatarUrl: memberAvatar(r.avatarUrl, r.avatarSource),
      })
    }
  }
  return out
}

/** A post as a row on a board: only ever built from a shared save. */
export interface PostCard {
  platform: string
  id: string
  title: string
  network: string
  thumbnail: string | null
  openPath: string
}

const keyOf = (platform: string, id: string) => `${platform}:${id}`

export function splitKey(key: string): { platform: string; id: string } {
  const at = key.indexOf(':')
  return { platform: key.slice(0, at), id: key.slice(at + 1) }
}

function titleOf(row: Bookmark): string {
  const first = (row.text ?? '')
    .split('\n')
    .map((l) => l.trim())
    .find(Boolean)
  if (first) {
    const chars = Array.from(first)
    return chars.length > 120 ? `${chars.slice(0, 119).join('')}…` : first
  }
  return `${networkLabel(row.platform)} post by @${row.author}`
}

/**
 * Cards for posts that have at least one shared save, keyed `platform:id`.
 * A post saved only Just for me gets no card, so it can't be listed.
 */
export function postCards(keys: string[]): Map<string, PostCard> {
  const out = new Map<string, PostCard>()
  const wanted = new Set(keys)
  const ids = [...new Set(keys.map((k) => splitKey(k).id))]
  for (let i = 0; i < ids.length; i += 400) {
    const rows = db
      .select()
      .from(bookmarks)
      .where(and(inArray(bookmarks.id, ids.slice(i, i + 400)), visibleSave()))
      .all()
    for (const row of rows) {
      const k = keyOf(row.platform, row.id)
      if (!wanted.has(k) || out.has(k)) continue
      const post = appPost(row, false)
      out.set(k, {
        platform: row.platform,
        id: row.id,
        title: titleOf(row),
        network: networkLabel(row.platform),
        thumbnail: post.posterUrl,
        openPath: post.openPath,
      })
    }
  }
  return out
}

/** Who saved each post, shared saves only, newest first, keyed `platform:id`. */
export function sharedSavers(keys: string[]): Map<string, Face[]> {
  const out = new Map<string, Face[]>()
  if (!keys.length) return out
  const wanted = new Set(keys)
  const ids = [...new Set(keys.map((k) => splitKey(k).id))]
  for (let i = 0; i < ids.length; i += 400) {
    const rows = db
      .select({ platform: bookmarks.platform, id: bookmarks.id, userId: bookmarks.userId })
      .from(bookmarks)
      .where(and(inArray(bookmarks.id, ids.slice(i, i + 400)), visibleSave()))
      .orderBy(sql`${bookmarks.processedAt} DESC`)
      .all()
    const faces = facesById(rows.map((r) => r.userId))
    for (const r of rows) {
      const k = keyOf(r.platform, r.id)
      if (!wanted.has(k)) continue
      const face = faces.get(r.userId)
      if (!face) continue
      const list = out.get(k) ?? []
      if (!list.some((f) => f.username === face.username)) list.push(face)
      out.set(k, list)
    }
  }
  return out
}

/** Free and total bytes on the disk holding the media folder (nulls when unknown). */
export async function diskSpace(): Promise<{ free: number | null; total: number | null }> {
  try {
    const s = await fs.statfs(mediaDir())
    return { free: s.bavail * s.bsize, total: s.blocks * s.bsize }
  } catch {
    try {
      const s = await fs.statfs(process.cwd())
      return { free: s.bavail * s.bsize, total: s.blocks * s.bsize }
    } catch {
      return { free: null, total: null }
    }
  }
}

/** Days ending today (local server time), oldest first, as `YYYY-MM-DD`. */
export function lastDays(n: number, now = Date.now()): string[] {
  const out: string[] = []
  const d = new Date(now)
  d.setHours(12, 0, 0, 0)
  for (let i = n - 1; i >= 0; i--) {
    const day = new Date(d.getTime() - i * 24 * 60 * 60_000)
    out.push(localDay(day))
  }
  return out
}

/** `YYYY-MM-DD` in the server's local time. */
export function localDay(at: Date | string | number): string {
  const d = new Date(at)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Count timestamps into the given local days. */
export function perDay(days: string[], times: (string | null | undefined)[]): number[] {
  const index = new Map(days.map((d, i) => [d, i]))
  const out = days.map(() => 0)
  for (const t of times) {
    if (!t) continue
    const i = index.get(localDay(isoTime(t) ?? t))
    if (i !== undefined) out[i]++
  }
  return out
}
