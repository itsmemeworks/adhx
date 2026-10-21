import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { privateKeysFor, saversFor } from '@/lib/people/savers'
import { membersById } from '@/lib/people/by-id'
import type { Saver } from '@/lib/people/types'
import { formingAlertsFor } from './alerts'
import {
  formingPostKeys,
  momentPostKeys,
  watchingCount,
  type FormingView,
  type MomentDetail,
  type MomentEvent,
  type MomentView,
  type MomentsSnapshot,
  type StreamItem,
} from './engine'
import { watcherCredentials, watcherIds, type ReactionSignal } from './presence'

/**
 * Live with names: who is saving a moment, who is watching it, who reacted.
 * Added per request, only for a signed-in member (`viewerId`), on top of the
 * engine's anonymous output. Signed out (`viewerId === ''`) every helper
 * returns its input untouched, so public responses keep their old shape and
 * never carry a name.
 *
 * Moments name visible saves only (`saversFor` minus the viewer's own private
 * saves): a private save is never counted or named here, not even to its owner.
 */

/** Faces on a moment card. `people` on the view is the full count. */
export const MAX_MOMENT_SAVERS = 5
/** Watchers named at most (the count is still `watching`). */
export const MAX_WATCHERS = 12

/** Visible savers per post (newest first), without the viewer's own private saves. */
function visibleSavers(keys: string[], viewerId: string): Map<string, Saver[]> {
  const posts = keys.map((k) => {
    const at = k.indexOf(':')
    return { platform: k.slice(0, at), id: k.slice(at + 1) }
  })
  const savers = saversFor(posts, viewerId)
  const own = privateKeysFor(posts, viewerId)
  for (const key of own) {
    const list = savers.get(key)?.filter((s) => !s.isYou)
    if (list?.length) savers.set(key, list)
    else savers.delete(key)
  }
  return savers
}

/** Only saver metadata for older cached posts; never hydrate their text/media again. */
export function momentSaverUpdates(
  keys: string[],
  viewerId: string,
): { key: string; savers: Saver[]; isPrivate: boolean }[] {
  const savers = visibleSavers(keys, viewerId)
  const ownPrivate = privateKeysFor(
    keys.map((key) => {
      const split = key.indexOf(':')
      return { platform: key.slice(0, split), id: key.slice(split + 1) }
    }),
    viewerId,
  )
  return keys.map((key) => ({ key, savers: savers.get(key) ?? [], isPrivate: ownPrivate.has(key) }))
}

/** Steps for "N saves in M min": the smallest one holding the recent saves. */
export const RECENT_WINDOWS_MINUTES = [5, 10, 15, 30, 60] as const

/** How busy a moment is lately: visible saves into it, and over how many minutes. */
export interface MomentRecent {
  /** Visible saves into the moment's posts in the last `windowMinutes`. */
  recentSaves: number
  /** 5, 10, 15, 30 or 60: the smallest step that holds them (60 when there are none). */
  windowMinutes: number
}

/** Each post's visible savers inside the moment's window, or null for no such moment. */
function momentSaves(slug: string, viewerId: string): Saver[][] | null {
  const found = momentPostKeys(slug)
  if (!found) return null
  const byKey = visibleSavers(found.keys, viewerId)
  return [...byKey.values()].map((list) => list.filter((s) => s.savedAt >= found.since))
}

/** Up to 5 people saving these, newest first (no notes: faces are the moment's, not a post's). */
function facesOf(saves: Saver[][]): Saver[] {
  const newest = new Map<string, Saver>()
  for (const list of saves) {
    for (const s of list) {
      const had = newest.get(s.username)
      if (!had || had.savedAt < s.savedAt) newest.set(s.username, s)
    }
  }
  return (
    [...newest.values()]
      .sort((a, b) => (a.savedAt < b.savedAt ? 1 : a.savedAt > b.savedAt ? -1 : 0))
      .slice(0, MAX_MOMENT_SAVERS)
      // Faces on the whole moment, not one post: a note belongs with its post.
      .map(({ note: _note, ...face }) => face)
  )
}

