import { db } from '@/lib/db'
import {
  activity,
  adminAudit,
  bookmarkTags,
  bookmarks,
  moderatedPosts,
  syncLogs,
  tagShares,
  userBans,
  userIdentities,
  users,
} from '@/lib/db/schema'
import { and, desc, eq, sql } from 'drizzle-orm'
import { getAnalyticsSummary, getPostAnalytics, type AnalyticsWindow } from '@/lib/analytics/query'
import { getUserIdForUsername } from '@/lib/users/lookup'
import { isUserBanned, previewPathFor } from './moderation'
import { previewPath } from '@/lib/activity/preview-path'

export interface AdminOverview {
  generatedAt: string
  window: AnalyticsWindow
  analytics: ReturnType<typeof getAnalyticsSummary>
  stats: {
    users: number
    bookmarks: number
    activityVisible: number
    activityHidden: number
    publicPlaylists: number
    bannedUsers: number
    moderatedPosts: number
  }
  hiddenPosts: Array<{
    platform: string
    bookmarkId: string
    reason: string | null
    createdAt: string
    previewPath: string
  }>
  bannedUsers: Array<{
    username: string
    reason: string | null
    createdAt: string
  }>
  recentAudit: Array<{
    action: string
    target: Record<string, unknown> | null
    createdAt: string
    actorUsername: string | null
  }>
}

function count(n: number | null | undefined): number {
  return Number(n) || 0
}

export function getAdminOverview(window: AnalyticsWindow = 'week'): AdminOverview {
  const usersN = db
    .select({ n: sql<number>`count(*)`.as('n') })
    .from(users)
    .all()
  const bookmarksN = db
    .select({ n: sql<number>`count(*)`.as('n') })
    .from(bookmarks)
    .all()
  const activityVisible = db
    .select({ n: sql<number>`count(*)`.as('n') })
    .from(activity)
    .where(eq(activity.hidden, 0))
    .all()
  const activityHidden = db
    .select({ n: sql<number>`count(*)`.as('n') })
    .from(activity)
    .where(eq(activity.hidden, 1))
    .all()
  const publicPlaylists = db
    .select({ n: sql<number>`count(*)`.as('n') })
    .from(tagShares)
    .where(eq(tagShares.isPublic, true))
    .all()
  const bannedN = db
    .select({ n: sql<number>`count(*)`.as('n') })
    .from(userBans)
    .all()
  const moderatedN = db
    .select({ n: sql<number>`count(*)`.as('n') })
    .from(moderatedPosts)
    .where(eq(moderatedPosts.hidden, 1))
    .all()

  const hiddenRows = db
    .select({
      platform: moderatedPosts.platform,
      bookmarkId: moderatedPosts.bookmarkId,
      reason: moderatedPosts.reason,
      contentType: moderatedPosts.contentType,
      createdAt: moderatedPosts.createdAt,
    })
    .from(moderatedPosts)
    .where(eq(moderatedPosts.hidden, 1))
    .orderBy(desc(moderatedPosts.createdAt))
    .limit(50)
    .all()

  const displayByPost = new Map<string, { author: string; contentType: string | null }>()
  if (hiddenRows.length > 0) {
    const displays = db
      .select({
        platform: activity.platform,
        bookmarkId: activity.bookmarkId,
        author: activity.author,
        contentType: activity.contentType,
      })
      .from(activity)
      .where(eq(activity.hidden, 1))
      .all()
    for (const row of displays) {
      const key = `${row.platform}:${row.bookmarkId}`
      const current = displayByPost.get(key)
      if (row.author && (!current || row.contentType === 'photo')) {
        displayByPost.set(key, { author: row.author, contentType: row.contentType })
      }
    }
  }

  const bannedRows = db
    .select({
      userId: userBans.userId,
      reason: userBans.reason,
      createdAt: userBans.createdAt,
    })
    .from(userBans)
    .orderBy(desc(userBans.createdAt))
    .limit(50)
    .all()

  const bannedUsers = bannedRows.map((row) => {
    const [user] = db
      .select({ username: users.username })
      .from(users)
      .where(eq(users.id, row.userId))
      .limit(1)
      .all()
    return {
      username: user?.username || row.userId,
      reason: row.reason,
      createdAt: row.createdAt,
    }
  })

  const auditRows = db
    .select({
      actorUserId: adminAudit.actorUserId,
      action: adminAudit.action,
      target: adminAudit.target,
      createdAt: adminAudit.createdAt,
    })
    .from(adminAudit)
    .orderBy(desc(adminAudit.createdAt))
    .limit(30)
    .all()

  const recentAudit = auditRows.map((row) => {
    const [actor] = db
      .select({ username: users.username })
      .from(users)
      .where(eq(users.id, row.actorUserId))
      .limit(1)
      .all()
    let target: Record<string, unknown> | null = null
    if (row.target) {
      try {
        target = JSON.parse(row.target) as Record<string, unknown>
      } catch {
        target = null
      }
    }
    return {
      action: row.action,
      target,
      createdAt: row.createdAt,
      actorUsername: actor?.username ?? null,
    }
  })

  return {
    generatedAt: new Date().toISOString(),
    window,
    analytics: getAnalyticsSummary(window),
    stats: {
      users: count(usersN[0]?.n),
      bookmarks: count(bookmarksN[0]?.n),
      activityVisible: count(activityVisible[0]?.n),
      activityHidden: count(activityHidden[0]?.n),
      publicPlaylists: count(publicPlaylists[0]?.n),
      bannedUsers: count(bannedN[0]?.n),
      moderatedPosts: count(moderatedN[0]?.n),
    },
    hiddenPosts: hiddenRows.map((row) => {
      const display = displayByPost.get(`${row.platform}:${row.bookmarkId}`)
      return {
        platform: row.platform,
        bookmarkId: row.bookmarkId,
        reason: row.reason,
        createdAt: row.createdAt,
        previewPath: previewPathFor(
          row.platform,
          display?.author || null,
          row.bookmarkId,
          display?.contentType || row.contentType,
        ),
      }
    }),
    bannedUsers,
    recentAudit,
  }
}

