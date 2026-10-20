import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { ALL_PLATFORMS, networkLabel } from '@/lib/platform/networks'
import { keepReason } from '@/lib/processing/doing'
import { inspectPost, type InspectedPost } from '@/lib/admin/query'
import type { AnalyticsWindow } from '@/lib/analytics/query'
import {
  num,
  postCards,
  rangeSince,
  sharedSavers,
  splitKey,
  type AdminRange,
  type Face,
  type PostCard,
} from '../shared'
import { keptTotals } from './overview'

/**
 * Admin → Posts (board 10.3). Kinds and counts include Just for me saves;
 * "Needs attention" lists only posts with a shared save and counts the rest.
 */

export type PostKind = 'video' | 'photo' | 'text' | 'article'

/** Each network's colour on the admin bars (its brand colour, readable on dark). */
export const NETWORK_COLOURS: Record<string, string> = {
  youtube: '#ff3b30',
  twitter: '#f4f1ea',
  instagram: '#e1306c',
  tiktok: '#25f4ee',
  reddit: '#ff4500',
  pinterest: '#e60023',
  vimeo: '#1ab7ea',
  soundcloud: '#ff5500',
  facebook: '#1877f2',
  bluesky: '#1185fe',
  threads: '#c9bfab',
  twitch: '#9146ff',
  imgur: '#1bb76e',
  linkedin: '#0a66c2',
}

export interface AttentionRow {
  post: PostCard
  why: string
  /** `needs_you` (gave up), `failed` (will retry), `converting`. */
  state: 'needs_you' | 'failed' | 'converting'
}

export interface PostsBoard {
  range: AdminRange
  posts: number
  saves: number
  multiSaved: number
  kept: number
  keptPct: number | null
  onTheirWay: { total: number; keeping: number; converting: number }
  needYou: { total: number; first: string | null }
  gone: number
  storage: { bytes: number; videoBytes: number; photoBytes: number; otherBytes: number }
  networks: { platform: string; label: string; colour: string; posts: number }[]
  kinds: Record<PostKind, number>
  understood: { id: string; label: string; done: number; total: number }[]
  attention: AttentionRow[]
  /** Posts needing attention that only have Just for me saves: counted, never listed. */
  attentionPrivate: number
  attentionTotal: number
}

/** Every saved post (not a quoted copy) with its kind and when it was first saved. */
const POSTS_CTE = sql`
  p AS (
    SELECT platform, id, MIN(processed_at) AS first_at, COUNT(*) AS saves,
           MAX(CASE WHEN category = 'article' THEN 1 ELSE 0 END) AS is_article
    FROM bookmarks WHERE COALESCE(source, '') != 'quoted'
    GROUP BY platform, id
  ),
  k AS (
    SELECT p.*,
      CASE
        WHEN p.is_article = 1 OR EXISTS (SELECT 1 FROM bookmark_links l
          WHERE l.platform = p.platform AND l.bookmark_id = p.id AND l.expanded_url LIKE '%/article/%')
          THEN 'article'
        WHEN EXISTS (SELECT 1 FROM bookmark_media m
          WHERE m.platform = p.platform AND m.bookmark_id = p.id AND m.media_type IN ('video', 'animated_gif'))
          OR EXISTS (SELECT 1 FROM kept_files f
          WHERE f.platform = p.platform AND f.post_id = p.id AND (f.slot LIKE 'video-%' OR f.slot LIKE 'audio-%'))
          THEN 'video'
        WHEN EXISTS (SELECT 1 FROM bookmark_media m WHERE m.platform = p.platform AND m.bookmark_id = p.id)
          OR EXISTS (SELECT 1 FROM kept_files f
          WHERE f.platform = p.platform AND f.post_id = p.id AND f.slot LIKE 'photo-%')
          THEN 'photo'
        ELSE 'text'
      END AS kind
    FROM p
  )`

