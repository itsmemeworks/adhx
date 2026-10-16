import { EventEmitter } from 'events'
import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import type { FeedItemResponse as FeedItem } from '@/lib/feed/build-item'
import { captureException } from '@/lib/sentry'
import { keysToHits } from '@/lib/channels/channels'
import { loadSearchItems } from '@/lib/semantic/items'
import { publishable } from '@/lib/semantic/search'
import { INDEX_DIMS, nearestPosts, postVector, refreshIndex } from '@/lib/semantic/vector-index'
import { seedFrom } from '@/lib/channels/cluster'
import {
  ENOUGH_MOMENTS,
  FORMING_TTL_MS,
  IDLE_MS,
  MAX_FORMING,
  MAX_MOMENTS,
  MAX_POSTS,
  PENDING_MS,
  RECOMPUTE_MS,
  STREAM_LENGTH,
  TICK_MS,
  WINDOWS,
  minSavers,
} from './config'
import {
  addToForming,
  bestMoment,
  centreOf,
  findGroups,
  formingProgress,
  isRising,
  joinMoment,
  matchPrevious,
  minuteBars,
  normalize,
  peopleIn,
  pickHue,
  rank,
  slugFor,
  type Forming,
  type Moment,
  type RecentPost,
} from './group'
import { nameMoment } from './naming'

/**
 * "Right now": what people are saving, grouped by meaning, live.
 *
 * Runs in the web process next to the in-memory vector index, only while
 * someone is listening. Every few minutes it regroups recent saves from
 * scratch (`findGroups`); every few seconds it picks up new saves, sorts each
 * into a moment or a forming group, and tells listeners (`subscribe`).
 *
 * Anonymous by construction: savers are only counted (their ids never leave
 * this module), posts are anonymised copies, and only posts allowed in
 * Everyone search (no banned savers, not moderated, not deleted) appear.
 */

// ——— Views sent to browsers ———

export interface MomentView {
  slug: string
  title: string
  hue: string
  people: number
  posts: number
  lastAt: string
  rising: boolean
  watching: number
  /** Newest few posts (up to 8), for the card mosaic. */
  covers: FeedItem[]
}

export interface FormingView {
  id: string
  title: string
  hue: string
  have: number
  need: number
  unit: 'people' | 'saves'
  covers: FeedItem[]
}

export interface StreamItem {
  id: string
  key: string
  at: string
  post: FeedItem
  to:
    | { kind: 'moment'; slug: string; title: string; hue: string }
    | { kind: 'forming'; id: string; title: string; hue: string }
    | null
}

export interface MomentsSnapshot {
  label: string
  hours: number
  moments: MomentView[]
  forming: FormingView[]
  stream: StreamItem[]
  stats: { today: number; lastHour: number }
}

export interface MomentDetail {
  moment: MomentView
  items: { post: FeedItem; savedAt: string; people: number }[]
  bars: number[]
}

export type MomentEvent =
  | { type: 'snapshot'; snapshot: MomentsSnapshot }
  | { type: 'save'; item: StreamItem; moment?: MomentView; forming?: FormingView }
  | { type: 'formed'; moment: MomentView; formingId: string }
  | { type: 'stats'; stats: { today: number; lastHour: number } }
  | { type: 'watching'; slug: string; watching: number }

// ——— State ———

type Pending = { key: string; saver: string; at: number; seen: number }

type State = {
  moments: Moment[]
  forming: Forming[]
  stream: StreamItem[]
  label: string
  hours: number
  mean: Float32Array | null
  lastRecompute: number
  recomputing: Promise<void> | null
  watermark: string
  seenAtWatermark: Set<string>
  pending: Map<string, Pending>
  watching: Map<string, number>
  listeners: number
  lastListenerAt: number
  timer: ReturnType<typeof setInterval> | null
  ticking: boolean
  posts: Map<string, FeedItem>
  stats: { today: number; lastHour: number }
  bus: EventEmitter
  nextId: number
}

const g = globalThis as unknown as { __adhxMoments?: State }

