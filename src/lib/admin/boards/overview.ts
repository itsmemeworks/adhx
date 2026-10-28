import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { waitingCount } from '@/lib/auth/approval'
import { remoteProcessing } from '@/lib/processing/config'
import { remoteWorkerConnected } from '@/lib/processing/presence'
import { readModeratedPostKeys } from '@/lib/admin/moderation'
import {
  diskSpace,
  facesById,
  lastDays,
  num,
  perDay,
  postCards,
  rangeSince,
  rangeWords,
  sharedSavers,
  sinceClause,
  type AdminRange,
  type Face,
  type PostCard,
} from '../shared'
import { appUrl } from '@/lib/routes/app-url'

/**
 * Admin → Overview (board 10.1). Counts include Just for me saves; "Most
 * saved" lists only posts with shared saves and counts only those.
 */

export interface ServerInfo {
  name: string
  version: string
  uptimeSeconds: number
  healthy: boolean
}

export interface Health {
  dbOk: boolean
  keptBytes: number
  diskTotal: number | null
  diskFree: number | null
  /** 'connected' | 'away' for a Mac helper; 'here' when this server does the work. */
  helper: 'connected' | 'away' | 'here'
  understoodPct: number | null
}

export interface OverviewBoard {
  range: AdminRange
  rangeWords: string
  people: { count: number; waiting: number }
  saves: { total: number; added: number; privateTotal: number }
  kept: { bytes: number; posts: number; onTheirWay: number }
  channels: { made: number; public: number; group: number }
  reactions: { total: number; added: number }
  sends: { total: number; watched: number }
  days: { day: string; shared: number; private: number }[]
  busiestDay: { day: string; saves: number } | null
  opens: { total: number; webPct: number | null }
  plays: { total: number; finishedPct: number | null }
  notes: { total: number; pctOfSaves: number | null }
  moments: { count: number; peak: number }
  health: Health
  mostSaved: { post: PostCard; savers: Face[]; saves: number; detail: string }[]
  busiest: { face: Face; saves: number; reactions: number; pct: number }[]
}

export function serverInfo(): ServerInfo {
  let name = 'adhx'
  try {
    name = new URL(appUrl()).hostname
  } catch {
    // Keep the default.
  }
  let healthy = true
  try {
    db.all(sql`SELECT 1`)
  } catch {
    healthy = false
  }
  return {
    name,
    version: process.env.NEXT_PUBLIC_APP_VERSION || 'dev',
    uptimeSeconds: Math.round(process.uptime()),
    healthy,
  }
}

const one = (query: ReturnType<typeof sql>): number => num(db.all<{ n: number }>(query)[0]?.n)

/** Kept bytes and posts, and how many are still on their way. */
export function keptTotals(): { bytes: number; posts: number; onTheirWay: number } {
  const [k] = db.all<{ bytes: number; posts: number }>(sql`
    SELECT COALESCE(SUM(bytes), 0) AS bytes,
           COUNT(DISTINCT platform || ':' || post_id) AS posts
    FROM kept_files`)
  const onTheirWay = one(sql`
    SELECT COUNT(*) AS n FROM keep_jobs WHERE status IN ('pending', 'running', 'converting')`)
  return { bytes: num(k?.bytes), posts: num(k?.posts), onTheirWay }
}

/** Share of saved posts whose words have been understood (null with nothing saved). */
export function understoodPct(): number | null {
  const [r] = db.all<{ posts: number; done: number }>(sql`
    WITH p AS (
      SELECT DISTINCT platform, id FROM bookmarks WHERE COALESCE(source, '') != 'quoted'
    )
    SELECT COUNT(*) AS posts,
      SUM(CASE WHEN EXISTS (
        SELECT 1 FROM post_embeddings e
        WHERE e.platform = p.platform AND e.post_id = p.id AND e.kind = 'text'
      ) THEN 1 ELSE 0 END) AS done
    FROM p`)
  const posts = num(r?.posts)
  return posts ? Math.round((num(r?.done) / posts) * 100) : null
}

export async function health(): Promise<Health> {
  const info = serverInfo()
  const disk = await diskSpace()
  const helper = remoteProcessing() ? (remoteWorkerConnected() ? 'connected' : 'away') : 'here'
  return {
    dbOk: info.healthy,
    keptBytes: keptTotals().bytes,
    diskTotal: disk.total,
    diskFree: disk.free,
    helper,
    understoodPct: understoodPct(),
  }
}

