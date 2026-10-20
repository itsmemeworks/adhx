import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  lastDays,
  num,
  perDay,
  previousRange,
  rangeSince,
  sinceClause,
  type AdminRange,
} from '../shared'
import { eventCounts } from './overview'

/**
 * Admin → Analytics (board 10.6). Counts only: what anyone searched for,
 * opened or watched is never shown (no query words are stored at all; the
 * events here have no post or user on screen).
 */

export interface AnalyticsBoard {
  range: AdminRange
  opens: { total: number; changePct: number | null }
  plays: { total: number; finishedPct: number | null }
  searches: { total: number; foundPct: number | null }
  sends: number
  sharedOut: { total: number; files: number; links: number }
  saves: { total: number; phonePct: number | null }
  /** Last 30 days, oldest first. */
  daily: { day: string; plays: number; opens: number; sends: number }[]
  where: { web: number; ios: number; android: number; phone: number }
  when: { weekday: string | null; fromHour: number | null } | null
  searchMode: { meaning: number; words: number }
  funnel: { saved: number; played: number; reacted: number; sent: number }
  sources: { id: string; label: string; count: number }[]
}

const WEEKDAYS = [
  'Sundays',
  'Mondays',
  'Tuesdays',
  'Wednesdays',
  'Thursdays',
  'Fridays',
  'Saturdays',
]

/** What `bookmarks.source` means, in plain words. */
export const SOURCE_LABELS: Record<string, string> = {
  phone_app: 'Phone share sheet',
  manual: 'Pasted on the web',
  url_prefix: 'Opened from a link',
  sync: 'X bookmarks sync',
  channel_keep: 'Kept channels',
  clone: 'Saved channels',
  pwa_share: 'Android share sheet',
}

const one = (query: ReturnType<typeof sql>): number => num(db.all<{ n: number }>(query)[0]?.n)

