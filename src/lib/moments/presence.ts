import { EventEmitter } from 'events'
import type { ReactionEmoji } from './reactions'
import { noteTuneIn } from '@/lib/admin/counts'

/**
 * Who is tuned in to which moment, by account, and the reactions they send.
 * In-process on `globalThis` like the engine (a dev reload keeps it), never
 * stored (each reaction is kept on its post separately, in `post_reactions`,
 * by `src/lib/moments/react.ts`). The engine still counts every viewer anonymously; this only knows
 * signed-in members, and `people.ts` turns it into names for other members.
 *
 * Account ids stay server-side: nothing here is sent to a client as is.
 */

type Entry = {
  count: number
  since: number
  phones: Map<string, { keyId: string; expires: number }>
  webGraceUntil?: number
}

/** A reaction as sent (ids only); each receiver gets its own named copy. */
export type ReactionSignal = {
  slug: string
  id: string
  at: string
  userId: string
  emoji?: ReactionEmoji
  text?: string
  post: { platform: string; id: string }
}

type State = {
  rooms: Map<string, Map<string, Entry>>
  bus: EventEmitter
  nextId: number
  /** The last few seconds of reactions per moment, for phones that poll. */
  recent: Map<string, ReactionSignal[]>
}

/** How long a reaction stays visible to pollers, and how many are kept. */
export const WATCH_LEASE_MS = 15_000
const RECENT_MS = 15_000
const RECENT_MAX = 40

const g = globalThis as unknown as { __adhxMomentPresence?: State }

function state(): State {
  if (!g.__adhxMomentPresence) {
    const bus = new EventEmitter()
    bus.setMaxListeners(0)
    g.__adhxMomentPresence = { rooms: new Map(), bus, nextId: 1, recent: new Map() }
  }
  return g.__adhxMomentPresence
}

/** Test-only. */
export function __resetPresence(): void {
  g.__adhxMomentPresence = undefined
}

/**
 * Count this member as tuned in to `slug` (one per open stream; a member
 * with two tabs is one watcher). Returns the leave function.
 */
export function joinWatch(slug: string, userId: string): () => void {
  const s = state()
  const room = s.rooms.get(slug) ?? new Map<string, Entry>()
  s.rooms.set(slug, room)
  const joined = !room.has(userId)
  const entry = room.get(userId) ?? { count: 0, since: Date.now(), phones: new Map() }
  entry.phones ??= new Map()
  entry.count++
  room.set(userId, entry)
  if (joined) noteTuneIn(slug, userId, room.size)
  let left = false
  return () => {
    if (left) return
    left = true
    const r = state().rooms.get(slug)
    const e = r?.get(userId)
    if (!r || !e) return
    e.count--
    if (e.count <= 0 && !e.phones.size && (e.webGraceUntil ?? 0) <= Date.now()) r.delete(userId)
    if (r.size === 0) state().rooms.delete(slug)
  }
}

/** A planned browser reconnect gets a brief bridge, not an indefinite watcher. */
export function holdWebWatch(slug: string, userId: string): void {
  const entry = state().rooms.get(slug)?.get(userId)
  if (entry) entry.webGraceUntil = Date.now() + 5_000
}

/** A foreground phone renews a short lease, scoped to its exact credential and screen. */
export function renewWatch(
  slug: string,
  userId: string,
  keyId: string,
  session: string,
  ttlMs = WATCH_LEASE_MS,
): boolean {
  const before = new Set(state().rooms.get(slug)?.keys())
  // Reap idle rooms as new foreground work arrives; abandoned leases cannot
  // accumulate indefinitely even when nobody reopens their old moment.
  for (const key of state().rooms.keys()) watcherIds(key)
  const room = state().rooms.get(slug) ?? new Map<string, Entry>()
  state().rooms.set(slug, room)
  const entry = room.get(userId) ?? { count: 0, since: Date.now(), phones: new Map() }
  entry.phones ??= new Map()
  entry.phones.set(`${keyId}:${session}`, {
    keyId,
    expires: Date.now() + Math.min(WATCH_LEASE_MS, Math.max(0, ttlMs)),
  })
  room.set(userId, entry)
  if (!before.has(userId)) noteTuneIn(slug, userId, room.size)
  return before.size !== room.size || [...room.keys()].some((id) => !before.has(id))
}