export function postsBoard(range: AdminRange, now = Date.now()): PostsBoard {
  const since = rangeSince(range, now)
  const inRange = since ? sql`k.first_at >= ${since}` : sql`1 = 1`

  const rows = db.all<{
    platform: string
    kind: PostKind
    posts: number
    saves: number
    multi: number
    kept: number
  }>(sql`
    WITH ${POSTS_CTE}
    SELECT k.platform, k.kind, COUNT(*) AS posts, SUM(k.saves) AS saves,
      SUM(CASE WHEN k.saves >= 2 THEN 1 ELSE 0 END) AS multi,
      SUM(CASE WHEN EXISTS (SELECT 1 FROM kept_files f
        WHERE f.platform = k.platform AND f.post_id = k.id) THEN 1 ELSE 0 END) AS kept
    FROM k WHERE ${inRange}
    GROUP BY k.platform, k.kind`)

  const byNetwork = new Map<string, number>()
  const kinds: Record<PostKind, number> = { video: 0, photo: 0, text: 0, article: 0 }
  let posts = 0
  let saves = 0
  let multiSaved = 0
  let kept = 0
  for (const r of rows) {
    posts += num(r.posts)
    saves += num(r.saves)
    multiSaved += num(r.multi)
    kept += num(r.kept)
    byNetwork.set(r.platform, (byNetwork.get(r.platform) ?? 0) + num(r.posts))
    kinds[r.kind] = (kinds[r.kind] ?? 0) + num(r.posts)
  }
  const networks = ALL_PLATFORMS.map((platform) => ({
    platform,
    label: networkLabel(platform),
    colour: NETWORK_COLOURS[platform] ?? '#c9bfab',
    posts: byNetwork.get(platform) ?? 0,
  })).sort((a, b) => b.posts - a.posts)

  const jobs = db.all<{ status: string; n: number }>(sql`
    SELECT status, COUNT(*) AS n FROM keep_jobs GROUP BY status`)
  const jobCount = (s: string) => num(jobs.find((j) => j.status === s)?.n)
  const conversions = num(
    db.all<{ n: number }>(sql`
      SELECT COUNT(DISTINCT platform || ':' || post_id) AS n FROM media_conversions
      WHERE status IN ('pending', 'running')`)[0]?.n,
  )
  const keeping = jobCount('pending') + jobCount('running')
  const converting = Math.max(jobCount('converting'), conversions)

  const needRows = db.all<{ platform: string; post_id: string; last_error: string | null }>(sql`
    SELECT platform, post_id, last_error FROM keep_jobs
    WHERE status = 'unavailable' AND accepted_at IS NULL
    ORDER BY updated_at DESC`)

  const gone = num(
    db.all<{ n: number }>(sql`
      SELECT COUNT(DISTINCT platform || ':' || post_id) AS n FROM post_embeddings
      WHERE status = 'none' AND error IS NOT NULL`)[0]?.n,
  )

  const storageRows = db.all<{ kind: string; bytes: number }>(sql`
    SELECT CASE WHEN slot LIKE 'video-%' THEN 'video' WHEN slot LIKE 'photo-%' THEN 'photo'
                ELSE 'other' END AS kind, COALESCE(SUM(bytes), 0) AS bytes
    FROM kept_files GROUP BY kind`)
  const bytesOf = (k: string) => num(storageRows.find((r) => r.kind === k)?.bytes)

  // Understood, for search: share of the posts that each kind applies to.
  const [u] = db.all<Record<string, number>>(sql`
    WITH ${POSTS_CTE}
    SELECT COUNT(*) AS posts,
      SUM(CASE WHEN kind IN ('video', 'photo') THEN 1 ELSE 0 END) AS visual,
      SUM(CASE WHEN kind = 'video' THEN 1 ELSE 0 END) AS videos,
      SUM(CASE WHEN EXISTS (SELECT 1 FROM post_embeddings e WHERE e.platform = k.platform
        AND e.post_id = k.id AND e.kind = 'text') THEN 1 ELSE 0 END) AS words,
      SUM(CASE WHEN kind IN ('video', 'photo') AND EXISTS (SELECT 1 FROM post_embeddings e
        WHERE e.platform = k.platform AND e.post_id = k.id AND e.kind = 'image') THEN 1 ELSE 0 END) AS pictures,
      SUM(CASE WHEN kind = 'video' AND EXISTS (SELECT 1 FROM post_embeddings e
        WHERE e.platform = k.platform AND e.post_id = k.id AND e.kind = 'video') THEN 1 ELSE 0 END) AS frames,
      SUM(CASE WHEN kind = 'video' AND EXISTS (SELECT 1 FROM post_extracted_text x
        WHERE x.platform = k.platform AND x.post_id = k.id AND x.kind = 'speech') THEN 1 ELSE 0 END) AS speech,
      SUM(CASE WHEN kind IN ('video', 'photo') AND EXISTS (SELECT 1 FROM post_extracted_text x
        WHERE x.platform = k.platform AND x.post_id = k.id AND x.kind = 'screen') THEN 1 ELSE 0 END) AS screen
    FROM k`)
  const understood = [
    { id: 'words', label: 'Words', done: num(u?.words), total: num(u?.posts) },
    { id: 'pictures', label: 'Pictures', done: num(u?.pictures), total: num(u?.visual) },
    { id: 'frames', label: 'Video frames', done: num(u?.frames), total: num(u?.videos) },
    { id: 'speech', label: 'Speech', done: num(u?.speech), total: num(u?.videos) },
    { id: 'screen', label: 'On screen', done: num(u?.screen), total: num(u?.visual) },
  ]

  const { attention, privateCount, total } = attentionRows(needRows)
  const firstNeed = needRows[0]

  return {
    range,
    posts,
    saves,
    multiSaved,
    kept,
    keptPct: posts ? Math.round((kept / posts) * 100) : null,
    onTheirWay: { total: keeping + converting, keeping, converting },
    needYou: {
      total: needRows.length,
      first: firstNeed ? keepReason(firstNeed.last_error, firstNeed.platform) : null,
    },
    gone,
    storage: {
      bytes: keptTotals().bytes,
      videoBytes: bytesOf('video'),
      photoBytes: bytesOf('photo'),
      otherBytes: bytesOf('other'),
    },
    networks,
    kinds,
    understood,
    attention,
    attentionPrivate: privateCount,
    attentionTotal: total,
  }
}

