import { db } from '@/lib/db'
import { activity, adminAudit, collectionEvents, moderatedPosts, userBans } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { isAdminUsername } from './guard'
import { getUserIdForUsername, getUsernameForUserId } from '@/lib/users/lookup'
import { previewPath } from '@/lib/activity/preview-path'

const REASON_CAP = 200

export type AdminAuditAction =
  'hide_post' | 'unhide_post' | 'hide_playlist' | 'unhide_playlist' | 'ban_user' | 'unban_user'

function nowIso(): string {
  return new Date().toISOString()
}

function cleanReason(reason: string | null | undefined): string | null {
  if (!reason) return null
  const trimmed = reason.replace(/\s+/g, ' ').trim()
  if (!trimmed) return null
  return trimmed.length > REASON_CAP ? trimmed.slice(0, REASON_CAP) : trimmed
}

export function writeAudit(
  actorUserId: string,
  action: AdminAuditAction,
  target: Record<string, unknown>,
): void {
  db.insert(adminAudit)
    .values({
      actorUserId,
      action,
      target: JSON.stringify(target),
      createdAt: nowIso(),
    })
    .run()
}

export function isPostModerated(platform: string, bookmarkId: string): boolean {
  try {
    const [row] = db
      .select({ hidden: moderatedPosts.hidden })
      .from(moderatedPosts)
      .where(and(eq(moderatedPosts.platform, platform), eq(moderatedPosts.bookmarkId, bookmarkId)))
      .limit(1)
      .all()
    return row?.hidden === 1
  } catch {
    return false
  }
}

export function listModeratedPostKeys(): Set<string> {
  try {
    const rows = db
      .select({ platform: moderatedPosts.platform, bookmarkId: moderatedPosts.bookmarkId })
      .from(moderatedPosts)
      .where(eq(moderatedPosts.hidden, 1))
      .all()
    return new Set(rows.map((r) => `${r.platform}:${r.bookmarkId}`))
  } catch {
    return new Set()
  }
}

export function hidePost(opts: {
  platform: string
  bookmarkId: string
  hidden: boolean
  actorUserId: string
  reason?: string | null
}): { updated: number; hidden: boolean } {
  const { platform, bookmarkId, hidden, actorUserId } = opts
  const reason = cleanReason(opts.reason)
  const createdAt = nowIso()

  if (hidden) {
    db.insert(moderatedPosts)
      .values({
        platform,
        bookmarkId,
        hidden: 1,
        reason,
        createdAt,
        createdBy: actorUserId,
      })
      .onConflictDoUpdate({
        target: [moderatedPosts.platform, moderatedPosts.bookmarkId],
        set: { hidden: 1, reason, createdAt, createdBy: actorUserId },
      })
      .run()
  } else {
    db.delete(moderatedPosts)
      .where(and(eq(moderatedPosts.platform, platform), eq(moderatedPosts.bookmarkId, bookmarkId)))
      .run()
  }

  const result = db
    .update(activity)
    .set({ hidden: hidden ? 1 : 0 })
    .where(and(eq(activity.platform, platform), eq(activity.bookmarkId, bookmarkId)))
    .run()

  writeAudit(actorUserId, hidden ? 'hide_post' : 'unhide_post', {
    platform,
    id: bookmarkId,
    reason,
  })

  return { updated: result.changes ?? 0, hidden }
}

export function isUserBanned(userId: string | null | undefined): boolean {
  if (!userId) return false
  try {
    const [row] = db
      .select({ userId: userBans.userId })
      .from(userBans)
      .where(eq(userBans.userId, userId))
      .limit(1)
      .all()
    return !!row
  } catch {
    return false
  }
}

export function listBannedUserIds(): Set<string> {
  try {
    const rows = db.select({ userId: userBans.userId }).from(userBans).all()
    return new Set(rows.map((r) => r.userId))
  } catch {
    return new Set()
  }
}

export type BanResult =
  { ok: true; username: string; banned: boolean } | { ok: false; error: string; status: number }

export async function setUserBanned(opts: {
  username: string
  banned: boolean
  actorUserId: string
  actorUsername: string
  reason?: string | null
}): Promise<BanResult> {
  const username = opts.username.trim()
  if (!username) return { ok: false, error: 'username is required', status: 400 }

  const targetUserId = await getUserIdForUsername(username)
  if (!targetUserId) return { ok: false, error: 'User not found', status: 404 }

  if (targetUserId === opts.actorUserId) {
    return { ok: false, error: 'You cannot ban your own account', status: 400 }
  }
  const targetUsername = (await getUsernameForUserId(targetUserId)) || username
  if (isAdminUsername(targetUsername)) {
    return { ok: false, error: 'Cannot ban an admin', status: 400 }
  }

  if (opts.banned) {
    db.insert(userBans)
      .values({
        userId: targetUserId,
        reason: cleanReason(opts.reason),
        createdAt: nowIso(),
        createdBy: opts.actorUserId,
      })
      .onConflictDoUpdate({
        target: userBans.userId,
        set: { reason: cleanReason(opts.reason), createdAt: nowIso(), createdBy: opts.actorUserId },
      })
      .run()
    writeAudit(opts.actorUserId, 'ban_user', { username: targetUsername })
  } else {
    db.delete(userBans).where(eq(userBans.userId, targetUserId)).run()
    writeAudit(opts.actorUserId, 'unban_user', { username: targetUsername })
  }

  return { ok: true, username: targetUsername, banned: opts.banned }
}

export function hidePlaylistEvents(opts: {
  ownerUserId: string
  tag: string
  hidden: boolean
  actorUserId: string
  username: string
}): { updated: number } {
  const result = db
    .update(collectionEvents)
    .set({ hidden: opts.hidden ? 1 : 0 })
    .where(
      and(eq(collectionEvents.ownerUserId, opts.ownerUserId), eq(collectionEvents.tag, opts.tag)),
    )
    .run()
  writeAudit(opts.actorUserId, opts.hidden ? 'hide_playlist' : 'unhide_playlist', {
    username: opts.username,
    tag: opts.tag,
  })
  return { updated: result.changes ?? 0 }
}

export function previewPathFor(platform: string, author: string | null, id: string): string {
  return previewPath(platform, author || 'unknown', id)
}