export function leaveWatch(slug: string, userId: string, keyId: string, session: string): void {
  const entry = state().rooms.get(slug)?.get(userId)
  entry?.phones?.delete(`${keyId}:${session}`)
  watcherIds(slug)
}

/** Members, once per account across tabs and phones. Expired or revoked leases are removed. */
export function watcherIds(
  slug: string,
  validKey?: (keyId: string, userId: string) => boolean,
): { userId: string; since: number }[] {
  const room = state().rooms.get(slug)
  if (!room) return []
  const now = Date.now()
  for (const [userId, entry] of room) {
    entry.phones ??= new Map()
    for (const [session, phone] of entry.phones) {
      if (phone.expires <= now || (validKey && !validKey(phone.keyId, userId)))
        entry.phones.delete(session)
    }
    if (entry.count <= 0 && entry.phones.size === 0 && (entry.webGraceUntil ?? 0) <= now)
      room.delete(userId)
  }
  if (!room.size) state().rooms.delete(slug)
  return [...room.entries()]
    .map(([userId, e]) => ({ userId, since: e.since }))
    .sort((a, b) => a.since - b.since)
}

/** Live phone credentials, for one batched revocation check by the naming layer. */
export function watcherCredentials(slug: string): { keyId: string; userId: string }[] {
  watcherIds(slug)
  return [...(state().rooms.get(slug)?.entries() ?? [])].flatMap(([userId, entry]) =>
    [...entry.phones.values()].map(({ keyId }) => ({ keyId, userId })),
  )
}

/** Adjust the engine's stream count to count named accounts once and include polling phones. */
export function namedWatchAdjustment(slug: string): number {
  const people = watcherIds(slug)
  const streams = [...(state().rooms.get(slug)?.values() ?? [])].reduce((n, e) => n + e.count, 0)
  return people.length - streams
}

export function isWatching(slug: string, userId: string): boolean {
  return watcherIds(slug).some((w) => w.userId === userId)
}

/** Send a reaction to everyone listening for reactions (the moment's streams filter by slug). */
export function sendReaction(
  signal: Omit<ReactionSignal, 'id' | 'at'> & { id?: string; at?: string },
): ReactionSignal {
  const s = state()
  const full: ReactionSignal = {
    ...signal,
    // The id the post keeps it under (`post_reactions`), when it was kept.
    id: signal.id ?? `r${Date.now().toString(36)}${(s.nextId++).toString(36)}`,
    at: signal.at ?? new Date().toISOString(),
  }
  const kept = freshReactions(s.recent.get(full.slug) ?? [])
  kept.push(full)
  s.recent.set(full.slug, kept.slice(-RECENT_MAX))
  s.bus.emit('reaction', full)
  return full
}

function freshReactions(list: ReactionSignal[], now = Date.now()): ReactionSignal[] {
  return list.filter((r) => now - Date.parse(r.at) < RECENT_MS)
}

/**
 * Reactions sent to `slug` in the last few seconds, oldest first. Phones that
 * poll instead of streaming show these. (The post keeps its own copy in
 * `post_reactions`; see `src/lib/reactions/post-reactions.ts`.)
 */
export function recentReactions(slug: string, now = Date.now()): ReactionSignal[] {
  const s = state()
  const kept = freshReactions(s.recent.get(slug) ?? [], now)
  if (kept.length) s.recent.set(slug, kept)
  else s.recent.delete(slug)
  return kept
}

/** Listen for reactions. Returns the unsubscribe function. */
export function onReaction(listener: (signal: ReactionSignal) => void): () => void {
  const s = state()
  s.bus.on('reaction', listener)
  return () => s.bus.off('reaction', listener)
}
