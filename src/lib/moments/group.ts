import { kmeans } from '@/lib/channels/cluster'
import {
  FORM_SIMILARITY,
  HALF_LIFE_HOURS,
  HUES,
  JOIN_SIMILARITY,
  KEEP_SIMILARITY,
  MAX_MOMENTS,
  MIN_COHESION,
  MIN_POSTS,
  SAME_MOMENT,
} from './config'

/**
 * Pure grouping for moments: find tight groups among recent saves, keep a
 * moment's identity (slug, name, colour) across recomputes, and sort a new
 * save into a moment or a forming group. No I/O; `engine.ts` feeds it.
 */

export interface RecentPost {
  key: string
  /** Centred vector (the average post vector subtracted), unit length. */
  vector: Float32Array
  /** Who saved it in the window (ids stay server-side, never shown). */
  savers: Set<string>
  /** Latest save, ms. */
  lastAt: number
}

export interface Member {
  lastAt: number
  savers: Set<string>
}

export interface Moment {
  slug: string
  title: string
  hue: string
  /** Centre in centred space (grouping). */
  centroid: Float32Array
  /** Centre in raw post-vector space (naming, "Wander"). */
  raw: Float32Array
  members: Map<string, Member>
  /** Save times in the last couple of hours (ms), for "rising" and the minute bars. */
  recent: number[]
  createdAt: number
}

export interface Forming {
  id: string
  centroid: Float32Array
  raw: Float32Array
  members: Map<string, Member>
  firstAt: number
  lastAt: number
  title: string | null
  hue: string
}

export interface Draft {
  centroid: Float32Array
  members: Map<string, Member>
  cohesion: number
  score: number
}

export function dot(a: Float32Array, b: Float32Array): number {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}

export function normalize(v: Float32Array): Float32Array {
  let n = 0
  for (let i = 0; i < v.length; i++) n += v[i] * v[i]
  n = Math.sqrt(n) || 1
  for (let i = 0; i < v.length; i++) v[i] /= n
  return v
}

/** Mean of member vectors, unit length. */
export function centreOf(vectors: Float32Array[]): Float32Array {
  const sum = new Float32Array(vectors[0]?.length ?? 0)
  for (const v of vectors) for (let i = 0; i < v.length; i++) sum[i] += v[i]
  return normalize(sum)
}

export function peopleIn(members: Map<string, Member>): number {
  const all = new Set<string>()
  for (const m of members.values()) for (const s of m.savers) all.add(s)
  return all.size
}

/** Distinct savers × freshness × size: what's big, recent and shared. */
export function rank(members: Map<string, Member>, now: number): number {
  let last = 0
  for (const m of members.values()) last = Math.max(last, m.lastAt)
  const hours = Math.max(0, (now - last) / 3_600_000)
  const fresh = Math.pow(0.5, hours / HALF_LIFE_HOURS)
  return peopleIn(members) * fresh * (1 + Math.log(members.size))
}

/** How many groups to look for among `n` recent posts. */
export function clusterCount(n: number): number {
  return Math.max(1, Math.min(48, Math.round(n / 10)))
}

/**
 * Tight groups among recent posts that enough different people saved. Each
 * k-means cluster is cut down to members close to its centre; what's left
 * must still be cohesive, big enough and shared by `minSavers` people.
 */
export function findGroups(
  posts: RecentPost[],
  opts: { minSavers: number; seed: number; now: number },
): Draft[] {
  if (posts.length < MIN_POSTS) return []
  const clusters = kmeans(
    posts.map((p) => p.vector),
    clusterCount(posts.length),
    opts.seed,
  )
  const drafts: Draft[] = []
  for (const c of clusters) {
    // Cut to members near the centre, then re-centre and cut again: a few
    // loose members pull a small group's centre off its topic.
    let kept = c.members.filter((i) => dot(posts[i].vector, c.centroid) >= KEEP_SIMILARITY)
    let centroid = c.centroid
    for (let pass = 0; pass < 3 && kept.length >= MIN_POSTS; pass++) {
      centroid = centreOf(kept.map((i) => posts[i].vector))
      const tighter = kept.filter((i) => dot(posts[i].vector, centroid) >= KEEP_SIMILARITY)
      if (tighter.length === kept.length) break
      kept = tighter
    }
    if (kept.length < MIN_POSTS) continue
    centroid = centreOf(kept.map((i) => posts[i].vector))
    const cohesion = kept.reduce((t, i) => t + dot(posts[i].vector, centroid), 0) / kept.length
    if (cohesion < MIN_COHESION) continue
    const members = new Map<string, Member>()
    for (const i of kept)
      members.set(posts[i].key, { lastAt: posts[i].lastAt, savers: new Set(posts[i].savers) })
    if (peopleIn(members) < opts.minSavers) continue
    drafts.push({ centroid, members, cohesion, score: rank(members, opts.now) })
  }
  return drafts.sort((a, b) => b.score - a.score).slice(0, MAX_MOMENTS)
}