/**
 * "3 saves in 10 min": the visible saves of the last hour, counted over the
 * smallest step (`RECENT_WINDOWS_MINUTES`) that holds the oldest of them, in
 * whole minutes like `timeAgo` (a save 10½ minutes ago is "in 10 min").
 */
export function recentOf(saves: Saver[][], now = Date.now()): MomentRecent {
  const longest = RECENT_WINDOWS_MINUTES[RECENT_WINDOWS_MINUTES.length - 1]
  const from = now - longest * 60_000
  const times = saves
    .flat()
    .map((s) => Date.parse(s.savedAt))
    .filter((t) => Number.isFinite(t) && t >= from && t <= now)
  if (times.length === 0) return { recentSaves: 0, windowMinutes: longest }
  // Whole minutes, as the rows say it ("Jo · 10 min ago" is inside "in 10 min").
  const age = Math.floor((now - Math.min(...times)) / 60_000)
  const windowMinutes = RECENT_WINDOWS_MINUTES.find((m) => m >= age) ?? longest
  return { recentSaves: times.length, windowMinutes }
}

/** Up to 5 people saving a moment's posts in its window, newest first. */
export function momentSavers(slug: string, viewerId: string): Saver[] {
  if (!viewerId) return []
  const saves = momentSaves(slug, viewerId)
  return saves ? facesOf(saves) : []
}

/** How busy a moment is lately, for a member ("3 saves in 10 min"). */
export function momentRecent(slug: string, viewerId: string, now = Date.now()): MomentRecent {
  const saves = viewerId ? momentSaves(slug, viewerId) : null
  return recentOf(saves ?? [], now)
}

/** Revocation takes effect on the next response/event, rather than waiting for lease expiry. */
function authorizedWatcherIds(slug: string) {
  const keys = [...new Set(watcherCredentials(slug).map((c) => c.keyId))]
  const allowed = new Map<string, string>()
  for (let i = 0; i < keys.length; i += 400) {
    const rows = db.all<{ id: string; user_id: string }>(
      sql`SELECT id, user_id FROM access_keys WHERE scope = 'phone' AND id IN (${sql.join(
        keys.slice(i, i + 400).map((id) => sql`${id}`),
        sql`, `,
      )})`,
    )
    for (const row of rows) allowed.set(row.id, row.user_id)
  }
  return watcherIds(slug, (keyId, userId) => allowed.get(keyId) === userId)
}

function memberWatchingCount(slug: string): number {
  const ids = authorizedWatcherIds(slug).map((w) => w.userId)
  return Math.max(0, watchingCount(slug) - ids.length + membersById(ids).size)
}

/** Members tuned in to a moment now, without the viewer; banned accounts left out. */
export function watchersFor(slug: string, viewerId: string): Saver[] {
  if (!viewerId) return []
  const ids = authorizedWatcherIds(slug).filter((w) => w.userId !== viewerId)
  if (ids.length === 0) return []
  const faces = membersById(ids.map((w) => w.userId))
  const out: Saver[] = []
  for (const w of ids) {
    const face = faces.get(w.userId)
    if (!face) continue
    out.push({ ...face, savedAt: new Date(w.since).toISOString(), isYou: false })
    if (out.length >= MAX_WATCHERS) break
  }
  return out
}

/** Who saved each cover (newest first), so a card can say "Ana · Reddit video · 4 min ago". */
function coversWithSavers(covers: MomentView['covers'], viewerId: string): MomentView['covers'] {
  if (covers.length === 0) return covers
  const keys = covers.map((c) => `${c.platform ?? 'twitter'}:${c.id}`)
  const savers = visibleSavers(keys, viewerId)
  return covers.map((c, i) => ({ ...c, savers: savers.get(keys[i]) ?? [] }))
}

export function withMomentPeople(moment: MomentView, viewerId: string): MomentView {
  if (!viewerId) return moment
  const saves = momentSaves(moment.slug, viewerId) ?? []
  return {
    ...moment,
    covers: coversWithSavers(moment.covers, viewerId),
    watching: memberWatchingCount(moment.slug),
    savers: facesOf(saves),
    watchers: watchersFor(moment.slug, viewerId),
    ...recentOf(saves),
  }
}

