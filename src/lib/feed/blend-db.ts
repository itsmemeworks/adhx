import { randomBytes } from 'node:crypto'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  autoChannels,
  bookmarkMedia,
  bookmarks,
  postEmbeddings,
  userPreferences,
  users,
} from '@/lib/db/schema'
import { readModeratedPostKeys } from '@/lib/admin/moderation'
import { keysToHits } from '@/lib/channels/channels'
import type { FeedItemResponse } from '@/lib/feed/build-item'
import { seenBy, visibleSave, withSavers } from '@/lib/people/savers'
import { SEMANTIC_MODEL_VERSION } from '@/lib/semantic/config'
import { goneKeys } from '@/lib/semantic/gone'
import { loadSearchItems } from '@/lib/semantic/items'
import { fromBlob } from '@/lib/semantic/vectors'
import {
  FEED_KINDS,
  FEED_WEIGHTS_KEY,
  blend,
  waitingKinds,
  decodeCursor,
  encodeCursor,
  parseWeights,
  type BlendCandidate,
  type BlendMode,
  type BlendPick,
  type BlendSave,
  type FeedKind,
  type FeedWeight,
  type WhyReason,
} from './blend'
import { seenKeys } from './views'
import { postKinds, readFeedTypes } from './kinds'

/**
 * The blended feed's database side (`GET /api/feed/blend`, `/api/app/feed`):
 * candidates from everyone's visible saves (`seenBy`: never someone else's
 * private, quoted or banned save), minus moderated and gone posts; the
 * viewer's seen list; how close they are to each friend; and their taste
 * vector. The pure `blend()` orders them.
 *
 * Pages come from a snapshot computed on the first page and kept per user
 * for a few minutes under a seed carried in the opaque cursor, so paging
 * never reshuffles. `userId`s stay on the server.
 */

/** Recent saves the feed looks at. */
export const WINDOW_DAYS = 14
/** Outside New, a quiet server reaches further back for at least this many posts. */
const MIN_POSTS = 60
const FALLBACK_POSTS = 300
const MAX_POSTS = 1500
const MAX_MINE = 500
/** The viewer's taste: the mean of their last saves' vectors. */
const TASTE_SAVES = 50
/** "Close to you" looks this far back. */
const CLOSE_DAYS = 180
/** Smoothing: one seen post out of one is not "most of her saves". */
const CLOSE_PRIOR = 4
const SNAPSHOT_MS = 5 * 60_000
const MAX_SNAPSHOTS = 500
const CHUNK = 400
const DAY = 86_400_000

export type BlendItem = FeedItemResponse & { why: string; whyReasons: WhyReason[] }

export interface BlendPage {
  items: BlendItem[]
  nextCursor: string | null
  /** New has nothing left you haven't seen. */
  caughtUp: boolean
  /** Nobody has saved anything new in New's window: say so instead of "caught up". */
  nothingYet: boolean
  /** Posts in this snapshot (New: how many you haven't seen). */
  total: number
  /** The kinds this page is filtered to ("What's in your feed"). */
  types: FeedKind[]
  /** New only: unseen posts the filter leaves out, by kind ("4 text posts waiting"). */
  waiting: Partial<Record<FeedKind, number>>
}

type Snapshot = {
  picks: BlendPick[]
  nothingYet: boolean
  waiting: Partial<Record<FeedKind, number>>
  at: number
}
const g = globalThis as unknown as { __adhxBlend?: Map<string, Snapshot> }
const snapshots: Map<string, Snapshot> = (g.__adhxBlend ??= new Map())

/** Tests: forget every snapshot. */
export function __resetBlendSnapshots(): void {
  snapshots.clear()
}

/** SQLite `YYYY-MM-DD HH:MM:SS` (UTC) or ISO → epoch ms. */
export function parseSavedAt(value: string | null | undefined): number {
  if (!value) return 0
  const iso = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? ms : 0
}

function split(key: string): { platform: string; id: string } {
  const at = key.indexOf(':')
  return { platform: key.slice(0, at), id: key.slice(at + 1) }
}

// ——— Candidates ———

type KeyRow = { platform: string; id: string }