function fresh(): State {
  const bus = new EventEmitter()
  bus.setMaxListeners(0)
  return {
    moments: [],
    forming: [],
    stream: [],
    label: WINDOWS[0].label,
    hours: WINDOWS[0].hours,
    mean: null,
    lastRecompute: 0,
    recomputing: null,
    watermark: '',
    seenAtWatermark: new Set(),
    pending: new Map(),
    watching: new Map(),
    listeners: 0,
    lastListenerAt: 0,
    timer: null,
    ticking: false,
    posts: new Map(),
    stats: { today: 0, lastHour: 0 },
    bus,
    nextId: 1,
  }
}

function state(): State {
  g.__adhxMoments ??= fresh()
  return g.__adhxMoments
}

/** Test-only. */
export function __resetMoments(): void {
  const s = g.__adhxMoments
  if (s?.timer) clearInterval(s.timer)
  g.__adhxMoments = undefined
}

// ——— Reading saves ———

// A quoted post is stored as its own row (`source = 'quoted'`) when the post
// quoting it is saved; nobody chose to save it, so it never counts here.
type SaveRow = { user_id: string; platform: string; id: string; processed_at: string }

function recentSaves(sinceIso: string, limit: number): SaveRow[] {
  return db.all<SaveRow>(sql`
    SELECT b.user_id, b.platform, b.id, b.processed_at
    FROM bookmarks b
    LEFT JOIN user_bans u ON u.user_id = b.user_id
    WHERE u.user_id IS NULL AND COALESCE(b.source, '') != 'quoted' AND b.processed_at >= ${sinceIso}
    ORDER BY b.processed_at DESC
    LIMIT ${limit}
  `)
}

function newSaves(afterIso: string): SaveRow[] {
  return db.all<SaveRow>(sql`
    SELECT b.user_id, b.platform, b.id, b.processed_at
    FROM bookmarks b
    LEFT JOIN user_bans u ON u.user_id = b.user_id
    WHERE u.user_id IS NULL AND COALESCE(b.source, '') != 'quoted' AND b.processed_at >= ${afterIso}
    ORDER BY b.processed_at ASC
    LIMIT 400
  `)
}

function readStats(now: number): { today: number; lastHour: number } {
  const day = new Date(now)
  day.setUTCHours(0, 0, 0, 0)
  const hour = new Date(now - 3_600_000).toISOString()
  const dayIso = day.toISOString()
  const since = dayIso < hour ? dayIso : hour
  const [row] = db.all<{ today: number | null; hour: number | null }>(sql`
    SELECT
      SUM(CASE WHEN processed_at >= ${dayIso} THEN 1 ELSE 0 END) AS today,
      SUM(CASE WHEN processed_at >= ${hour} THEN 1 ELSE 0 END) AS hour
    FROM bookmarks WHERE processed_at >= ${since} AND COALESCE(source, '') != 'quoted'
  `)
  return { today: row?.today ?? 0, lastHour: row?.hour ?? 0 }
}

function postTexts(keys: string[]): string[] {
  const ids = [...new Set(keys.map((k) => k.slice(k.indexOf(':') + 1)))].slice(0, 12)
  if (ids.length === 0) return []
  const rows = db.all<{ text: string }>(sql`
    SELECT text FROM bookmarks WHERE id IN (${sql.join(
      ids.map((id) => sql`${id}`),
      sql`, `,
    )}) GROUP BY platform, id
  `)
  return rows.map((r) => r.text ?? '')
}

/** Anonymised copies of these posts (cached), gone ones left out. */
async function loadPosts(keys: string[]): Promise<Map<string, FeedItem>> {
  const s = state()
  const missing = keys.filter((k) => !s.posts.has(k))
  if (missing.length) {
    const items = await loadSearchItems(keysToHits(missing), '')
    for (const item of items)
      s.posts.set(`${item.post.platform ?? 'twitter'}:${item.post.id}`, item.post)
    if (s.posts.size > 4000) {
      const drop = [...s.posts.keys()].slice(0, s.posts.size - 3000)
      for (const k of drop) s.posts.delete(k)
    }
  }
  const out = new Map<string, FeedItem>()
  for (const k of keys) {
    const p = s.posts.get(k)
    if (p) out.set(k, p)
  }
  return out
}

// ——— Vectors ———

function centred(raw: Float32Array, mean: Float32Array | null): Float32Array {
  const v = new Float32Array(INDEX_DIMS)
  for (let i = 0; i < INDEX_DIMS; i++) v[i] = raw[i] - (mean?.[i] ?? 0)
  return normalize(v)
}