export function analyticsBoard(range: AdminRange, now = Date.now()): AnalyticsBoard {
  const since = rangeSince(range, now)
  const names = [
    'app.open',
    'post.play',
    'post.finish',
    'search.found',
    'search.none',
    'post.send',
    'post.share',
  ]
  const ev = eventCounts(names, since)
  const prev = previousRange(range, now)
  const prevOpens = prev
    ? (eventCounts(['app.open'], prev.since, prev.until).get('app.open') ?? 0)
    : 0
  const opens = ev.get('app.open') ?? 0
  const plays = ev.get('post.play') ?? 0
  const found = ev.get('search.found') ?? 0
  const searches = found + (ev.get('search.none') ?? 0)
  const files = ev.get('post.send') ?? 0
  // A file shared through the share sheet also writes a share; links are the rest.
  const links = Math.max(0, (ev.get('post.share') ?? 0) - (ev.get('post.send:share') ?? 0))

  const sends = one(sql`
    SELECT COUNT(*) AS n FROM post_sends WHERE ${sinceClause(sql`created_at`, since)}`)
  const saveRows = db.all<{ source: string | null; n: number }>(sql`
    SELECT source, COUNT(*) AS n FROM bookmarks
    WHERE COALESCE(source, '') != 'quoted' AND ${sinceClause(sql`processed_at`, since)}
    GROUP BY source`)
  const saves = saveRows.reduce((s, r) => s + num(r.n), 0)
  const phoneSaves = num(saveRows.find((r) => r.source === 'phone_app')?.n)

  // Every day, last 30 days.
  const days = lastDays(30, now)
  const from = new Date(now - 31 * 24 * 60 * 60_000).toISOString()
  const times = (name: string) =>
    db
      .all<{ at: string }>(
        sql`
        SELECT created_at AS at FROM analytics_events WHERE name = ${name} AND created_at >= ${from}`,
      )
      .map((r) => r.at)
  const playDays = perDay(days, times('post.play'))
  const openDays = perDay(days, times('app.open'))
  const sendDays = perDay(
    days,
    db
      .all<{ at: string }>(sql`SELECT created_at AS at FROM post_sends WHERE created_at >= ${from}`)
      .map((r) => r.at),
  )

  // When: the busiest weekday and two-hour stretch, from opens and plays in the range.
  const activity = db.all<{ at: string }>(sql`
    SELECT created_at AS at FROM analytics_events
    WHERE name IN ('app.open', 'post.play') AND ${sinceClause(sql`created_at`, since)}`)
  let when: AnalyticsBoard['when'] = null
  if (activity.length) {
    const byDay = new Array(7).fill(0)
    const byHour = new Array(24).fill(0)
    for (const a of activity) {
      const d = new Date(a.at)
      if (Number.isNaN(d.getTime())) continue
      byDay[d.getDay()]++
      byHour[d.getHours()]++
    }
    let bestHour = 0
    for (let h = 0; h < 24; h++) {
      if (byHour[h] + byHour[(h + 1) % 24] > byHour[bestHour] + byHour[(bestHour + 1) % 24])
        bestHour = h
    }
    const bestDay = byDay.indexOf(Math.max(...byDay))
    when = { weekday: WEEKDAYS[bestDay], fromHour: bestHour }
  }

  // Funnel: posts saved in the range, how many of them anyone played, the
  // reactions sent, and how many were sent on to someone.
  const saved = one(sql`
    SELECT COUNT(*) AS n FROM (SELECT DISTINCT platform, id FROM bookmarks
      WHERE COALESCE(source, '') != 'quoted' AND ${sinceClause(sql`processed_at`, since)})`)
  const played = one(sql`
    SELECT COUNT(*) AS n FROM (SELECT DISTINCT b.platform, b.id FROM bookmarks b
      WHERE COALESCE(b.source, '') != 'quoted' AND ${sinceClause(sql`b.processed_at`, since)}
        AND (EXISTS (SELECT 1 FROM post_views v WHERE v.platform = b.platform AND v.post_id = b.id
               AND v.user_id != b.user_id)
          OR EXISTS (SELECT 1 FROM analytics_events e WHERE e.name = 'post.play'
               AND e.platform = b.platform AND e.bookmark_id = b.id)))`)
  const reacted = one(sql`
    SELECT COALESCE(SUM(count), 0) AS n FROM reaction_counts
    WHERE ${since ? sql`day >= ${since.slice(0, 10)}` : sql`1 = 1`}`)
  const sent = one(sql`
    SELECT COUNT(*) AS n FROM (SELECT DISTINCT b.platform, b.id FROM bookmarks b
      WHERE COALESCE(b.source, '') != 'quoted' AND ${sinceClause(sql`b.processed_at`, since)}
        AND EXISTS (SELECT 1 FROM post_sends s WHERE s.platform = b.platform AND s.post_id = b.id))`)

  const sources = saveRows
    .map((r) => {
      const id = r.source ?? 'sync'
      return { id, label: SOURCE_LABELS[id] ?? 'Other ways', count: num(r.n) }
    })
    .reduce<{ id: string; label: string; count: number }[]>((acc, r) => {
      const same = acc.find((a) => a.label === r.label)
      if (same) same.count += r.count
      else acc.push({ ...r })
      return acc
    }, [])
    .sort((a, b) => b.count - a.count)

  return {
    range,
    opens: {
      total: opens,
      changePct: prev && prevOpens ? Math.round(((opens - prevOpens) / prevOpens) * 100) : null,
    },
    plays: {
      total: plays,
      finishedPct: plays ? Math.round(((ev.get('post.finish') ?? 0) / plays) * 100) : null,
    },
    searches: { total: searches, foundPct: searches ? Math.round((found / searches) * 100) : null },
    sends,
    sharedOut: { total: files + links, files, links },
    saves: { total: saves, phonePct: saves ? Math.round((phoneSaves / saves) * 100) : null },
    daily: days.map((day, i) => ({
      day,
      plays: playDays[i],
      opens: openDays[i],
      sends: sendDays[i],
    })),
    where: {
      web: ev.get('app.open:web') ?? 0,
      ios: ev.get('app.open:ios') ?? 0,
      android: ev.get('app.open:android') ?? 0,
      phone: ev.get('app.open:phone') ?? 0,
    },
    when,
    searchMode: {
      meaning: (ev.get('search.found:meaning') ?? 0) + (ev.get('search.none:meaning') ?? 0),
      words: (ev.get('search.found:words') ?? 0) + (ev.get('search.none:words') ?? 0),
    },
    funnel: { saved, played, reacted, sent },
    sources,
  }
}
