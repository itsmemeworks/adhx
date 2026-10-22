import { and, count, desc, eq, inArray } from 'drizzle-orm'
import { db, runInTransaction } from '@/lib/db'
import {
  autoChannels,
  bookmarkTags,
  bookmarks,
  postEmbeddings,
  type AutoChannel,
} from '@/lib/db/schema'
import { captureException } from '@/lib/sentry'
import { MAX_TAGS_PER_POST, sanitizeTag } from '@/lib/utils/tag'
import { setTagVisibility } from '@/lib/tags/visibility'
import { SEMANTIC_MODEL_VERSION } from '@/lib/semantic/config'
import { buildPostDocument, queryPrompt } from '@/lib/semantic/documents'
import { askJev, jevAvailable } from '@/lib/semantic/jev'
import { loadPostItem } from '@/lib/semantic/posts'
import { embedQueries } from '@/lib/semantic/supervisor'
import { fromBlob } from '@/lib/semantic/vectors'
import { groupSaves, seedFrom, type Cluster } from './cluster'
import { CHANNEL_NAMES } from './names'
import { visualChannels } from './visual'
import { FIRST_BUILD_WAIT_MS, within } from './wait'

/**
 * "Made for you" channels: one user's saves grouped by what they're about
 * and named from `CHANNEL_NAMES` (Jev picks among the closest few names,
 * looking at a handful of the group's posts). Private to the user. Keeping
 * one turns it into an ordinary tag channel (`keepAutoChannel`).
 */

const MAX_POSTS = 1500
const MIN_GROUP = 4
const MAX_CHANNELS = 8
const CANDIDATE_NAMES = 6
const SAMPLE_POSTS = 6
const NAMING_TIMEOUT_MS = 4_000
const STALE_MS = 12 * 60 * 60_000
const MAX_AGE_MS = 7 * 24 * 60 * 60_000
const RETRY_EMPTY_MS = 10 * 60_000
const CHANGED_SAVES = 5
const CHUNK = 400

export interface AutoChannelView {
  slug: string
  name: string
  size: number
  /** `platform:id`, most typical first. */
  keys: string[]
  /** Optional curated channel mosaic, independent of playback order. */
  coverKeys?: string[]
}

export interface AutoChannelDeps {
  embedNames?: (prompts: string[]) => Promise<Float32Array[]>
  chooseName?: (candidates: string[], samples: string[]) => Promise<string | null>
  now?: () => Date
  /** How long a first build may take before the page goes on without it. */
  firstWaitMs?: number
}

type State = {
  inFlight: Map<string, Promise<AutoChannelView[]>>
  lastEmpty: Map<string, number>
  names: { model: string; vectors: Float32Array[] } | null
}
const g = globalThis as unknown as { __adhxAutoChannels?: State }
const state: State = (g.__adhxAutoChannels ??= {
  inFlight: new Map(),
  lastEmpty: new Map(),
  names: null,
})

function toView(row: AutoChannel): AutoChannelView {
  return {
    slug: row.slug,
    name: row.name,
    size: row.size,
    keys: JSON.parse(row.postKeys) as string[],
  }
}

async function saveCount(userId: string): Promise<number> {
  const [row] = await db.select({ n: count() }).from(bookmarks).where(eq(bookmarks.userId, userId))
  return row?.n ?? 0
}

/** One vector per save: its words, picture and video averaged (whatever is understood). */
async function postVectors(userId: string): Promise<{ keys: string[]; vectors: Float32Array[] }> {
  const saved = await db
    .select({ platform: bookmarks.platform, id: bookmarks.id })
    .from(bookmarks)
    .where(eq(bookmarks.userId, userId))
    .orderBy(desc(bookmarks.processedAt))
    .limit(MAX_POSTS)
  return meanVectors(saved)
}

/**
 * One unit vector per post: its understood kinds (words, picture, video)
 * averaged. Posts with nothing understood yet are left out. Shared with
 * group channels (`group.ts`).
 */
export async function meanVectors(
  posts: { platform: string; id: string }[],
): Promise<{ keys: string[]; vectors: Float32Array[] }> {
  const wanted = new Set(posts.map((s) => `${s.platform}:${s.id}`))
  const sums = new Map<string, Float32Array>()
  const ids = [...new Set(posts.map((s) => s.id))]
  for (let i = 0; i < ids.length; i += CHUNK) {
    const rows = await db
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
    for (const r of rows) {
      const key = `${r.platform}:${r.postId}`
      const v = fromBlob(r.vector as Buffer | null)
      if (!v || !wanted.has(key)) continue
      const sum = sums.get(key)
      if (!sum) sums.set(key, v.slice())
      else for (let d = 0; d < sum.length; d++) sum[d] += v[d]
    }
  }
  const keys: string[] = []
  const vectors: Float32Array[] = []
  for (const [key, sum] of sums) {
    let n = 0
    for (let d = 0; d < sum.length; d++) n += sum[d] * sum[d]
    n = Math.sqrt(n) || 1
    for (let d = 0; d < sum.length; d++) sum[d] /= n
    keys.push(key)
    vectors.push(sum)
  }
  return { keys, vectors }
}

