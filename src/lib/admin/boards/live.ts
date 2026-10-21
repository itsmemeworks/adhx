import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { channelTitle } from '@/components/next/channels/title'
import { getMomentsSnapshot } from '@/lib/moments/engine'
import { withSnapshotPeople } from '@/lib/moments/people'
import { watcherIds } from '@/lib/moments/presence'
import { coverImage } from '@/lib/feed/cover'
import { REACTION_KINDS, emojiForKind } from '@/lib/admin/counts'
import {
  facesById,
  lastDays,
  localDay,
  num,
  postCards,
  rangeSince,
  sinceClause,
  splitKey,
  type AdminRange,
  type Face,
} from '../shared'

/**
 * Admin → Channels and Live (board 10.4) and Live (10.5). Reactions are
 * counted, never kept (`reaction_counts`); moments come from `moment_log`
 * (no user ids) and the engine's live snapshot.
 */

export interface ReactionTally {
  kind: string
  /** The emoji, or null for words. */
  emoji: string | null
  count: number
}

export interface ReactionsSummary {
  total: number
  emoji: number
  typed: number
  byKind: ReactionTally[]
}

export function reactionsSummary(since: string | null): ReactionsSummary {
  const rows = db.all<{ kind: string; n: number }>(sql`
    SELECT kind, SUM(count) AS n FROM reaction_counts
    WHERE ${since ? sql`day >= ${since.slice(0, 10)}` : sql`1 = 1`}
    GROUP BY kind`)
  const counts = new Map(rows.map((r) => [r.kind, num(r.n)]))
  const byKind = REACTION_KINDS.filter((k) => k !== 'text')
    .map((kind) => ({ kind, emoji: emojiForKind(kind), count: counts.get(kind) ?? 0 }))
    .sort((a, b) => b.count - a.count)
  const typed = counts.get('text') ?? 0
  const emoji = byKind.reduce((s, r) => s + r.count, 0)
  return { total: emoji + typed, emoji, typed, byKind }
}

const one = (query: ReturnType<typeof sql>): number => num(db.all<{ n: number }>(query)[0]?.n)

function momentTotals(since: string | null) {
  const [r] = db.all<{
    n: number
    tune_ins: number
    peak: number
    alerts: number
    opened: number
  }>(sql`
    SELECT COUNT(*) AS n, COALESCE(SUM(tune_ins), 0) AS tune_ins,
      COALESCE(MAX(peak_watching), 0) AS peak, COALESCE(SUM(alerts), 0) AS alerts,
      COALESCE(SUM(alerts_opened), 0) AS opened
    FROM moment_log WHERE ${sinceClause(sql`formed_at`, since)}`)
  return {
    moments: num(r?.n),
    tuneIns: num(r?.tune_ins),
    peak: num(r?.peak),
    alerts: num(r?.alerts),
    alertsOpened: num(r?.opened),
  }
}

/** Moments tuned into per day (by the day each moment formed), oldest first. */
function tuneInsByDay(days: number, now: number): { day: string; tuneIns: number }[] {
  const list = lastDays(days, now)
  const from = new Date(now - (days + 1) * 24 * 60 * 60_000).toISOString()
  const rows = db.all<{ formed_at: string; tune_ins: number }>(sql`
    SELECT formed_at, tune_ins FROM moment_log WHERE formed_at >= ${from}`)
  const by = new Map(list.map((d) => [d, 0]))
  for (const r of rows) {
    const d = localDay(r.formed_at)
    if (by.has(d)) by.set(d, (by.get(d) ?? 0) + num(r.tune_ins))
  }
  return list.map((day) => ({ day, tuneIns: by.get(day) ?? 0 }))
}

// ——— Channels and Live ———

export interface TopChannel {
  key: string
  name: string
  kind: 'group' | 'public'
  owner: Face | null
  thumbnail: string | null
  href: string
  posts: number
  plays: number
  keeps: number
}

