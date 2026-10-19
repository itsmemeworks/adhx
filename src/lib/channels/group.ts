import { asc, eq, sql } from 'drizzle-orm'
import { db, runInTransaction } from '@/lib/db'
import { groupChannels, type GroupChannel } from '@/lib/db/schema'
import { readModeratedPostKeys } from '@/lib/admin/moderation'
import { captureException } from '@/lib/sentry'
import { SEMANTIC_MODEL_VERSION } from '@/lib/semantic/config'
import { visibleSave } from '@/lib/people/savers'
import { newTo } from '@/lib/people/seen'
import type { Member } from '@/lib/people/members'
import type { Saver } from '@/lib/people/types'
import { bestClusters, meanVectors, nameClusters, type AutoChannelDeps } from './auto'
import { groupSaves, seedFrom } from './cluster'

/**
 * "From everyone" channels: the server's visible saves from every member
 * (never private, quoted or a banned saver's) grouped by what they're about
 * and named, with the same machinery as Made for you (`groupSaves`,
 * `CHANNEL_NAMES`, Jev's pick). One set per server, in `group_channels`.
 *
 * Members only: these routes need sign-in. Reads re-check each post's
 * visible savers, so a post made private, a deleted account or a ban drops
 * out straight away, without waiting for the next compute.
 */

const MAX_POSTS = 2000
const MAX_CHANNELS = 8
const STALE_MS = 12 * 60 * 60_000
const NEW_SAVES = 10
const RETRY_EMPTY_MS = 10 * 60_000
const CHUNK = 400
const FACES = 3
const SEED = seedFrom('adhx:everyone')
/** Search-group words `/play?group=` already means; a channel never takes one as its slug. */
const RESERVED = new Set(['words', 'picture', 'video', 'keywords'])

export interface GroupChannelView {
  slug: string
  name: string
  /** Posts that still have a visible save. */
  size: number
  /** `platform:id`, most typical first (covers come from the front). */
  keys: string[]
}

export interface GroupChannelSummary extends GroupChannelView {
  /** How many members saved into it. */
  members: number
  /** Up to three of them, most posts first (you included). Signed-in viewers only. */
  savers: Saver[]
  /** Posts in it the viewer hasn't saved or seen. */
  newCount: number
}

type State = {
  inFlight: Promise<GroupChannelView[]> | null
  /** When a compute last found nothing to group, or failed: wait a while before trying again. */
  lastEmpty: number
}
const g = globalThis as unknown as { __adhxGroupChannels?: State }
const state: State = (g.__adhxGroupChannels ??= { inFlight: null, lastEmpty: 0 })

/** Test hook: forget in-memory compute state. */
export function __resetGroupChannels(): void {
  state.inFlight = null
  state.lastEmpty = 0
}

function parseKeys(row: GroupChannel): string[] {
  try {
    const keys = JSON.parse(row.postKeys) as unknown
    return Array.isArray(keys) ? keys.filter((k): k is string => typeof k === 'string') : []
  } catch {
    return []
  }
}

function parseSavers(row: GroupChannel): Record<string, number> {
  try {
    const savers = JSON.parse(row.savers) as unknown
    return savers && typeof savers === 'object' ? (savers as Record<string, number>) : {}
  } catch {
    return {}
  }
}

/** Every visible save of these posts: who saved it and when. */
function visibleSavesOf(keys: string[]): Map<string, { userId: string; savedAt: string }[]> {
  const out = new Map<string, { userId: string; savedAt: string }[]>()
  const wanted = new Set(keys)
  const ids = [...new Set(keys.map((k) => k.slice(k.indexOf(':') + 1)))]
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK)
    const rows = db.all<{ platform: string; id: string; user_id: string; processed_at: string }>(
      sql`SELECT b.platform, b.id, b.user_id, b.processed_at FROM bookmarks b
          WHERE ${visibleSave('b')} AND b.id IN (${sql.join(
            chunk.map((id) => sql`${id}`),
            sql`, `,
          )})
          ORDER BY b.processed_at DESC`,
    )
    for (const r of rows) {
      const key = `${r.platform}:${r.id}`
      if (!wanted.has(key)) continue
      const list = out.get(key) ?? []
      list.push({ userId: r.user_id, savedAt: r.processed_at })
      out.set(key, list)
    }
  }
  return out
}