async function nameVectors(deps: AutoChannelDeps): Promise<Float32Array[]> {
  if (state.names?.model === SEMANTIC_MODEL_VERSION) return state.names.vectors
  const embed = deps.embedNames ?? embedQueries
  const vectors = await embed(CHANNEL_NAMES.map((n) => queryPrompt(n)))
  state.names = { model: SEMANTIC_MODEL_VERSION, vectors }
  return vectors
}

/** Ask Jev which candidate name fits the sample posts; null when it can't say. */
async function chooseWithJev(candidates: string[], samples: string[]): Promise<string | null> {
  if (!jevAvailable() || candidates.length < 2) return null
  const ids = candidates.map((_, i) => `n${i + 1}`)
  try {
    const answers = await askJev(
      { posts: samples },
      {
        name: {
          type: 'choice',
          instructions:
            'These posts were saved together. Which short channel name best describes what they have in common?',
          criteria: Object.fromEntries(candidates.map((c, i) => [ids[i], c])),
        },
      },
      NAMING_TIMEOUT_MS,
    )
    const pick = answers['name']?.choice
    const i = pick ? ids.indexOf(pick) : -1
    return i >= 0 ? candidates[i] : null
  } catch {
    return null
  }
}

function dot(a: Float32Array, b: Float32Array): number {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}

/**
 * The best few groups: big enough, tight groups first (a big loose
 * catch-all makes a poor channel).
 */
export function bestClusters(clusters: Cluster[], max = MAX_CHANNELS): Cluster[] {
  return clusters
    .filter((c) => c.members.length >= MIN_GROUP)
    .sort(
      (a, b) => Math.sqrt(b.members.length) * b.cohesion - Math.sqrt(a.members.length) * a.cohesion,
    )
    .slice(0, max)
}

/**
 * Name each group from `CHANNEL_NAMES`: the closest few names by meaning,
 * then Jev picks among them looking at a handful of the group's posts (or
 * the closest wins). No two groups get the same name. `reserved` slugs are
 * never used. Shared with group channels.
 */
export async function nameClusters(
  clusters: Cluster[],
  keys: string[],
  deps: AutoChannelDeps = {},
  reserved: ReadonlySet<string> = new Set(),
): Promise<AutoChannelView[]> {
  const views: AutoChannelView[] = []
  if (clusters.length === 0) return views
  const names = await nameVectors(deps)
  const choose = deps.chooseName ?? chooseWithJev
  const used = new Set<string>()
  for (const cluster of clusters) {
    const candidates = CHANNEL_NAMES.map((name, i) => ({
      name,
      s: dot(cluster.centroid, names[i]),
    }))
      .filter((c) => !used.has(c.name) && !reserved.has(sanitizeTag(c.name)))
      .sort((a, b) => b.s - a.s)
      .slice(0, CANDIDATE_NAMES)
      .map((c) => c.name)
    if (candidates.length === 0) continue
    const memberKeys = cluster.members.map((i) => keys[i])
    const samples: string[] = []
    for (const key of memberKeys.slice(0, SAMPLE_POSTS)) {
      const at = key.indexOf(':')
      const item = await loadPostItem(key.slice(0, at), key.slice(at + 1))
      if (item) samples.push(buildPostDocument(item).keywords.replace(/\s+/g, ' ').slice(0, 300))
    }
    const name = (await choose(candidates, samples)) ?? candidates[0]
    used.add(name)
    views.push({ slug: sanitizeTag(name), name, size: memberKeys.length, keys: memberKeys })
  }
  return views
}

/** Group, name and store this user's channels. Replaces any previous set. */
export async function computeAutoChannels(
  userId: string,
  deps: AutoChannelDeps = {},
): Promise<AutoChannelView[]> {
  const now = (deps.now ?? (() => new Date()))()
  const saves = await saveCount(userId)
  const { keys, vectors } = await postVectors(userId)
  const clusters = bestClusters(groupSaves(vectors, seedFrom(userId)))

  const views = await nameClusters(clusters, keys, deps)

  runInTransaction(() => {
    db.delete(autoChannels).where(eq(autoChannels.userId, userId)).run()
    views.forEach((v, position) =>
      db
        .insert(autoChannels)
        .values({
          userId,
          slug: v.slug,
          name: v.name,
          postKeys: JSON.stringify(v.keys),
          size: v.size,
          position,
          model: SEMANTIC_MODEL_VERSION,
          savesAtCompute: saves,
          computedAt: now.toISOString(),
        })
        .run(),
    )
  })
  if (views.length === 0) state.lastEmpty.set(userId, now.getTime())
  return visualChannels(views, userId)
}