export interface ChannelsBoard {
  range: AdminRange
  made: { total: number; added: number }
  public: { total: number; views: number; keeps: number }
  group: { total: number; kept: number }
  moments: { count: number; formingNow: number }
  tunedIn: { total: number; peak: number }
  alerts: { sent: number; bellsOn: number }
  top: TopChannel[]
  reactions: ReactionsSummary
  tuneInsByDay: { day: string; tuneIns: number }[]
}

function firstThumb(keys: string[]): string | null {
  const cards = postCards(keys.slice(0, 12))
  for (const k of keys.slice(0, 12)) {
    const t = cards.get(k)?.thumbnail
    if (t) return t
  }
  return null
}

export async function channelsBoard(range: AdminRange, now = Date.now()): Promise<ChannelsBoard> {
  const since = rangeSince(range, now)
  const made = one(sql`SELECT COUNT(*) AS n FROM (SELECT DISTINCT user_id, tag FROM bookmark_tags)`)
  const madeAdded = since
    ? one(sql`
        SELECT COUNT(*) AS n FROM (
          SELECT user_id, tag, MIN(created_at) AS first FROM bookmark_tags GROUP BY user_id, tag
        ) WHERE first >= ${since}`)
    : made
  const [pub] = db.all<{ n: number; views: number; clones: number }>(sql`
    SELECT COUNT(*) AS n,
      COALESCE(SUM(a.view_count), 0) AS views, COALESCE(SUM(a.clone_count), 0) AS clones
    FROM tag_shares s
    LEFT JOIN collection_aggregates a ON a.owner_user_id = s.user_id AND a.tag = s.tag
    WHERE s.is_public = 1`)
  const groupTotal = one(sql`SELECT COUNT(*) AS n FROM group_channels`)

  const plays = new Map<string, number>()
  const keeps = new Map<string, number>()
  for (const r of db.all<{ name: string; surface: string; ref: string; n: number }>(sql`
    SELECT name, surface, bookmark_id AS ref, COUNT(*) AS n FROM analytics_events
    WHERE name IN ('channel.play', 'channel.keep') AND bookmark_id IS NOT NULL
      AND ${sinceClause(sql`created_at`, since)}
    GROUP BY name, surface, bookmark_id`)) {
    const key = `${r.surface}:${r.ref}`
    ;(r.name === 'channel.play' ? plays : keeps).set(key, num(r.n))
  }
  const groupKept = one(sql`
    SELECT COUNT(*) AS n FROM analytics_events WHERE name = 'channel.keep'
      AND ${sinceClause(sql`created_at`, since)}`)

  // Shared channels only: From everyone, and public channels. Made for you
  // and private channels are someone's own; their plays are what they
  // watched, so they never appear here.
  const top: TopChannel[] = []
  for (const g of db.all<{ slug: string; name: string; size: number; post_keys: string }>(sql`
    SELECT slug, name, size, post_keys FROM group_channels`)) {
    let keys: string[] = []
    try {
      keys = JSON.parse(g.post_keys) as string[]
    } catch {
      keys = []
    }
    top.push({
      key: `group:${g.slug}`,
      name: g.name,
      kind: 'group',
      owner: null,
      thumbnail: firstThumb(keys),
      href: `/play?group=${encodeURIComponent(g.slug)}`,
      posts: num(g.size),
      plays: plays.get(`group:${g.slug}`) ?? 0,
      keeps: keeps.get(`group:${g.slug}`) ?? 0,
    })
  }
  const pubRows = db.all<{ user_id: string; tag: string; clones: number; posts: number }>(sql`
    SELECT s.user_id, s.tag, COALESCE(a.clone_count, 0) AS clones,
      (SELECT COUNT(*) FROM bookmark_tags t JOIN bookmarks b
         ON b.user_id = t.user_id AND b.platform = t.platform AND b.id = t.bookmark_id
       WHERE t.user_id = s.user_id AND t.tag = s.tag AND b.is_private = 0) AS posts
    FROM tag_shares s
    LEFT JOIN collection_aggregates a ON a.owner_user_id = s.user_id AND a.tag = s.tag
    WHERE s.is_public = 1
      AND NOT EXISTS (SELECT 1 FROM user_bans x WHERE x.user_id = s.user_id)`)
  const owners = facesById(pubRows.map((r) => r.user_id))
  for (const r of pubRows) {
    const owner = owners.get(r.user_id)
    if (!owner) continue
    const ref = `${owner.username}/${r.tag}`
    const keys = db
      .all<{ k: string }>(
        sql`
        SELECT t.platform || ':' || t.bookmark_id AS k FROM bookmark_tags t
        WHERE t.user_id = ${r.user_id} AND t.tag = ${r.tag}
        ORDER BY t.created_at DESC LIMIT 12`,
      )
      .map((x) => x.k)
    top.push({
      key: `channel:${ref}`,
      name: channelTitle(r.tag),
      kind: 'public',
      owner,
      thumbnail: firstThumb(keys),
      href: `/t/${encodeURIComponent(owner.username)}/${encodeURIComponent(r.tag)}`,
      posts: num(r.posts),
      plays: plays.get(`channel:${ref}`) ?? 0,
      keeps: num(r.clones),
    })
  }
  top.sort((a, b) => b.plays - a.plays || b.posts - a.posts || a.name.localeCompare(b.name))

  const totals = momentTotals(since)
  const snapshot = await safeSnapshot()
  return {
    range,
    made: { total: made, added: madeAdded },
    public: { total: num(pub?.n), views: num(pub?.views), keeps: num(pub?.clones) },
    group: { total: groupTotal, kept: groupKept },
    moments: { count: totals.moments, formingNow: snapshot?.forming.length ?? 0 },
    tunedIn: { total: totals.tuneIns, peak: totals.peak },
    alerts: {
      sent: totals.alerts,
      bellsOn: one(sql`SELECT COUNT(*) AS n FROM moment_alert_subs`),
    },
    top: top.slice(0, 8),
    // Reactions here are always the last 30 days ("312 this month").
    reactions: reactionsSummary(new Date(now - 30 * 24 * 60 * 60_000).toISOString()),
    tuneInsByDay: tuneInsByDay(14, now),
  }
}