/** Which posts the mode looks at, newest save first. */
function candidateKeys(viewerId: string, mode: BlendMode, now: number): string[] {
  if (mode === 'mine') {
    const rows = db.all<KeyRow>(sql`
      SELECT b.platform, b.id FROM bookmarks b
      WHERE b.user_id = ${viewerId} AND COALESCE(b.source, '') != 'quoted'
        AND NOT EXISTS (SELECT 1 FROM archived_posts a
          WHERE a.user_id = b.user_id AND a.platform = b.platform AND a.bookmark_id = b.id)
      ORDER BY b.processed_at DESC LIMIT ${MAX_MINE}
    `)
    return rows.map((r) => `${r.platform}:${r.id}`)
  }
  const since = new Date(now - WINDOW_DAYS * DAY).toISOString()
  const recent = db.all<KeyRow>(sql`
    SELECT b.platform, b.id FROM bookmarks b
    WHERE ${seenBy(viewerId, 'b')} AND b.processed_at >= ${since}
    GROUP BY b.platform, b.id
    ORDER BY MAX(b.processed_at) DESC LIMIT ${MAX_POSTS}
  `)
  if (mode === 'new' || recent.length >= MIN_POSTS)
    return recent.map((r) => `${r.platform}:${r.id}`)
  const older = db.all<KeyRow>(sql`
    SELECT b.platform, b.id FROM bookmarks b
    WHERE ${seenBy(viewerId, 'b')}
    GROUP BY b.platform, b.id
    ORDER BY MAX(b.processed_at) DESC LIMIT ${FALLBACK_POSTS}
  `)
  return older.map((r) => `${r.platform}:${r.id}`)
}

/** Every save of these posts the viewer may see, by member. */
function savesFor(keys: string[], viewerId: string): Map<string, BlendSave[]> {
  const wanted = new Set(keys)
  const out = new Map<string, BlendSave[]>()
  const ids = [...new Set(keys.map((k) => split(k).id))]
  for (let i = 0; i < ids.length; i += CHUNK) {
    const rows = db
      .select({
        platform: bookmarks.platform,
        id: bookmarks.id,
        userId: bookmarks.userId,
        savedAt: bookmarks.processedAt,
        username: users.username,
        name: users.displayName,
      })
      .from(bookmarks)
      .innerJoin(users, eq(users.id, bookmarks.userId))
      .where(and(inArray(bookmarks.id, ids.slice(i, i + CHUNK)), seenBy(viewerId)))
      .all()
    for (const r of rows) {
      const key = `${r.platform}:${r.id}`
      if (!wanted.has(key)) continue
      const list = out.get(key) ?? []
      list.push({
        userId: r.userId,
        username: r.username,
        name: r.name ?? null,
        savedAt: parseSavedAt(r.savedAt),
      })
      out.set(key, list)
    }
  }
  return out
}

/**
 * Friend → how much of their visible saves (last 180 days) the viewer has
 * seen or saved too, smoothed: hits / (saves + 4).
 */
export function closenessFor(viewerId: string, now: number): Map<string, number> {
  const since = new Date(now - CLOSE_DAYS * DAY).toISOString()
  const rows = db.all<{ user_id: string; total: number; hits: number | null }>(sql`
    SELECT b.user_id, COUNT(*) AS total,
      SUM(CASE WHEN EXISTS (
            SELECT 1 FROM post_views v
            WHERE v.user_id = ${viewerId} AND v.platform = b.platform AND v.post_id = b.id)
          OR EXISTS (
            SELECT 1 FROM bookmarks m
            WHERE m.user_id = ${viewerId} AND m.platform = b.platform AND m.id = b.id)
        THEN 1 ELSE 0 END) AS hits
    FROM bookmarks b
    WHERE ${visibleSave('b')} AND b.user_id != ${viewerId} AND b.processed_at >= ${since}
    GROUP BY b.user_id
  `)
  const out = new Map<string, number>()
  for (const r of rows) {
    const total = Number(r.total) || 0
    const hits = Number(r.hits) || 0
    if (total > 0) out.set(r.user_id, hits / (total + CLOSE_PRIOR))
  }
  return out
}

// ——— Taste: "like what you keep" ———

