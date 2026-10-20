import { db } from '@/lib/db'
import {
  activity,
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
import { getPostAnalytics, type AnalyticsWindow } from '@/lib/analytics/query'
import { getUserIdForUsername } from '@/lib/users/lookup'
import { isUserBanned } from './moderation'
import { previewPath } from '@/lib/activity/preview-path'

function count(n: number | null | undefined): number {
  return Number(n) || 0
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
  /** Notes they left on shared saves (a count). */
  notes: number
  phones: number
  /** Who brought them in (display name, else username), when known. */
  invitedBy: string | null
  avatarUrl: string | null
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
  const [extra] = db.all<{
    notes: number
    phones: number
    inviter: string | null
    avatar: string | null
  }>(sql`
    SELECT
      (SELECT COUNT(*) FROM bookmarks WHERE user_id = ${user.id} AND note IS NOT NULL AND is_private = 0) AS notes,
      (SELECT COUNT(*) FROM access_keys WHERE user_id = ${user.id} AND scope = 'phone') AS phones,
      (SELECT COALESCE(m.display_name, m.username) FROM invites i JOIN users m ON m.id = i.created_by
         WHERE i.used_by = ${user.id} ORDER BY i.used_at LIMIT 1) AS inviter,
      (SELECT CASE WHEN p.value = 'generated' THEN NULL ELSE u.avatar_url END FROM users u
         LEFT JOIN user_preferences p ON p.user_id = u.id AND p.key = 'avatarSource'
         WHERE u.id = ${user.id}) AS avatar`)

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
    notes: count(extra?.notes),
    phones: count(extra?.phones),
    invitedBy: extra?.inviter ?? null,
    avatarUrl: extra?.avatar ?? null,
  }
}