export interface InspectedPost {
  platform: string
  bookmarkId: string
  previewPath: string
  hidden: boolean
  reason: string | null
  author: string | null
  authorName: string | null
  text: string | null
  thumbnailUrl: string | null
  contentType: string | null
  saverCount: number
  pulseEvents: number
  publicPlaylists: Array<{ username: string; tag: string }>
  analytics: ReturnType<typeof getPostAnalytics>
}

export function inspectPost(
  platform: string,
  bookmarkId: string,
  window: AnalyticsWindow,
  contentTypeHint?: string | null,
): InspectedPost {
  const [mod] = db
    .select()
    .from(moderatedPosts)
    .where(and(eq(moderatedPosts.platform, platform), eq(moderatedPosts.bookmarkId, bookmarkId)))
    .limit(1)
    .all()

  const [pulse] = db
    .select({
      author: activity.author,
      authorName: activity.authorName,
      text: activity.text,
      thumbnailUrl: activity.thumbnailUrl,
      contentType: activity.contentType,
      hidden: activity.hidden,
    })
    .from(activity)
    .where(and(eq(activity.platform, platform), eq(activity.bookmarkId, bookmarkId)))
    .orderBy(desc(activity.createdAt))
    .limit(1)
    .all()

  const [saved] = db
    .select({
      author: bookmarks.author,
      authorName: bookmarks.authorName,
      text: bookmarks.text,
      category: bookmarks.category,
    })
    .from(bookmarks)
    .where(and(eq(bookmarks.platform, platform), eq(bookmarks.id, bookmarkId)))
    .limit(1)
    .all()

  const [savers] = db
    .select({ n: sql<number>`count(distinct ${bookmarks.userId})`.as('n') })
    .from(bookmarks)
    .where(and(eq(bookmarks.platform, platform), eq(bookmarks.id, bookmarkId)))
    .all()

  const [pulseCount] = db
    .select({ n: sql<number>`count(*)`.as('n') })
    .from(activity)
    .where(and(eq(activity.platform, platform), eq(activity.bookmarkId, bookmarkId)))
    .all()

  const playlistRows = db
    .select({
      userId: bookmarkTags.userId,
      tag: bookmarkTags.tag,
    })
    .from(bookmarkTags)
    .innerJoin(
      tagShares,
      and(eq(tagShares.userId, bookmarkTags.userId), eq(tagShares.tag, bookmarkTags.tag)),
    )
    .where(
      and(
        eq(bookmarkTags.platform, platform),
        eq(bookmarkTags.bookmarkId, bookmarkId),
        eq(tagShares.isPublic, true),
      ),
    )
    .all()

  const publicPlaylists: Array<{ username: string; tag: string }> = []
  const seen = new Set<string>()
  for (const row of playlistRows) {
    const [user] = db
      .select({ username: users.username })
      .from(users)
      .where(eq(users.id, row.userId))
      .limit(1)
      .all()
    if (!user?.username) continue
    const key = `${user.username}:${row.tag}`
    if (seen.has(key)) continue
    seen.add(key)
    publicPlaylists.push({ username: user.username, tag: row.tag })
  }

  const author = pulse?.author || saved?.author || null
  const contentType =
    pulse?.contentType || saved?.category || mod?.contentType || contentTypeHint || null
  return {
    platform,
    bookmarkId,
    previewPath: previewPath(platform, author || 'unknown', bookmarkId, contentType),
    hidden: mod?.hidden === 1 || pulse?.hidden === 1,
    reason: mod?.reason ?? null,
    author,
    authorName: pulse?.authorName || saved?.authorName || null,
    text: pulse?.text || saved?.text || null,
    thumbnailUrl: pulse?.thumbnailUrl ?? null,
    contentType,
    saverCount: count(savers?.n),
    pulseEvents: count(pulseCount?.n),
    publicPlaylists,
    analytics: getPostAnalytics(platform, bookmarkId, window),
  }
}