function isStale(rows: AutoChannel[], saves: number, now: number): boolean {
  const [first] = rows
  if (!first || first.model !== SEMANTIC_MODEL_VERSION) return true
  const age = now - Date.parse(first.computedAt)
  if (age > MAX_AGE_MS) return true
  return age > STALE_MS && Math.abs(saves - first.savesAtCompute) >= CHANGED_SAVES
}

/**
 * This user's channels. Stale ones are served while they're rebuilt in the
 * background; missing ones are built first, waiting up to
 * `FIRST_BUILD_WAIT_MS`. A user with too few understood saves gets []
 * (retried every few minutes, not on every request). One computation per
 * user at a time.
 */
export async function getAutoChannels(
  userId: string,
  deps: AutoChannelDeps = {},
): Promise<AutoChannelView[]> {
  const now = (deps.now ?? (() => new Date()))().getTime()
  const rows = await db
    .select()
    .from(autoChannels)
    .where(eq(autoChannels.userId, userId))
    .orderBy(autoChannels.position)
  if (rows.length === 0 && now - (state.lastEmpty.get(userId) ?? 0) < RETRY_EMPTY_MS) return []
  const stored = visualChannels(rows.map(toView), userId)
  if (!isStale(rows, await saveCount(userId), now)) return stored
  let pending = state.inFlight.get(userId)
  if (!pending) {
    pending = computeAutoChannels(userId, deps)
      .catch((error) => {
        captureException(error, { endpoint: 'channels.auto' })
        return stored
      })
      .finally(() => state.inFlight.delete(userId))
    state.inFlight.set(userId, pending)
  }
  // Serve what's stored while it's rebuilt (naming can take a while); the
  // next request gets the new set. With none, wait, but not for ever.
  if (rows.length > 0) return stored
  return within(pending, deps.firstWaitMs ?? FIRST_BUILD_WAIT_MS, [])
}

/** The rebuild under way for this user, if any (tests wait on it). */
export function autoChannelsBuilding(userId: string): Promise<AutoChannelView[]> | undefined {
  return state.inFlight.get(userId)
}

export async function getAutoChannel(
  userId: string,
  slug: string,
): Promise<AutoChannelView | null> {
  const rows = await db.select().from(autoChannels).where(eq(autoChannels.userId, userId))
  return visualChannels(rows.map(toView), userId).find((row) => row.slug === slug) ?? null
}

/**
 * Keep a "Made for you" channel as a real channel: tag its posts with its
 * name (skipping posts that already have the most tags allowed) and, by
 * default, make it public. Returns how many posts were added and the link.
 */
export async function keepAutoChannel(
  userId: string,
  slug: string,
  isPublic: boolean,
): Promise<{ tag: string; added: number; shareUrl: string | null } | null> {
  const channel = await getAutoChannel(userId, slug)
  if (!channel) return null
  const tag = channel.slug
  const ids = channel.keys.map((k) => k.slice(k.indexOf(':') + 1))
  const existing = ids.length
    ? await db
        .select({
          platform: bookmarkTags.platform,
          id: bookmarkTags.bookmarkId,
          tag: bookmarkTags.tag,
        })
        .from(bookmarkTags)
        .where(and(eq(bookmarkTags.userId, userId), inArray(bookmarkTags.bookmarkId, ids)))
    : []
  const tagsByKey = new Map<string, Set<string>>()
  for (const r of existing) {
    const key = `${r.platform}:${r.id}`
    tagsByKey.set(key, (tagsByKey.get(key) ?? new Set()).add(r.tag))
  }
  const owned = ids.length
    ? await db
        .select({ platform: bookmarks.platform, id: bookmarks.id })
        .from(bookmarks)
        .where(and(eq(bookmarks.userId, userId), inArray(bookmarks.id, ids)))
    : []
  const ownedKeys = new Set(owned.map((o) => `${o.platform}:${o.id}`))
  let added = 0
  const createdAt = new Date().toISOString()
  runInTransaction(() => {
    for (const key of channel.keys) {
      const tags = tagsByKey.get(key) ?? new Set<string>()
      if (!ownedKeys.has(key) || tags.has(tag) || tags.size >= MAX_TAGS_PER_POST) continue
      const at = key.indexOf(':')
      db.insert(bookmarkTags)
        .values({
          userId,
          platform: key.slice(0, at),
          bookmarkId: key.slice(at + 1),
          tag,
          createdAt,
        })
        .onConflictDoNothing()
        .run()
      added++
    }
  })
  const share = isPublic ? await setTagVisibility(userId, tag, true) : null
  return { tag, added, shareUrl: share?.shareUrl ?? null }
}