/** The newest visible posts on the server, one entry per post. */
function visiblePosts(): { platform: string; id: string }[] {
  const moderated = readModeratedPostKeys()
  // Fail closed: never build channels while hidden posts can't be read.
  if (!moderated.ok) throw new Error('moderation unavailable')
  const rows = db.all<{ platform: string; id: string }>(
    sql`SELECT b.platform, b.id, MAX(b.processed_at) AS at FROM bookmarks b
        WHERE ${visibleSave('b')}
        GROUP BY b.platform, b.id
        ORDER BY at DESC
        LIMIT ${MAX_POSTS}`,
  )
  return rows.filter((r) => !moderated.value.has(`${r.platform}:${r.id}`))
}

/** Visible saves on the whole server. Imports keep their original save times, so count, don't compare dates. */
function visibleSaveCount(): number {
  const [row] = db.all<{ n: number }>(
    sql`SELECT COUNT(*) AS n FROM bookmarks b WHERE ${visibleSave('b')}`,
  )
  return Number(row?.n) || 0
}

/** Group, name and store the server's channels. Replaces any previous set. */
export async function computeGroupChannels(
  deps: AutoChannelDeps = {},
): Promise<GroupChannelView[]> {
  const now = (deps.now ?? (() => new Date()))()
  const saveCount = visibleSaveCount()
  const { keys, vectors } = await meanVectors(visiblePosts())
  const clusters = bestClusters(groupSaves(vectors, SEED), MAX_CHANNELS)
  const views = (await nameClusters(clusters, keys, deps, RESERVED)).filter(
    (v) => !RESERVED.has(v.slug),
  )
  const saves = visibleSavesOf(views.flatMap((v) => v.keys))
  runInTransaction(() => {
    db.delete(groupChannels).run()
    views.forEach((v, position) => {
      const savers: Record<string, number> = {}
      for (const key of v.keys) {
        for (const s of saves.get(key) ?? []) savers[s.userId] = (savers[s.userId] ?? 0) + 1
      }
      db.insert(groupChannels)
        .values({
          slug: v.slug,
          name: v.name,
          size: v.size,
          postKeys: JSON.stringify(v.keys),
          savers: JSON.stringify(savers),
          position,
          savesAtCompute: saveCount,
          computedAt: now.toISOString(),
          modelVersion: SEMANTIC_MODEL_VERSION,
        })
        .run()
    })
  })
  state.lastEmpty = views.length === 0 ? now.getTime() : 0
  return views
}

function toView(row: GroupChannel): GroupChannelView {
  const keys = parseKeys(row)
  return { slug: row.slug, name: row.name, size: keys.length, keys }
}

/** Someone counted at compute time has since left or been banned. */
function saverGone(rows: GroupChannel[]): boolean {
  const ids = [...new Set(rows.flatMap((r) => Object.keys(parseSavers(r))))]
  if (ids.length === 0) return false
  const present = db.all<{ id: string }>(
    sql`SELECT u.id FROM users u
        WHERE u.id IN (${sql.join(
          ids.map((id) => sql`${id}`),
          sql`, `,
        )})
        AND NOT EXISTS (SELECT 1 FROM user_bans ub WHERE ub.user_id = u.id)`,
  )
  return present.length < ids.length
}

function isStale(rows: GroupChannel[], now: number): boolean {
  const [first] = rows
  if (!first) return true
  if (first.modelVersion !== SEMANTIC_MODEL_VERSION) return true
  if (now - Date.parse(first.computedAt) > STALE_MS) return true
  if (Math.abs(visibleSaveCount() - first.savesAtCompute) >= NEW_SAVES) return true
  return saverGone(rows)
}

function startCompute(deps: AutoChannelDeps, fallback: GroupChannelView[]) {
  if (!state.inFlight) {
    state.inFlight = computeGroupChannels(deps)
      .catch((error) => {
        captureException(error, { endpoint: 'channels.group' })
        state.lastEmpty = Date.now()
        return fallback
      })
      .finally(() => {
        state.inFlight = null
      })
  }
  return state.inFlight
}

/**
 * The server's channels as stored (not yet re-checked for visibility).
 * Recomputed when missing, when the model changed, after 12 hours, after 10
 * visible saves gained or lost, or when a counted saver has left or been banned. With
 * channels already stored, a recompute runs in the background and this
 * returns the stored set; with none, it waits. One compute at a time.
 */