/**
 * Pair new drafts with the moments they continue (centre similarity), so a
 * moment keeps its slug, name and colour while it grows. Greedy, best pair
 * first. Returns, per draft, the moment it continues or null.
 */
export function matchPrevious(drafts: Draft[], previous: Moment[]): (Moment | null)[] {
  const pairs: { d: number; p: number; s: number }[] = []
  drafts.forEach((d, di) =>
    previous.forEach((p, pi) => {
      const s = dot(d.centroid, p.centroid)
      if (s >= SAME_MOMENT) pairs.push({ d: di, p: pi, s })
    }),
  )
  pairs.sort((a, b) => b.s - a.s)
  const out: (Moment | null)[] = drafts.map(() => null)
  const used = new Set<number>()
  for (const { d, p } of pairs) {
    if (out[d] || used.has(p)) continue
    out[d] = previous[p]
    used.add(p)
  }
  return out
}

/** A colour not already on screen, stable for a given seed. */
export function pickHue(seed: number, inUse: ReadonlySet<string>): string {
  for (let i = 0; i < HUES.length; i++) {
    const hue = HUES[(seed + i) % HUES.length]
    if (!inUse.has(hue)) return hue
  }
  return HUES[seed % HUES.length]
}

export function slugFor(title: string, centroid: Float32Array): string {
  let h = 2166136261
  for (let i = 0; i < 16; i++) h = Math.imul(h ^ Math.round(centroid[i] * 1e4), 16777619)
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
  return `${base || 'moment'}-${(h >>> 0).toString(36).slice(0, 5)}`
}

/** The moment a new post belongs to, if any is close enough. */
export function bestMoment(
  vector: Float32Array,
  moments: Moment[],
): { moment: Moment; similarity: number } | null {
  let best: { moment: Moment; similarity: number } | null = null
  for (const moment of moments) {
    const similarity = dot(vector, moment.centroid)
    if (similarity >= JOIN_SIMILARITY && (!best || similarity > best.similarity)) {
      best = { moment, similarity }
    }
  }
  return best
}

/** Add a save to a moment: membership, savers, and the recent-saves log. */
export function joinMoment(moment: Moment, key: string, saver: string, at: number): void {
  const member = moment.members.get(key)
  if (member) {
    member.savers.add(saver)
    member.lastAt = Math.max(member.lastAt, at)
  } else {
    moment.members.set(key, { lastAt: at, savers: new Set([saver]) })
  }
  moment.recent.push(at)
  const cutoff = at - 2 * 3_600_000
  while (moment.recent.length && moment.recent[0] < cutoff) moment.recent.shift()
}

/**
 * Sort a save that fits no moment into the closest forming group, or start
 * one. Returns the group it landed in.
 */
export function addToForming(
  forming: Forming[],
  key: string,
  vector: Float32Array,
  saver: string,
  at: number,
  newId: () => string,
  hue: string,
  raw: Float32Array = vector,
): Forming {
  let best: Forming | null = null
  let bestSim = -Infinity
  for (const f of forming) {
    const s = dot(vector, f.centroid)
    if (s >= FORM_SIMILARITY && s > bestSim) {
      best = f
      bestSim = s
    }
  }
  if (!best) {
    best = {
      id: newId(),
      centroid: vector.slice(),
      raw: raw.slice(),
      members: new Map(),
      firstAt: at,
      lastAt: at,
      title: null,
      hue,
    }
    forming.push(best)
  }
  const member = best.members.get(key)
  if (member) member.savers.add(saver)
  else best.members.set(key, { lastAt: at, savers: new Set([saver]) })
  best.lastAt = at
  // Running centre: the new post pulls the group towards it.
  const n = best.members.size
  for (let i = 0; i < best.centroid.length; i++) {
    best.centroid[i] = (best.centroid[i] * (n - 1) + vector[i]) / n
    best.raw[i] = (best.raw[i] * (n - 1) + raw[i]) / n
  }
  normalize(best.centroid)
  normalize(best.raw)
  mergeClose(forming, best)
  return best
}