/** One unit vector per post: its words, picture and video averaged (as Made for you does). */
function postVectors(keys: string[]): Map<string, Float32Array> {
  const wanted = new Set(keys)
  const sums = new Map<string, Float32Array>()
  const ids = [...new Set(keys.map((k) => split(k).id))]
  for (let i = 0; i < ids.length; i += CHUNK) {
    const rows = db
      .select({
        platform: postEmbeddings.platform,
        postId: postEmbeddings.postId,
        vector: postEmbeddings.vector,
      })
      .from(postEmbeddings)
      .where(
        and(
          eq(postEmbeddings.model, SEMANTIC_MODEL_VERSION),
          eq(postEmbeddings.status, 'ok'),
          inArray(postEmbeddings.postId, ids.slice(i, i + CHUNK)),
        ),
      )
      .all()
    for (const r of rows) {
      const key = `${r.platform}:${r.postId}`
      const v = fromBlob(r.vector as Buffer | null)
      if (!v || !wanted.has(key)) continue
      const sum = sums.get(key)
      if (!sum) sums.set(key, v.slice())
      else if (sum.length === v.length) for (let d = 0; d < sum.length; d++) sum[d] += v[d]
    }
  }
  for (const sum of sums.values()) normalize(sum)
  return sums
}

function normalize(v: Float32Array): Float32Array {
  let n = 0
  for (let d = 0; d < v.length; d++) n += v[d] * v[d]
  n = Math.sqrt(n) || 1
  for (let d = 0; d < v.length; d++) v[d] /= n
  return v
}

function dot(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0
  let s = 0
  for (let d = 0; d < a.length; d++) s += a[d] * b[d]
  return s
}

const KIND_NOUN = { video: 'video', photo: 'photo', post: 'post' } as const

/** Words for a kept post: its Made for you channel ("the frog videos"), else "@ana’s video". */
function keptLabels(
  viewerId: string,
  keys: string[],
): Map<string, { label: string; topic: string | null }> {
  const out = new Map<string, { label: string; topic: string | null }>()
  if (keys.length === 0) return out
  const wanted = new Set(keys)
  for (const row of db
    .select({ slug: autoChannels.slug, name: autoChannels.name, postKeys: autoChannels.postKeys })
    .from(autoChannels)
    .where(eq(autoChannels.userId, viewerId))
    .all()) {
    let channelKeys: string[] = []
    try {
      channelKeys = JSON.parse(row.postKeys) as string[]
    } catch {
      continue
    }
    const name = /^[A-Z][a-z]/.test(row.name)
      ? row.name[0].toLowerCase() + row.name.slice(1)
      : row.name
    for (const k of channelKeys) {
      if (wanted.has(k) && !out.has(k)) out.set(k, { label: `the ${name}`, topic: row.slug })
    }
  }
  const rest = keys.filter((k) => !out.has(k))
  if (rest.length === 0) return out
  const ids = [...new Set(rest.map((k) => split(k).id))]
  const [posts, media] = [
    db
      .select({ platform: bookmarks.platform, id: bookmarks.id, author: bookmarks.author })
      .from(bookmarks)
      .where(and(eq(bookmarks.userId, viewerId), inArray(bookmarks.id, ids)))
      .all(),
    db
      .select({
        platform: bookmarkMedia.platform,
        id: bookmarkMedia.bookmarkId,
        type: bookmarkMedia.mediaType,
      })
      .from(bookmarkMedia)
      .where(and(eq(bookmarkMedia.userId, viewerId), inArray(bookmarkMedia.bookmarkId, ids)))
      .all(),
  ]
  const kinds = new Map<string, keyof typeof KIND_NOUN>()
  for (const m of media) {
    const key = `${m.platform}:${m.id}`
    if (m.type === 'video' || m.type === 'animated_gif') kinds.set(key, 'video')
    else if (!kinds.has(key)) kinds.set(key, 'photo')
  }
  for (const p of posts) {
    const key = `${p.platform}:${p.id}`
    if (!wanted.has(key) || out.has(key) || !p.author) continue
    out.set(key, { label: `@${p.author}’s ${KIND_NOUN[kinds.get(key) ?? 'post']}`, topic: null })
  }
  return out
}