/** Faces on a forming card ("Jo and Ben"), at most this many. */
export const MAX_FORMING_PEOPLE = 4

/**
 * Members only: who's saving a forming group (visible saves in the window,
 * newest saver first, at most 4, names and faces only) and whether the viewer
 * asked to be told when it goes live.
 */
export function withFormingPeople(
  forming: FormingView,
  viewerId: string,
  alerts?: ReadonlySet<string>,
): FormingView {
  if (!viewerId) return forming
  const found = formingPostKeys(forming.id)
  const saves = found
    ? [...visibleSavers(found.keys, viewerId).values()].map((list) =>
        list.filter((x) => x.savedAt >= found.since),
      )
    : []
  const people = facesOf(saves)
    .slice(0, MAX_FORMING_PEOPLE)
    .map((p) => ({ username: p.username, name: p.name, avatarUrl: p.avatarUrl }))
  const alert = (alerts ?? formingAlertsFor(viewerId, [forming.id])).has(forming.id)
  return { ...forming, people, alert }
}

export function withSnapshotPeople(snapshot: MomentsSnapshot, viewerId: string): MomentsSnapshot {
  if (!viewerId) return snapshot
  const alerts = formingAlertsFor(
    viewerId,
    snapshot.forming.map((f) => f.id),
  )
  return {
    ...snapshot,
    moments: snapshot.moments.map((m) => withMomentPeople(m, viewerId)),
    forming: snapshot.forming.map((f) => withFormingPeople(f, viewerId, alerts)),
  }
}

export function withDetailPeople(detail: MomentDetail, viewerId: string): MomentDetail {
  if (!viewerId) return detail
  const keys = detail.items.map((i) => `${i.post.platform ?? 'twitter'}:${i.post.id}`)
  const savers = visibleSavers(keys, viewerId)
  const moment = withMomentPeople(detail.moment, viewerId)
  return {
    ...detail,
    moment,
    items: detail.items.map((item, i) => ({ ...item, savers: savers.get(keys[i]) ?? [] })),
    watchers: moment.watchers ?? [],
  }
}

/** Who just saved this stream item: the visible save made then, else the newest. */
export function arrivingSaver(item: StreamItem, viewerId: string): Saver | undefined {
  if (!viewerId) return undefined
  const list = visibleSavers([item.key], viewerId).get(item.key) ?? []
  const at = Date.parse(item.at)
  return list.find((s) => Date.parse(s.savedAt) === at) ?? list[0]
}

/** An engine event as this subscriber may see it: names added for members only. */
export function eventForViewer(event: MomentEvent, viewerId: string): MomentEvent {
  if (!viewerId) return event
  switch (event.type) {
    case 'snapshot':
      return { ...event, snapshot: withSnapshotPeople(event.snapshot, viewerId) }
    case 'formed':
      return { ...event, moment: withMomentPeople(event.moment, viewerId) }
    case 'save': {
      const saver = arrivingSaver(event.item, viewerId)
      return {
        ...event,
        ...(event.moment ? { moment: withMomentPeople(event.moment, viewerId) } : {}),
        ...(event.forming ? { forming: withFormingPeople(event.forming, viewerId) } : {}),
        ...(saver ? { saver } : {}),
      }
    }
    case 'watching':
      return {
        ...event,
        watching: memberWatchingCount(event.slug),
        watchers: watchersFor(event.slug, viewerId),
      }
    default:
      return event
  }
}

/** A reaction named for one receiver (a member); null for strangers or a banned reactor. */
export function reactionForViewer(
  signal: ReactionSignal,
  viewerId: string,
): Extract<MomentEvent, { type: 'reaction' }> | null {
  if (!viewerId) return null
  const face = membersById([signal.userId]).get(signal.userId)
  if (!face) return null
  return {
    type: 'reaction',
    slug: signal.slug,
    id: signal.id,
    at: signal.at,
    saver: { ...face, savedAt: signal.at, isYou: signal.userId === viewerId },
    ...(signal.emoji ? { emoji: signal.emoji } : { text: signal.text ?? '' }),
    post: signal.post,
  }
}