/** Posts that need an admin: gave up, failing, or converting. Listed only with a shared save. */
function attentionRows(
  needRows: { platform: string; post_id: string; last_error: string | null }[],
): { attention: AttentionRow[]; privateCount: number; total: number } {
  const failed = db.all<{
    platform: string
    post_id: string
    last_error: string | null
    attempts: number
  }>(sql`
    SELECT platform, post_id, last_error, attempts FROM keep_jobs WHERE status = 'failed'
    ORDER BY updated_at DESC`)
  const converting = db.all<{ platform: string; post_id: string }>(sql`
    SELECT DISTINCT platform, post_id FROM media_conversions WHERE status IN ('pending', 'running')
    UNION
    SELECT platform, post_id FROM keep_jobs WHERE status = 'converting'`)
  const all: { key: string; why: string; state: AttentionRow['state'] }[] = [
    ...needRows.map((r) => ({
      key: `${r.platform}:${r.post_id}`,
      why: keepReason(r.last_error, r.platform),
      state: 'needs_you' as const,
    })),
    ...failed.map((r) => ({
      key: `${r.platform}:${r.post_id}`,
      why: `Download failed ${r.attempts === 1 ? 'once' : `${r.attempts} times`}`,
      state: 'failed' as const,
    })),
    ...converting.map((r) => ({
      key: `${r.platform}:${r.post_id}`,
      why: 'Converting',
      state: 'converting' as const,
    })),
  ]
  const unique = all.filter((a, i) => all.findIndex((b) => b.key === a.key) === i)
  const cards = postCards(unique.map((a) => a.key))
  const attention: AttentionRow[] = []
  let privateCount = 0
  for (const a of unique) {
    const card = cards.get(a.key)
    if (!card) {
      privateCount++
      continue
    }
    attention.push({ post: card, why: a.why, state: a.state })
  }
  return { attention, privateCount, total: unique.length }
}

// ——— Find a post ———

export interface AdminPostLookup extends InspectedPost {
  /** False when every save of it is Just for me: then nothing about it is shown but counts. */
  listable: boolean
  card: PostCard | null
  savers: Face[]
  sharedSaves: number
  privateSaves: number
  notes: number
  kept: boolean
  keepState: string | null
}

/**
 * A pasted link's post, for Find a post and Moderation: who saved it (shared
 * saves only), how many saved it Just for me (a count), notes on shared
 * saves, whether it's kept, and whether it's hidden. A post saved only Just
 * for me shows counts and nothing else.
 */
export function lookUpPost(
  platform: string,
  id: string,
  window: AnalyticsWindow = 'week',
  contentTypeHint?: string | null,
): AdminPostLookup {
  const base = inspectPost(platform, id, window, contentTypeHint)
  const key = `${platform}:${id}`
  const card = postCards([key]).get(key) ?? null
  const [c] = db.all<{ shared: number; private: number; notes: number }>(sql`
    SELECT
      SUM(CASE WHEN is_private = 0 THEN 1 ELSE 0 END) AS shared,
      SUM(CASE WHEN is_private = 1 THEN 1 ELSE 0 END) AS private,
      SUM(CASE WHEN is_private = 0 AND note IS NOT NULL THEN 1 ELSE 0 END) AS notes
    FROM bookmarks WHERE platform = ${platform} AND id = ${id} AND COALESCE(source, '') != 'quoted'`)
  const [job] = db.all<{ status: string }>(sql`
    SELECT status FROM keep_jobs WHERE platform = ${platform} AND post_id = ${id}`)
  const [keptRow] = db.all<{ n: number }>(sql`
    SELECT COUNT(*) AS n FROM kept_files WHERE platform = ${platform} AND post_id = ${id}`)
  const privateSaves = num(c?.private)
  const sharedSaves = num(c?.shared)
  // A post only kept Just for me: nothing from anyone's save may show.
  const listable = !!card || (sharedSaves === 0 && privateSaves === 0)
  const redacted: InspectedPost = listable
    ? base
    : {
        ...base,
        author: null,
        authorName: null,
        text: null,
        thumbnailUrl: null,
        publicPlaylists: [],
      }
  return {
    ...redacted,
    listable,
    card,
    savers: card ? (sharedSavers([key]).get(key) ?? []) : [],
    sharedSaves,
    privateSaves,
    notes: num(c?.notes),
    kept: num(keptRow?.n) > 0,
    keepState: job?.status ?? null,
  }
}

export { splitKey }