async function safeSnapshot() {
  try {
    return await getMomentsSnapshot()
  } catch {
    return null
  }
}

// ——— Live ———

export interface LiveMomentCard {
  slug: string
  title: string
  hue: string
  rising: boolean
  recentSaves: number | null
  windowMinutes: number | null
  people: number
  posts: number
  covers: string[]
  savers: Face[]
  /** "You and Ben saving" etc. are made on the client from `savers` (`isYou`). */
  saversYou: boolean[]
  watching: number
  reactions: number
}

export interface FormingRow {
  id: string
  title: string
  hue: string
  have: number
  need: number
  unit: 'people' | 'saves'
  cover: string | null
  people: Face[]
  bells: number
}

export interface LiveBoard {
  range: AdminRange
  liveNow: number
  watchingNow: number
  forming: number
  bellsWaiting: number
  moments: { count: number; lastMonth: number }
  tuneIns: { total: number; peak: number }
  reactions: ReactionsSummary
  alerts: { sent: number; opened: number }
  live: LiveMomentCard[]
  formingRows: FormingRow[]
  week: { slug: string; title: string; tuneIns: number; reactions: number }[]
  reactors: { face: Face; count: number }[]
}

export async function liveBoard(
  range: AdminRange,
  viewerId: string,
  now = Date.now(),
): Promise<LiveBoard> {
  const since = rangeSince(range, now)
  const totals = momentTotals(since)
  const lastMonth = momentTotals(new Date(now - 30 * 24 * 60 * 60_000).toISOString()).moments
  const raw = await safeSnapshot()
  const snapshot = raw ? withSnapshotPeople(raw, viewerId) : null

  const reactionsBySlug = new Map<string, number>()
  if (snapshot?.moments.length) {
    for (const r of db.all<{ slug: string; reactions: number }>(sql`
      SELECT slug, reactions FROM moment_log WHERE slug IN (${sql.join(
        snapshot.moments.map((m) => sql`${m.slug}`),
        sql`, `,
      )})`))
      reactionsBySlug.set(r.slug, num(r.reactions))
  }
  const watchers = new Set<string>()
  for (const m of snapshot?.moments ?? []) {
    for (const w of watcherIds(m.slug)) watchers.add(w.userId)
  }

  const live: LiveMomentCard[] = (snapshot?.moments ?? []).slice(0, 2).map((m) => {
    const covers = m.covers
      .map((c) => coverImage(c))
      .filter((c): c is string => !!c)
      .slice(0, 3)
    const savers = (m.savers ?? []).slice(0, 4)
    return {
      slug: m.slug,
      title: m.title,
      hue: m.hue,
      rising: m.rising,
      recentSaves: m.recentSaves ?? null,
      windowMinutes: m.windowMinutes ?? null,
      people: m.people,
      posts: m.posts,
      covers,
      savers: savers.map((s) => ({ username: s.username, name: s.name, avatarUrl: s.avatarUrl })),
      saversYou: savers.map((s) => s.isYou),
      watching: watcherIds(m.slug).length,
      reactions: reactionsBySlug.get(m.slug) ?? 0,
    }
  })

  const bells = new Map<string, number>()
  for (const r of db.all<{ forming_id: string; n: number }>(sql`
    SELECT forming_id, COUNT(*) AS n FROM moment_alert_subs GROUP BY forming_id`))
    bells.set(r.forming_id, num(r.n))
  const formingRows: FormingRow[] = (snapshot?.forming ?? []).slice(0, 4).map((f) => ({
    id: f.id,
    title: f.title,
    hue: f.hue,
    have: f.have,
    need: f.need,
    unit: f.unit,
    cover: f.covers.map((c) => coverImage(c)).find((c): c is string => !!c) ?? null,
    people: (f.people ?? []).map((p) => ({ ...p })),
    bells: bells.get(f.id) ?? 0,
  }))

  const week = db
    .all<{ slug: string; title: string; tune_ins: number; reactions: number }>(
      sql`
      SELECT slug, title, tune_ins, reactions FROM moment_log
      WHERE ${sinceClause(sql`formed_at`, since)}
      ORDER BY tune_ins DESC, reactions DESC, formed_at DESC LIMIT 5`,
    )
    .map((r) => ({
      slug: r.slug,
      title: r.title,
      tuneIns: num(r.tune_ins),
      reactions: num(r.reactions),
    }))

  const reactorRows = db.all<{ id: string; n: number }>(sql`
    SELECT r.user_id AS id, SUM(r.count) AS n FROM reaction_counts r
    JOIN users u ON u.id = r.user_id
    WHERE ${since ? sql`r.day >= ${since.slice(0, 10)}` : sql`1 = 1`}
    GROUP BY r.user_id ORDER BY n DESC LIMIT 3`)
  const faces = facesById(reactorRows.map((r) => r.id))

  return {
    range,
    liveNow: snapshot?.moments.length ?? 0,
    watchingNow: watchers.size,
    forming: snapshot?.forming.length ?? 0,
    bellsWaiting: one(sql`SELECT COUNT(*) AS n FROM moment_alert_subs`),
    moments: { count: totals.moments, lastMonth },
    tuneIns: { total: totals.tuneIns, peak: totals.peak },
    reactions: reactionsSummary(since),
    alerts: { sent: totals.alerts, opened: totals.alertsOpened },
    live,
    formingRows,
    week,
    reactors: reactorRows
      .map((r) => ({ face: faces.get(r.id)!, count: num(r.n) }))
      .filter((r) => r.face),
  }
}

export { splitKey }