/**
 * Each candidate's cosine to the mean of the viewer's last saves, and the
 * kept post it's closest to. Posts not understood yet get null.
 */
function tasteFor(
  viewerId: string,
  keys: string[],
): { similarity: Map<string, number>; like: Map<string, { label: string; topic: string | null }> } {
  const similarity = new Map<string, number>()
  const like = new Map<string, { label: string; topic: string | null }>()
  const kept = db
    .select({ platform: bookmarks.platform, id: bookmarks.id })
    .from(bookmarks)
    .where(and(eq(bookmarks.userId, viewerId), sql`COALESCE(${bookmarks.source}, '') != 'quoted'`))
    .orderBy(desc(bookmarks.processedAt))
    .limit(TASTE_SAVES)
    .all()
    .map((r) => `${r.platform}:${r.id}`)
  if (kept.length === 0 || keys.length === 0) return { similarity, like }
  const vectors = postVectors([...new Set([...kept, ...keys])])
  const keptVectors = kept.flatMap((k) => {
    const v = vectors.get(k)
    return v ? [{ key: k, v }] : []
  })
  if (keptVectors.length === 0) return { similarity, like }
  const taste = new Float32Array(keptVectors[0].v.length)
  for (const { v } of keptVectors) {
    if (v.length === taste.length) for (let d = 0; d < taste.length; d++) taste[d] += v[d]
  }
  normalize(taste)
  const nearest = new Map<string, string>()
  for (const key of keys) {
    const v = vectors.get(key)
    if (!v) continue
    similarity.set(key, dot(v, taste))
    let best = -2
    for (const k of keptVectors) {
      if (k.key === key) continue
      const s = dot(v, k.v)
      if (s > best) {
        best = s
        nearest.set(key, k.key)
      }
    }
  }
  const labels = keptLabels(viewerId, [...new Set(nearest.values())])
  for (const [key, keptKey] of nearest) {
    const label = labels.get(keptKey)
    if (label) like.set(key, label)
  }
  return { similarity, like }
}

// ——— Preferences ———

export function readFeedWeights(userId: string): Record<string, FeedWeight> {
  const [row] = db
    .select({ value: userPreferences.value })
    .from(userPreferences)
    .where(and(eq(userPreferences.userId, userId), eq(userPreferences.key, FEED_WEIGHTS_KEY)))
    .all()
  return parseWeights(row?.value)
}

/** Set "show more" (1), "show less" (-1) or back to normal (0) for one member. */
export function writeFeedWeight(
  userId: string,
  username: string,
  weight: FeedWeight,
): Record<string, FeedWeight> {
  const weights = readFeedWeights(userId)
  if (weight === 0) delete weights[username]
  else weights[username] = weight
  const value = JSON.stringify(weights)
  const updatedAt = new Date().toISOString()
  db.insert(userPreferences)
    .values({ userId, key: FEED_WEIGHTS_KEY, value, updatedAt })
    .onConflictDoUpdate({
      target: [userPreferences.userId, userPreferences.key],
      set: { value, updatedAt },
    })
    .run()
  // The next first page starts a new snapshot; drop this user's old ones now.
  for (const key of snapshots.keys()) if (key.startsWith(`${userId}|`)) snapshots.delete(key)
  return weights
}

// ——— Snapshots and pages ———