/**
 * Fold other forming groups into `into` when their centres are close enough:
 * a group started from one post can miss its siblings (two posts on one
 * topic may sit ~0.3 apart), and two halves of the same thing should fill
 * one card, not two.
 */
function mergeClose(forming: Forming[], into: Forming): void {
  for (let i = forming.length - 1; i >= 0; i--) {
    const other = forming[i]
    if (other === into || dot(other.centroid, into.centroid) < FORM_SIMILARITY) continue
    const a = into.members.size
    const b = other.members.size
    for (const [key, m] of other.members) {
      const mine = into.members.get(key)
      if (mine) for (const saver of m.savers) mine.savers.add(saver)
      else into.members.set(key, { lastAt: m.lastAt, savers: new Set(m.savers) })
    }
    for (let d = 0; d < into.centroid.length; d++) {
      into.centroid[d] = (into.centroid[d] * a + other.centroid[d] * b) / (a + b)
      into.raw[d] = (into.raw[d] * a + other.raw[d] * b) / (a + b)
    }
    normalize(into.centroid)
    normalize(into.raw)
    into.firstAt = Math.min(into.firstAt, other.firstAt)
    into.lastAt = Math.max(into.lastAt, other.lastAt)
    forming.splice(i, 1)
  }
}

/** How close a forming group is to being a moment. */
export function formingProgress(
  f: Forming,
  minSavers: number,
): { have: number; need: number; unit: 'people' | 'saves'; ready: boolean } {
  const people = peopleIn(f.members)
  if (minSavers > 1) {
    return {
      have: Math.min(people, minSavers),
      need: minSavers,
      unit: 'people',
      ready: people >= minSavers && f.members.size >= 2,
    }
  }
  return {
    have: Math.min(f.members.size, MIN_POSTS),
    need: MIN_POSTS,
    unit: 'saves',
    ready: f.members.size >= MIN_POSTS,
  }
}

/** Saves in each of the last `minutes` minutes, oldest first. */
export function minuteBars(recent: number[], now: number, minutes = 30): number[] {
  const bars = new Array<number>(minutes).fill(0)
  for (const at of recent) {
    const ago = Math.floor((now - at) / 60_000)
    if (ago >= 0 && ago < minutes) bars[minutes - 1 - ago]++
  }
  return bars
}

/** More saves in the last hour than the hour before. */
export function isRising(recent: number[], now: number): boolean {
  let last = 0
  let before = 0
  for (const at of recent) {
    if (now - at < 3_600_000) last++
    else if (now - at < 7_200_000) before++
  }
  return last >= 2 && last > before
}

/** A group's id and its post keys, before or after a change. */
export interface GroupKeys {
  id: string
  keys: string[]
}

/**
 * What became of forming groups that are gone after a change (a merge, a
 * regroup, a promotion), for "Tell me when it's live": each `before` id
 * missing from `after` moves to the forming group that now holds most of its
 * posts (`carry`), else is reported as formed into the moment that holds most
 * of them (`formed`), else dissolved (`dropped`). Ties go to the first.
 */
export function reconcileForming(
  before: GroupKeys[],
  after: GroupKeys[],
  moments: { slug: string; title: string; keys: string[] }[],
): {
  carry: { from: string; to: string }[]
  formed: { from: string; slug: string; title: string }[]
  dropped: string[]
} {
  const still = new Set(after.map((g) => g.id))
  const out = {
    carry: [] as { from: string; to: string }[],
    formed: [] as { from: string; slug: string; title: string }[],
    dropped: [] as string[],
  }
  const overlap = (keys: Set<string>, other: string[]) => other.filter((k) => keys.has(k)).length
  for (const old of before) {
    if (still.has(old.id)) continue
    const keys = new Set(old.keys)
    let bestGroup: GroupKeys | null = null
    let bestN = 0
    for (const g of after) {
      const n = overlap(keys, g.keys)
      if (n > bestN) {
        bestN = n
        bestGroup = g
      }
    }
    if (bestGroup) {
      out.carry.push({ from: old.id, to: bestGroup.id })
      continue
    }
    let bestMoment: (typeof moments)[number] | null = null
    for (const m of moments) {
      const n = overlap(keys, m.keys)
      if (n > bestN) {
        bestN = n
        bestMoment = m
      }
    }
    if (bestMoment)
      out.formed.push({ from: old.id, slug: bestMoment.slug, title: bestMoment.title })
    else out.dropped.push(old.id)
  }
  return out
}