// ——— Views ———

function newestKeys(members: Map<string, { lastAt: number }>, n: number): string[] {
  return [...members.entries()]
    .sort((a, b) => b[1].lastAt - a[1].lastAt)
    .slice(0, n)
    .map(([k]) => k)
}

async function momentView(m: Moment, now = Date.now()): Promise<MomentView> {
  const s = state()
  const covers = await loadPosts(newestKeys(m.members, 8))
  let last = 0
  for (const member of m.members.values()) last = Math.max(last, member.lastAt)
  return {
    slug: m.slug,
    title: m.title,
    hue: m.hue,
    people: peopleIn(m.members),
    posts: m.members.size,
    lastAt: new Date(last || now).toISOString(),
    rising: isRising(m.recent, now),
    watching: s.watching.get(m.slug) ?? 0,
    covers: [...covers.values()].slice(0, 8),
  }
}

async function formingView(f: Forming): Promise<FormingView> {
  const progress = formingProgress(f, minSavers())
  const covers = await loadPosts(newestKeys(f.members, 6))
  return {
    id: f.id,
    title: f.title ?? 'Something new',
    hue: f.hue,
    have: progress.have,
    need: progress.need,
    unit: progress.unit,
    covers: [...covers.values()].slice(0, 3),
  }
}

function visibleForming(s: State): Forming[] {
  return [...s.forming]
    .filter((f) => f.members.size >= 2)
    .sort((a, b) => peopleIn(b.members) - peopleIn(a.members) || b.lastAt - a.lastAt)
    .slice(0, MAX_FORMING)
}

async function snapshot(): Promise<MomentsSnapshot> {
  const s = state()
  const now = Date.now()
  return {
    label: s.label,
    hours: s.hours,
    moments: await Promise.all(s.moments.map((m) => momentView(m, now))),
    forming: await Promise.all(visibleForming(s).map(formingView)),
    stream: s.stream,
    stats: s.stats,
  }
}

function emit(event: MomentEvent): void {
  state().bus.emit('event', event)
}

function hueInUse(s: State): Set<string> {
  return new Set([...s.moments.map((m) => m.hue), ...s.forming.map((f) => f.hue)])
}

// ——— Regrouping ———