export interface InspectedUser {
  username: string
  displayName: string | null
  createdAt: string | null
  isAdmin: boolean
  isSelf: boolean
  banned: boolean
  banReason: string | null
  bannedAt: string | null
  identities: { x: boolean; email: boolean }
  bookmarkCount: number
  publicPlaylistCount: number
  lastSyncAt: string | null
}

export async function inspectUser(
  username: string,
  actorUserId?: string | null,
): Promise<InspectedUser | null> {
  const trimmed = username.trim()
  if (!trimmed) return null

  let [user] = db
    .select({
      id: users.id,
      username: users.username,
      role: users.role,
      displayName: users.displayName,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.username, trimmed))
    .limit(1)
    .all()

  if (!user && trimmed !== trimmed.toLowerCase()) {
    ;[user] = db
      .select({
        id: users.id,
        username: users.username,
        role: users.role,
        displayName: users.displayName,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.username, trimmed.toLowerCase()))
      .limit(1)
      .all()
  }

  if (!user) {
    const id = await getUserIdForUsername(trimmed)
    if (!id) return null
    ;[user] = db
      .select({
        id: users.id,
        username: users.username,
        role: users.role,
        displayName: users.displayName,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1)
      .all()
  }
  if (!user) return null

  const identities = db
    .select({ provider: userIdentities.provider })
    .from(userIdentities)
    .where(eq(userIdentities.userId, user.id))
    .all()

  const [bookmarkCount] = db
    .select({ n: sql<number>`count(*)`.as('n') })
    .from(bookmarks)
    .where(eq(bookmarks.userId, user.id))
    .all()

  const [publicPlaylistCount] = db
    .select({ n: sql<number>`count(*)`.as('n') })
    .from(tagShares)
    .where(and(eq(tagShares.userId, user.id), eq(tagShares.isPublic, true)))
    .all()

  const [lastSync] = db
    .select({ completedAt: syncLogs.completedAt })
    .from(syncLogs)
    .where(eq(syncLogs.userId, user.id))
    .orderBy(desc(syncLogs.startedAt))
    .limit(1)
    .all()

  const [ban] = db.select().from(userBans).where(eq(userBans.userId, user.id)).limit(1).all()

  return {
    username: user.username,
    displayName: user.displayName,
    createdAt: user.createdAt ?? null,
    isAdmin: user.role === 'admin',
    isSelf: !!actorUserId && user.id === actorUserId,
    banned: !!ban || isUserBanned(user.id),
    banReason: ban?.reason ?? null,
    bannedAt: ban?.createdAt ?? null,
    identities: {
      x: identities.some((i) => i.provider === 'x'),
      email: identities.some((i) => i.provider === 'email'),
    },
    bookmarkCount: count(bookmarkCount?.n),
    publicPlaylistCount: count(publicPlaylistCount?.n),
    lastSyncAt: lastSync?.completedAt ?? null,
  }
}
