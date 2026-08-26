/**
 * Aggregate reads over `analytics_events`. Never selects `userId`.
 * This is the growth / future-leaderboard choke point — add new rollups
 * here rather than querying the table from a route.
 */

import { db } from '@/lib/db'
import { analyticsEvents } from '@/lib/db/schema'
import { and, eq, gt, sql } from 'drizzle-orm'
import { readModeratedPostKeys } from '@/lib/admin/moderation'
import type { AnalyticEventName } from './events'

export type AnalyticsWindow = 'today' | 'week' | 'month' | 'all'

const WINDOW_MS: Record<Exclude<AnalyticsWindow, 'all'>, number> = {
  today: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
}

export function parseAnalyticsWindow(raw: string | null | undefined): AnalyticsWindow {
  if (raw === 'today' || raw === 'week' || raw === 'month' || raw === 'all') return raw
  return 'week'
}

function sinceIso(window: AnalyticsWindow): string | null {
  if (window === 'all') return null
  return new Date(Date.now() - WINDOW_MS[window]).toISOString()
}

export interface AnalyticsSummary {
  window: AnalyticsWindow
  totals: Record<string, number>
  byPlatform: Record<string, Record<string, number>>
  byContentType: Record<string, Record<string, number>>
  topPosts: Array<{
    platform: string
    bookmarkId: string
    views: number
    saves: number
    shares: number
    score: number
  }>
}

const POST_SCORE_EVENTS: AnalyticEventName[] = [
  'post.view',
  'post.save',
  'post.share',
  'post.send',
  'post.copy',
]

export function getAnalyticsSummary(window: AnalyticsWindow = 'week'): AnalyticsSummary {
  const since = sinceIso(window)
  const windowFilter = since ? gt(analyticsEvents.createdAt, since) : undefined

  const nameRows = db
    .select({
      name: analyticsEvents.name,
      count: sql<number>`count(*)`.as('count'),
    })
    .from(analyticsEvents)
    .where(windowFilter)
    .groupBy(analyticsEvents.name)
    .all()

  const totals: Record<string, number> = {}
  for (const row of nameRows) totals[row.name] = Number(row.count) || 0

  const platformRows = db
    .select({
      platform: analyticsEvents.platform,
      name: analyticsEvents.name,
      count: sql<number>`count(*)`.as('count'),
    })
    .from(analyticsEvents)
    .where(windowFilter)
    .groupBy(analyticsEvents.platform, analyticsEvents.name)
    .all()

  const byPlatform: Record<string, Record<string, number>> = {}
  for (const row of platformRows) {
    if (!row.platform) continue
    const bucket = (byPlatform[row.platform] ??= {})
    bucket[row.name] = Number(row.count) || 0
  }

  const typeRows = db
    .select({
      contentType: analyticsEvents.contentType,
      name: analyticsEvents.name,
      count: sql<number>`count(*)`.as('count'),
    })
    .from(analyticsEvents)
    .where(windowFilter)
    .groupBy(analyticsEvents.contentType, analyticsEvents.name)
    .all()

  const byContentType: Record<string, Record<string, number>> = {}
  for (const row of typeRows) {
    if (!row.contentType) continue
    const bucket = (byContentType[row.contentType] ??= {})
    bucket[row.name] = Number(row.count) || 0
  }

  const topWhere = since
    ? and(
        gt(analyticsEvents.createdAt, since),
        sql`${analyticsEvents.name} in ('post.view','post.save','post.share','post.send','post.copy')`,
      )
    : sql`${analyticsEvents.name} in ('post.view','post.save','post.share','post.send','post.copy')`

  // Analytics rows outlive publication decisions. Re-read the complete hidden
  // set before exposing ranked post identities so a hide takes effect
  // immediately without one moderation lookup per result. Aggregate totals
  // remain identity-free and keep their existing semantics.
  const moderatedPostKeys = readModeratedPostKeys()
  const topRows = moderatedPostKeys.ok
    ? db
        .select({
          platform: analyticsEvents.platform,
          bookmarkId: analyticsEvents.bookmarkId,
          name: analyticsEvents.name,
          count: sql<number>`count(*)`.as('count'),
        })
        .from(analyticsEvents)
        .where(topWhere)
        .groupBy(analyticsEvents.platform, analyticsEvents.bookmarkId, analyticsEvents.name)
        .all()
    : []

  const scored = new Map<
    string,
    { platform: string; bookmarkId: string; views: number; saves: number; shares: number }
  >()
  for (const row of topRows) {
    if (!row.platform || !row.bookmarkId) continue
    if (!POST_SCORE_EVENTS.includes(row.name as AnalyticEventName)) continue
    const key = `${row.platform}:${row.bookmarkId}`
    if (moderatedPostKeys.ok && moderatedPostKeys.value.has(key)) continue
    const entry = scored.get(key) ?? {
      platform: row.platform,
      bookmarkId: row.bookmarkId,
      views: 0,
      saves: 0,
      shares: 0,
    }
    const n = Number(row.count) || 0
    if (row.name === 'post.view') entry.views += n
    else if (row.name === 'post.save') entry.saves += n
    else entry.shares += n
    scored.set(key, entry)
  }

  const topPosts = [...scored.values()]
    .map((row) => ({
      ...row,
      score: row.views + row.saves * 3 + row.shares * 2,
    }))
    .sort((a, b) => b.score - a.score || b.saves - a.saves)
    .slice(0, 20)

  return { window, totals, byPlatform, byContentType, topPosts }
}

export interface PostAnalytics {
  platform: string
  bookmarkId: string
  window: AnalyticsWindow
  totals: Record<string, number>
}

export function getPostAnalytics(
  platform: string,
  bookmarkId: string,
  window: AnalyticsWindow = 'week',
): PostAnalytics {
  const since = sinceIso(window)
  const rows = db
    .select({
      name: analyticsEvents.name,
      count: sql<number>`count(*)`.as('count'),
    })
    .from(analyticsEvents)
    .where(
      since
        ? and(
            eq(analyticsEvents.platform, platform),
            eq(analyticsEvents.bookmarkId, bookmarkId),
            gt(analyticsEvents.createdAt, since),
          )
        : and(eq(analyticsEvents.platform, platform), eq(analyticsEvents.bookmarkId, bookmarkId)),
    )
    .groupBy(analyticsEvents.name)
    .all()

  const totals: Record<string, number> = {}
  for (const row of rows) totals[row.name] = Number(row.count) || 0
  return { platform, bookmarkId, window, totals }
}

/** Test helper — unused in prod, keeps unused-import of `eq` honest if we add filters later. */
export function analyticsEventCount(name: AnalyticEventName, sinceIsoStamp?: string): number {
  const rows = db
    .select({ count: sql<number>`count(*)`.as('count') })
    .from(analyticsEvents)
    .where(
      sinceIsoStamp
        ? and(eq(analyticsEvents.name, name), gt(analyticsEvents.createdAt, sinceIsoStamp))
        : eq(analyticsEvents.name, name),
    )
    .all()
  return Number(rows[0]?.count) || 0
}