export async function getGroupChannels(deps: AutoChannelDeps = {}): Promise<GroupChannelView[]> {
  const now = (deps.now ?? (() => new Date()))().getTime()
  const rows = db.select().from(groupChannels).orderBy(asc(groupChannels.position)).all()
  const views = rows.map(toView)
  // Nothing to group (or the last try failed) a moment ago: don't try on every request.
  if (now - state.lastEmpty < RETRY_EMPTY_MS) return views
  if (!isStale(rows, now)) return views
  const pending = startCompute(deps, views)
  if (rows.length > 0) {
    // Serve what's stored; the next request gets the new set.
    pending.catch(() => {})
    return views
  }
  return pending
}

/** Keep only posts that still have a visible save, newest save first. */
function visibleKeys(
  keys: string[],
  saves: Map<string, { userId: string; savedAt: string }[]>,
  order: 'typical' | 'newest',
): string[] {
  const kept = keys.filter((k) => (saves.get(k)?.length ?? 0) > 0)
  if (order === 'typical') return kept
  return kept
    .map((k, i) => ({ k, i, at: saves.get(k)![0].savedAt }))
    .sort((a, b) => b.at.localeCompare(a.at) || a.i - b.i)
    .map((x) => x.k)
}

/**
 * The server's channels for one signed-in member: each re-checked for
 * visibility (empty ones dropped), with how many members saved into it, up
 * to three of their faces, and how many posts are new to the viewer.
 */
export async function groupChannelsFor(
  viewerId: string,
  members: Member[],
  deps: AutoChannelDeps = {},
): Promise<GroupChannelSummary[]> {
  if (!viewerId) return []
  const views = await getGroupChannels(deps)
  if (views.length === 0) return []
  const saves = visibleSavesOf(views.flatMap((v) => v.keys))
  const byId = new Map(members.map((m) => [m.userId, m]))
  const fresh = newKeys(
    viewerId,
    views.flatMap((v) => v.keys),
  )
  const out: GroupChannelSummary[] = []
  for (const v of views) {
    const keys = visibleKeys(v.keys, saves, 'typical')
    if (keys.length === 0) continue
    const counts = new Map<string, { n: number; savedAt: string }>()
    for (const key of keys) {
      for (const s of saves.get(key) ?? []) {
        const c = counts.get(s.userId)
        if (!c) counts.set(s.userId, { n: 1, savedAt: s.savedAt })
        else {
          c.n++
          if (s.savedAt > c.savedAt) c.savedAt = s.savedAt
        }
      }
    }
    const savers: Saver[] = [...counts.entries()]
      .filter(([userId]) => byId.has(userId))
      .sort((a, b) => b[1].n - a[1].n || b[1].savedAt.localeCompare(a[1].savedAt))
      .slice(0, FACES)
      .map(([userId, c]) => {
        const m = byId.get(userId)!
        return {
          username: m.username,
          name: m.name,
          avatarUrl: m.avatarUrl,
          savedAt: c.savedAt,
          isYou: userId === viewerId,
        }
      })
    out.push({
      ...v,
      keys,
      size: keys.length,
      members: [...counts.keys()].filter((id) => byId.has(id)).length,
      savers,
      newCount: keys.filter((k) => fresh.has(k)).length,
    })
  }
  return out
}

/** Of these posts, the ones the viewer hasn't saved or seen. */
function newKeys(viewerId: string, keys: string[]): Set<string> {
  const out = new Set<string>()
  const wanted = new Set(keys)
  const ids = [...new Set(keys.map((k) => k.slice(k.indexOf(':') + 1)))]
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK)
    const rows = db.all<{ platform: string; id: string }>(
      sql`SELECT DISTINCT b.platform, b.id FROM bookmarks b
          WHERE ${visibleSave('b')} AND ${newTo(viewerId, 'b')}
          AND b.id IN (${sql.join(
            chunk.map((id) => sql`${id}`),
            sql`, `,
          )})`,
    )
    for (const r of rows) {
      const key = `${r.platform}:${r.id}`
      if (wanted.has(key)) out.add(key)
    }
  }
  return out
}

/**
 * One server channel as a play queue: its posts that still have a visible
 * save, newest save first. Null when there's no such channel.
 */
export async function groupChannelKeys(
  slug: string,
): Promise<{ name: string; keys: string[] } | null> {
  const [row] = db.select().from(groupChannels).where(eq(groupChannels.slug, slug)).limit(1).all()
  if (!row) return null
  const keys = parseKeys(row)
  return { name: row.name, keys: visibleKeys(keys, visibleSavesOf(keys), 'newest') }
}