async function recompute(): Promise<void> {
  const s = state()
  const now = Date.now()
  await refreshIndex(true)
  const min = minSavers()

  type Candidate = {
    posts: RecentPost[]
    raws: Map<string, Float32Array>
    hours: number
    label: string
    mean: Float32Array
    drafts: ReturnType<typeof findGroups>
    newest: { key: string; at: number }[]
  }
  let chosen: Candidate | null = null
  for (const w of WINDOWS) {
    const rows = recentSaves(new Date(now - w.hours * 3_600_000).toISOString(), MAX_POSTS * 3)
    const byKey = new Map<string, { savers: Set<string>; lastAt: number }>()
    for (const r of rows) {
      const key = `${r.platform}:${r.id}`
      const at = Date.parse(r.processed_at) || now
      const e = byKey.get(key) ?? { savers: new Set<string>(), lastAt: 0 }
      e.savers.add(r.user_id)
      e.lastAt = Math.max(e.lastAt, at)
      byKey.set(key, e)
      if (byKey.size >= MAX_POSTS) break
    }
    const allowed = byKey.size ? await publishable([...byKey.keys()]) : new Set<string>()
    const raws = new Map<string, Float32Array>()
    for (const key of byKey.keys()) {
      if (!allowed.has(key)) continue
      const v = postVector(key)
      if (v) raws.set(key, v)
    }
    if (raws.size === 0) continue
    // The mean of unit vectors, not re-normalised, is what's subtracted.
    const meanRaw = new Float32Array(INDEX_DIMS)
    for (const v of raws.values())
      for (let i = 0; i < INDEX_DIMS; i++) meanRaw[i] += v[i] / raws.size
    const posts: RecentPost[] = [...raws.entries()].map(([key, raw]) => ({
      key,
      vector: centred(raw, meanRaw),
      savers: byKey.get(key)!.savers,
      lastAt: byKey.get(key)!.lastAt,
    }))
    const found = findGroups(posts, { minSavers: min, seed: seedFrom(`moments:${w.hours}`), now })
    // Widen only when a wider window actually finds more (and say which window it is).
    if (!chosen || found.length > chosen.drafts.length) {
      chosen = {
        posts,
        raws,
        hours: w.hours,
        label: w.label,
        mean: meanRaw,
        drafts: found,
        newest: [...raws.keys()]
          .map((key) => ({ key, at: byKey.get(key)!.lastAt }))
          .sort((a, b) => b.at - a.at)
          .slice(0, STREAM_LENGTH),
      }
    }
    if (chosen.drafts.length >= ENOUGH_MOMENTS) break
  }
  const drafts = chosen?.drafts ?? []
  if (chosen) s.mean = chosen.mean

  const previous = s.moments
  const matches = matchPrevious(drafts, previous)
  const taken = new Set<string>()
  const moments: Moment[] = []
  for (let i = 0; i < drafts.length; i++) {
    const d = drafts[i]
    const prev = matches[i]
    const keys = [...d.members.keys()]
    const raw = centreOf(keys.map((k) => chosen!.raws.get(k)!).filter(Boolean))
    let title = prev?.title
    if (!title || taken.has(title)) {
      title = await nameMoment(raw, postTexts(newestKeys(d.members, 12)), taken)
    }
    taken.add(title)
    const hue = prev?.hue ?? pickHue(seedFrom(title), new Set(moments.map((m) => m.hue)))
    const recent: number[] = prev?.recent.slice() ?? []
    if (!prev) {
      for (const m of d.members.values()) if (now - m.lastAt < 2 * 3_600_000) recent.push(m.lastAt)
      recent.sort((a, b) => a - b)
    }
    moments.push({
      slug: prev?.slug ?? slugFor(title, d.centroid),
      title,
      hue,
      centroid: d.centroid,
      raw,
      members: d.members,
      recent,
      createdAt: prev?.createdAt ?? now,
    })
  }
  s.moments = moments
  s.hours = chosen?.hours ?? WINDOWS[0].hours
  s.label = chosen?.label ?? WINDOWS[0].label
  // Forming groups whose posts are now in a moment are done; stale ones expire.
  const inMoments = new Set(moments.flatMap((m) => [...m.members.keys()]))
  s.forming = s.forming.filter(
    (f) => now - f.lastAt < FORMING_TTL_MS && ![...f.members.keys()].some((k) => inMoments.has(k)),
  )
  s.lastRecompute = now
  s.stats = readStats(now)
  if (!s.watermark) {
    // First look: only saves from now on are "new". The strip starts with the
    // latest saves (no events for them).
    const [latest] = db.all<{ at: string | null }>(sql`
      SELECT MAX(processed_at) AS at FROM bookmarks WHERE COALESCE(source, '') != 'quoted'
    `)
    s.watermark = latest?.at ?? new Date(now).toISOString()
    s.seenAtWatermark = new Set(
      newSaves(s.watermark).map((r) => `${r.user_id}|${r.platform}:${r.id}|${r.processed_at}`),
    )
    if (chosen && s.stream.length === 0) {
      const posts = await loadPosts(chosen.newest.map((n) => n.key))
      s.stream = chosen.newest
        .filter((n) => posts.has(n.key))
        .map((n) => {
          const m = moments.find((x) => x.members.has(n.key))
          return {
            id: `${n.key}@${n.at}`,
            key: n.key,
            at: new Date(n.at).toISOString(),
            post: posts.get(n.key)!,
            to: m ? { kind: 'moment' as const, slug: m.slug, title: m.title, hue: m.hue } : null,
          }
        })
    }
  }
  emit({ type: 'snapshot', snapshot: await snapshot() })
}

function ensureRecomputed(force = false): Promise<void> {
  const s = state()
  if (s.recomputing) return s.recomputing
  if (!force && s.lastRecompute && Date.now() - s.lastRecompute < RECOMPUTE_MS)
    return Promise.resolve()
  s.recomputing = recompute()
    .catch((error) => captureException(error, { endpoint: 'moments.recompute' }))
    .finally(() => {
      state().recomputing = null
    })
  return s.recomputing
}

// ——— New saves ———