/** Everything the blend needs for one viewer and mode, then the blend itself. */
export async function computeBlend(
  viewerId: string,
  mode: BlendMode,
  opts: { now?: number; seed?: string; types?: readonly FeedKind[] } = {},
): Promise<{
  picks: BlendPick[]
  nothingYet: boolean
  waiting: Partial<Record<FeedKind, number>>
}> {
  const types = opts.types ?? FEED_KINDS
  const now = opts.now ?? Date.now()
  const moderated = readModeratedPostKeys()
  if (!moderated.ok) throw moderated.error
  let keys = candidateKeys(viewerId, mode, now).filter((k) => !moderated.value.has(k))
  const gone = await goneKeys(keys)
  if (gone.size) keys = keys.filter((k) => !gone.has(k))
  const saves = savesFor(keys, viewerId)
  const seen = seenKeys(viewerId, keys)
  const kinds = await postKinds(keys)
  const { similarity, like } = tasteFor(viewerId, keys)
  const all: (BlendCandidate & { kind: FeedKind })[] = keys.flatMap((key) => {
    const list = saves.get(key)
    if (!list?.length) return []
    return [
      {
        key,
        saves: list,
        similarity: similarity.get(key) ?? null,
        like: like.get(key) ?? null,
        seen: seen.has(key),
        kind: kinds.get(key) ?? 'text',
      },
    ]
  })
  // "What's in your feed": the blend, caught up and why all work inside it.
  const candidates = all.filter((c) => types.includes(c.kind))
  const ctx = {
    viewerId,
    now,
    closeness: closenessFor(viewerId, now),
    weights: readFeedWeights(viewerId),
    seed: opts.seed,
  }
  const picks = blend(candidates, ctx, mode)
  const waiting =
    mode === 'new'
      ? waitingKinds(
          all.filter((c) => !types.includes(c.kind)),
          ctx,
        )
      : {}
  // New with nothing at all from your people (not just nothing unseen), of any kind.
  const nothingYet = mode === 'new' && !all.some((c) => c.saves.some((s) => s.userId !== viewerId))
  return { picks, nothingYet, waiting }
}

function newSeed(): string {
  return randomBytes(6).toString('hex')
}

function remember(key: string, snapshot: Snapshot): void {
  snapshots.delete(key)
  snapshots.set(key, snapshot)
  while (snapshots.size > MAX_SNAPSHOTS) snapshots.delete(snapshots.keys().next().value!)
}

export class BadCursorError extends Error {
  constructor() {
    super('bad cursor')
    this.name = 'BadCursorError'
  }
}

/**
 * One page of the blend. Without a cursor it starts a new snapshot (a new
 * seed); with one it reads that snapshot. When the snapshot has expired it's
 * computed again from the same seed — New then starts over from what's still
 * unseen (the theater drops posts it already has).
 */
export async function blendPage(
  viewerId: string,
  mode: BlendMode,
  opts: { limit: number; cursor?: string | null; now?: number; types?: FeedKind[] | null },
): Promise<BlendPage> {
  const now = opts.now ?? Date.now()
  // Omitted: the person's stored choice, else videos and photos.
  const types = opts.types ?? readFeedTypes(viewerId)
  let seed: string
  let offset = 0
  if (opts.cursor) {
    const cursor = decodeCursor(opts.cursor)
    if (!cursor) throw new BadCursorError()
    seed = cursor.s
    offset = cursor.o
  } else {
    seed = newSeed()
  }
  const cacheKey = `${viewerId}|${mode}|${types.join(',')}|${seed}`
  let snapshot = snapshots.get(cacheKey)
  if (snapshot && now - snapshot.at > SNAPSHOT_MS) snapshot = undefined
  if (!snapshot) {
    const { picks, nothingYet, waiting } = await computeBlend(viewerId, mode, {
      now,
      seed,
      types,
    })
    snapshot = { picks, nothingYet, waiting, at: now }
    remember(cacheKey, snapshot)
    if (opts.cursor && mode === 'new') offset = 0
  }

  const slice = snapshot.picks.slice(offset, offset + opts.limit)
  const end = offset + slice.length
  const nextCursor = end < snapshot.picks.length ? encodeCursor({ s: seed, o: end }) : null
  const byKey = new Map(slice.map((p) => [p.key, p]))
  const loaded = await loadSearchItems(keysToHits(slice.map((p) => p.key)), viewerId, {
    savers: false,
  })
  const posts = withSavers(
    loaded.map((i) => i.post),
    viewerId,
  )
  const items: BlendItem[] = posts.flatMap((post) => {
    const pick = byKey.get(`${post.platform ?? 'twitter'}:${post.id}`)
    return pick ? [{ ...post, why: pick.why, whyReasons: pick.reasons }] : []
  })
  return {
    items,
    nextCursor,
    caughtUp: mode === 'new' && nextCursor === null,
    nothingYet: snapshot.nothingYet,
    total: snapshot.picks.length,
    types,
    waiting: snapshot.waiting,
  }
}
