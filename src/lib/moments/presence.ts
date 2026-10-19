import { EventEmitter } from 'events'
import type { ReactionEmoji } from './reactions'

/**
 * Who is tuned in to which moment, by account, and the reactions they send.
 * In-process on `globalThis` like the engine (a dev reload keeps it), never
 * stored. The engine still counts every viewer anonymously; this only knows
 * signed-in members, and `people.ts` turns it into names for other members.
 *
 * Account ids stay server-side: nothing here is sent to a client as is.
 */

type Entry = { count: number; since: number }

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
}

const g = globalThis as unknown as { __adhxMomentPresence?: State }

function state(): State {
  if (!g.__adhxMomentPresence) {
    const bus = new EventEmitter()
    bus.setMaxListeners(0)
    g.__adhxMomentPresence = { rooms: new Map(), bus, nextId: 1 }
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
  const entry = room.get(userId) ?? { count: 0, since: Date.now() }
  entry.count++
  room.set(userId, entry)
  let left = false
  return () => {
    if (left) return
    left = true
    const r = state().rooms.get(slug)
    const e = r?.get(userId)
    if (!r || !e) return
    e.count--
    if (e.count <= 0) r.delete(userId)
    if (r.size === 0) state().rooms.delete(slug)
  }
}

/** Members tuned in to `slug`, first to arrive first. */
export function watcherIds(slug: string): { userId: string; since: number }[] {
  const room = state().rooms.get(slug)
  if (!room) return []
  return [...room.entries()]
    .map(([userId, e]) => ({ userId, since: e.since }))
    .sort((a, b) => a.since - b.since)
}

export function isWatching(slug: string, userId: string): boolean {
  return !!state().rooms.get(slug)?.has(userId)
}

/** Send a reaction to everyone listening for reactions (the moment's streams filter by slug). */
export function sendReaction(signal: Omit<ReactionSignal, 'id' | 'at'>): ReactionSignal {
  const s = state()
  const full: ReactionSignal = {
    ...signal,
    id: `r${Date.now().toString(36)}${(s.nextId++).toString(36)}`,
    at: new Date().toISOString(),
  }
  s.bus.emit('reaction', full)
  return full
}

/** Listen for reactions. Returns the unsubscribe function. */
export function onReaction(listener: (signal: ReactionSignal) => void): () => void {
  const s = state()
  s.bus.on('reaction', listener)
  return () => s.bus.off('reaction', listener)
}