async function promote(f: Forming): Promise<Moment> {
  const s = state()
  const keys = [...f.members.keys()]
  const taken = new Set(s.moments.map((m) => m.title))
  const title = await nameMoment(f.raw, postTexts(keys), taken)
  const now = Date.now()
  const moment: Moment = {
    slug: slugFor(title, f.centroid),
    title,
    hue: f.hue,
    centroid: f.centroid,
    raw: f.raw,
    members: f.members,
    recent: [...f.members.values()].map((m) => m.lastAt).sort((a, b) => a - b),
    createdAt: now,
  }
  s.moments.push(moment)
  s.moments.sort((a, b) => rank(b.members, now) - rank(a.members, now))
  if (s.moments.length > MAX_MOMENTS + 3) s.moments.length = MAX_MOMENTS + 3
  s.forming = s.forming.filter((x) => x !== f)
  return moment
}

/** Pick up saves made since the last look and sort each into a moment. */
async function processNewSaves(): Promise<void> {
  const s = state()
  const now = Date.now()
  if (!s.watermark) await ensureRecomputed(true)
  const rows = newSaves(s.watermark)
  for (const r of rows) {
    const id = `${r.user_id}|${r.platform}:${r.id}|${r.processed_at}`
    if (r.processed_at === s.watermark && s.seenAtWatermark.has(id)) continue
    if (r.processed_at > s.watermark) {
      s.watermark = r.processed_at
      s.seenAtWatermark = new Set()
    }
    s.seenAtWatermark.add(id)
    const key = `${r.platform}:${r.id}`
    s.pending.set(`${r.user_id}|${key}`, {
      key,
      saver: r.user_id,
      at: Date.parse(r.processed_at) || now,
      seen: now,
    })
  }
  if (s.pending.size === 0) return

  // This runs every few seconds at most, so read new vectors every time.
  await refreshIndex(true)
  const ready: Pending[] = []
  for (const [id, p] of s.pending) {
    if (postVector(p.key)) {
      ready.push(p)
      s.pending.delete(id)
    } else if (now - p.seen > PENDING_MS) {
      s.pending.delete(id)
    }
  }
  if (ready.length === 0) return
  const allowed = await publishable([...new Set(ready.map((p) => p.key))])
  const shown = ready.filter((p) => allowed.has(p.key))
  const posts = await loadPosts(shown.map((p) => p.key))
  const min = minSavers()

  let streamed = 0
  for (const p of shown) {
    const post = posts.get(p.key)
    if (!post) continue
    const raw = postVector(p.key)!
    const v = centred(raw, s.mean)
    let to: StreamItem['to'] = null
    let momentChanged: Moment | null = null
    let formingChanged: Forming | null = null
    let formed: { moment: Moment; formingId: string } | null = null

    const best = bestMoment(v, s.moments)
    if (best) {
      joinMoment(best.moment, p.key, p.saver, p.at)
      momentChanged = best.moment
      to = {
        kind: 'moment',
        slug: best.moment.slug,
        title: best.moment.title,
        hue: best.moment.hue,
      }
    } else {
      const f = addToForming(
        s.forming,
        p.key,
        v,
        p.saver,
        p.at,
        () => `f${s.nextId++}`,
        pickHue(s.nextId * 7, hueInUse(s)),
        raw,
      )
      if (!f.title || f.members.size % 2 === 0) {
        f.title = await nameMoment(
          f.raw,
          postTexts([...f.members.keys()]),
          new Set(),
          {},
          { useJev: false },
        )
      }
      if (formingProgress(f, min).ready) {
        const moment = await promote(f)
        formed = { moment, formingId: f.id }
        to = { kind: 'moment', slug: moment.slug, title: moment.title, hue: moment.hue }
      } else {
        formingChanged = f
        to = { kind: 'forming', id: f.id, title: f.title ?? 'Something new', hue: f.hue }
      }
      // Keep the forming list bounded: oldest, smallest go first.
      if (s.forming.length > 40) {
        s.forming.sort((a, b) => b.lastAt - a.lastAt)
        s.forming.length = 40
      }
    }

    const item: StreamItem = {
      id: `${p.key}@${p.at}`,
      key: p.key,
      at: new Date(p.at).toISOString(),
      post,
      to,
    }
    if (formed) {
      emit({ type: 'formed', moment: await momentView(formed.moment), formingId: formed.formingId })
    }
    // A big import shouldn't flood the strip: a few per look, the rest still count.
    if (streamed < 6) {
      streamed++
      s.stream = [item, ...s.stream.filter((x) => x.id !== item.id)].slice(0, STREAM_LENGTH)
      emit({
        type: 'save',
        item,
        moment: momentChanged ? await momentView(momentChanged) : undefined,
        forming:
          formingChanged && formingChanged.members.size >= 2
            ? await formingView(formingChanged)
            : undefined,
      })
    } else if (momentChanged) {
      emit({ type: 'snapshot', snapshot: await snapshot() })
    }
  }
  const stats = readStats(now)
  if (stats.today !== s.stats.today || stats.lastHour !== s.stats.lastHour) {
    s.stats = stats
    emit({ type: 'stats', stats })
  }
}