/** Counts of analytics events by name (and source) in the range. Never selects user ids. */
export function eventCounts(
  names: string[],
  since: string | null,
  until?: string,
): Map<string, number> {
  const out = new Map<string, number>()
  if (!names.length) return out
  const rows = db.all<{ name: string; source: string | null; n: number }>(sql`
    SELECT name, source, COUNT(*) AS n FROM analytics_events
    WHERE name IN (${sql.join(
      names.map((n) => sql`${n}`),
      sql`, `,
    )})
      AND ${sinceClause(sql`created_at`, since)}
      AND ${until ? sql`created_at < ${until}` : sql`1 = 1`}
    GROUP BY name, source`)
  for (const r of rows) {
    out.set(r.name, (out.get(r.name) ?? 0) + num(r.n))
    if (r.source) out.set(`${r.name}:${r.source}`, num(r.n))
  }
  return out
}

export async function overviewBoard(range: AdminRange, now = Date.now()): Promise<OverviewBoard> {
  const since = rangeSince(range, now)

  const people = one(sql`
    SELECT COUNT(*) AS n FROM users u WHERE u.approval = 'approved'
      AND NOT EXISTS (SELECT 1 FROM user_bans b WHERE b.user_id = u.id)`)
  const savesTotal = one(
    sql`SELECT COUNT(*) AS n FROM bookmarks WHERE COALESCE(source, '') != 'quoted'`,
  )
  const savesAdded = one(sql`
    SELECT COUNT(*) AS n FROM bookmarks
    WHERE COALESCE(source, '') != 'quoted' AND ${sinceClause(sql`processed_at`, since)}`)
  const privateTotal = one(sql`
    SELECT COUNT(*) AS n FROM bookmarks WHERE COALESCE(source, '') != 'quoted' AND is_private = 1`)

  const channelsMade = one(sql`
    SELECT COUNT(*) AS n FROM (SELECT DISTINCT user_id, tag FROM bookmark_tags)`)
  const channelsPublic = one(sql`SELECT COUNT(*) AS n FROM tag_shares WHERE is_public = 1`)
  const channelsGroup = one(sql`SELECT COUNT(*) AS n FROM group_channels`)

  const reactionsTotal = one(sql`SELECT COALESCE(SUM(count), 0) AS n FROM reaction_counts`)
  const reactionsAdded = since
    ? one(sql`
        SELECT COALESCE(SUM(count), 0) AS n FROM reaction_counts WHERE day >= ${since.slice(0, 10)}`)
    : reactionsTotal

  const sendsTotal = one(sql`SELECT COUNT(*) AS n FROM post_sends`)
  const sendsWatched = one(sql`SELECT COUNT(*) AS n FROM post_sends WHERE seen_at IS NOT NULL`)

  // Saves per day, last 30 days: shared and Just for me.
  const days = lastDays(30, now)
  const from = new Date(now - 31 * 24 * 60 * 60_000).toISOString()
  const recent = db.all<{ at: string; is_private: number }>(sql`
    SELECT processed_at AS at, is_private FROM bookmarks
    WHERE COALESCE(source, '') != 'quoted' AND processed_at >= ${from}`)
  const shared = perDay(
    days,
    recent.filter((r) => !r.is_private).map((r) => r.at),
  )
  const priv = perDay(
    days,
    recent.filter((r) => r.is_private).map((r) => r.at),
  )
  const daily = days.map((day, i) => ({ day, shared: shared[i], private: priv[i] }))
  const top = daily.reduce<{ day: string; saves: number } | null>(
    (best, d) =>
      d.shared + d.private > (best?.saves ?? 0)
        ? { day: d.day, saves: d.shared + d.private }
        : best,
    null,
  )

  const events = eventCounts(['app.open', 'post.play', 'post.finish'], since)
  const opens = events.get('app.open') ?? 0
  const webOpens = events.get('app.open:web') ?? 0
  const plays = events.get('post.play') ?? 0
  const finished = events.get('post.finish') ?? 0

  const notes = one(sql`
    SELECT COUNT(*) AS n FROM bookmarks
    WHERE note IS NOT NULL AND is_private = 0 AND COALESCE(source, '') != 'quoted'`)

  const [moments] = db.all<{ n: number; peak: number }>(sql`
    SELECT COUNT(*) AS n, COALESCE(MAX(peak_watching), 0) AS peak FROM moment_log
    WHERE ${sinceClause(sql`formed_at`, since)}`)

  // Most saved in the range: shared saves only, hidden posts left out.
  const hidden = readModeratedPostKeys()
  const hiddenKeys = hidden.ok ? hidden.value : new Set<string>()
  const topRows = db
    .all<{ platform: string; id: string; n: number }>(
      sql`
      SELECT b.platform, b.id, COUNT(*) AS n FROM bookmarks b
      WHERE b.is_private = 0 AND COALESCE(b.source, '') != 'quoted'
        AND NOT EXISTS (SELECT 1 FROM user_bans x WHERE x.user_id = b.user_id)
        AND ${sinceClause(sql`b.processed_at`, since)}
      GROUP BY b.platform, b.id
      ORDER BY n DESC, MAX(b.processed_at) DESC
      LIMIT 12`,
    )
    .filter((r) => !hiddenKeys.has(`${r.platform}:${r.id}`))
  const topKeys = topRows.map((r) => `${r.platform}:${r.id}`)
  const cards = postCards(topKeys)
  const savers = sharedSavers(topKeys)
  const perPost = (query: ReturnType<typeof sql>) => {
    const m = new Map<string, number>()
    for (const r of db.all<{ k: string; n: number }>(query)) m.set(r.k, num(r.n))
    return m
  }
  const idList = topRows.length
    ? sql.join(
        topRows.map((r) => sql`${r.id}`),
        sql`, `,
      )
    : sql`''`
  const playsBy = perPost(sql`
    SELECT platform || ':' || bookmark_id AS k, COUNT(*) AS n FROM analytics_events
    WHERE name = 'post.play' AND bookmark_id IN (${idList}) AND ${sinceClause(sql`created_at`, since)}
    GROUP BY k`)
  const notesBy = perPost(sql`
    SELECT platform || ':' || id AS k, COUNT(*) AS n FROM bookmarks
    WHERE id IN (${idList}) AND note IS NOT NULL AND is_private = 0 GROUP BY k`)
  const sendsBy = perPost(sql`
    SELECT platform || ':' || post_id AS k, COUNT(*) AS n FROM post_sends
    WHERE post_id IN (${idList}) GROUP BY k`)
  const mostSaved: OverviewBoard['mostSaved'] = []
  for (const r of topRows) {
    const k = `${r.platform}:${r.id}`
    const card = cards.get(k)
    if (!card) continue
    const n = num(r.n)
    const extras: string[] = []
    const p = playsBy.get(k) ?? 0
    const nt = notesBy.get(k) ?? 0
    const s = sendsBy.get(k) ?? 0
    if (s >= Math.max(p, nt) && s > 0) extras.push(s === 1 ? 'sent once' : `sent ${s} times`)
    else if (nt > p && nt > 0) extras.push(nt === 1 ? '1 note' : `${nt} notes`)
    else if (p > 0) extras.push(p === 1 ? '1 play' : `${p} plays`)
    mostSaved.push({
      post: card,
      savers: savers.get(k) ?? [],
      saves: n,
      detail: [card.network, n === 1 ? '1 save' : `${n} saves`, ...extras].join(' · '),
    })
    if (mostSaved.length >= 4) break
  }

  // Who's busiest: saves and reactions in the range.
  const busyRows = db.all<{ id: string; saves: number }>(sql`
    SELECT b.user_id AS id, COUNT(*) AS saves FROM bookmarks b
    JOIN users u ON u.id = b.user_id AND u.approval = 'approved'
    WHERE COALESCE(b.source, '') != 'quoted' AND ${sinceClause(sql`b.processed_at`, since)}
      AND NOT EXISTS (SELECT 1 FROM user_bans x WHERE x.user_id = b.user_id)
    GROUP BY b.user_id ORDER BY saves DESC LIMIT 5`)
  const reactRows = new Map<string, number>()
  for (const r of db.all<{ id: string; n: number }>(sql`
    SELECT user_id AS id, SUM(count) AS n FROM reaction_counts
    WHERE ${since ? sql`day >= ${since.slice(0, 10)}` : sql`1 = 1`} GROUP BY user_id`))
    reactRows.set(r.id, num(r.n))
  const faces = facesById(busyRows.map((r) => r.id))
  const maxSaves = Math.max(1, ...busyRows.map((r) => num(r.saves)))
  const busiest = busyRows
    .map((r) => ({
      face: faces.get(r.id)!,
      saves: num(r.saves),
      reactions: reactRows.get(r.id) ?? 0,
      pct: Math.round((num(r.saves) / maxSaves) * 100),
    }))
    .filter((b) => b.face)

  return {
    range,
    rangeWords: rangeWords(range),
    people: { count: people, waiting: waitingCount() },
    saves: { total: savesTotal, added: savesAdded, privateTotal },
    kept: keptTotals(),
    channels: { made: channelsMade, public: channelsPublic, group: channelsGroup },
    reactions: { total: reactionsTotal, added: reactionsAdded },
    sends: { total: sendsTotal, watched: sendsWatched },
    days: daily,
    busiestDay: top,
    opens: { total: opens, webPct: opens ? Math.round((webOpens / opens) * 100) : null },
    plays: { total: plays, finishedPct: plays ? Math.round((finished / plays) * 100) : null },
    notes: {
      total: notes,
      pctOfSaves: savesTotal ? Math.round((notes / savesTotal) * 100) : null,
    },
    moments: { count: num(moments?.n), peak: num(moments?.peak) },
    health: await health(),
    mostSaved,
    busiest,
  }
}