async function tick(): Promise<void> {
  const s = state()
  if (s.ticking) return
  s.ticking = true
  try {
    if (s.listeners === 0 && Date.now() - s.lastListenerAt > IDLE_MS) {
      if (s.timer) clearInterval(s.timer)
      s.timer = null
      return
    }
    await ensureRecomputed()
    await processNewSaves()
  } catch (error) {
    captureException(error, { endpoint: 'moments.tick' })
  } finally {
    s.ticking = false
  }
}

function ensureRunning(): void {
  const s = state()
  s.lastListenerAt = Date.now()
  if (!s.timer && process.env['NODE_ENV'] !== 'test') {
    s.timer = setInterval(() => void tick(), TICK_MS)
    s.timer.unref?.()
  }
}

// ——— Public API ———

/** Everything "Right now" shows, computing it first if needed. */
export async function getMomentsSnapshot(): Promise<MomentsSnapshot> {
  ensureRunning()
  await ensureRecomputed()
  return snapshot()
}

/** One moment's posts, newest first, with per-minute save counts. */
export async function getMomentDetail(slug: string, limit = 60): Promise<MomentDetail | null> {
  ensureRunning()
  await ensureRecomputed()
  const m = state().moments.find((x) => x.slug === slug)
  if (!m) return null
  const keys = newestKeys(m.members, limit)
  const posts = await loadPosts(keys)
  return {
    moment: await momentView(m),
    items: keys
      .filter((k) => posts.has(k))
      .map((k) => ({
        post: posts.get(k)!,
        savedAt: new Date(m.members.get(k)!.lastAt).toISOString(),
        people: m.members.get(k)!.savers.size,
      })),
    bars: minuteBars(m.recent, Date.now()),
  }
}

/** Posts near a moment that aren't in it yet ("Wander"), best first. */
export async function getMomentNeighbours(slug: string, limit = 20): Promise<FeedItem[] | null> {
  await ensureRecomputed()
  const m = state().moments.find((x) => x.slug === slug)
  if (!m) return null
  const hits = nearestPosts(m.raw, limit * 2, new Set(m.members.keys()))
  const allowed = await publishable(hits.map((h) => h.key))
  const keys = hits.map((h) => h.key).filter((k) => allowed.has(k))
  const posts = await loadPosts(keys)
  return keys
    .map((k) => posts.get(k))
    .filter((p): p is FeedItem => !!p)
    .slice(0, limit)
}

/**
 * Listen for live events. `watch` counts this listener as watching that
 * moment (Tune in, a moment's page). Returns the unsubscribe function.
 */
export function subscribe(listener: (event: MomentEvent) => void, watch?: string): () => void {
  const s = state()
  s.listeners++
  ensureRunning()
  void ensureRecomputed()
  s.bus.on('event', listener)
  if (watch) {
    const n = (s.watching.get(watch) ?? 0) + 1
    s.watching.set(watch, n)
    emit({ type: 'watching', slug: watch, watching: n })
  }
  let done = false
  return () => {
    if (done) return
    done = true
    s.listeners = Math.max(0, s.listeners - 1)
    s.lastListenerAt = Date.now()
    s.bus.off('event', listener)
    if (watch) {
      const n = Math.max(0, (s.watching.get(watch) ?? 1) - 1)
      if (n === 0) s.watching.delete(watch)
      else s.watching.set(watch, n)
      emit({ type: 'watching', slug: watch, watching: n })
    }
  }
}

/** Test hooks: run one regroup / one look at new saves now. */
export const __moments = { recompute: () => ensureRecomputed(true), processNewSaves, tick }
