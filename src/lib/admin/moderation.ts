import { db, runInTransaction } from '@/lib/db'
import {
  activity,
  adminAudit,
  collectionAggregates,
  collectionEvents,
  moderatedPosts,
  userBans,
} from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { isAdminUserId } from './guard'
import { getUserIdForUsername, getUsernameForUserId } from '@/lib/users/lookup'
import { previewPath } from '@/lib/activity/preview-path'

const REASON_CAP = 200

export class ModerationStoreUnavailableError extends Error {
  constructor(operation: string, options?: { cause?: unknown }) {
    super(`Moderation store unavailable while ${operation}`, options)
    this.name = 'ModerationStoreUnavailableError'
  }
}

export type ModerationReadResult<T> =
  { ok: true; value: T } | { ok: false; error: ModerationStoreUnavailableError }

/** Stable internal cache key for one or more moderation sets. */
export function moderationStateFingerprint(...sets: ReadonlySet<string>[]): string {
  return sets.map((set) => [...set].sort().join('\u0000')).join('\u0001')
}

function moderationRead<T>(operation: string, read: () => T): ModerationReadResult<T> {
  try {
    return { ok: true, value: read() }
  } catch (cause) {
    return {
      ok: false,
      error: new ModerationStoreUnavailableError(operation, { cause }),
    }
  }
}

function requireModerationRead<T>(result: ModerationReadResult<T>): T {
  if (!result.ok) throw result.error
  return result.value
}

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

export function readPostModeration(
  platform: string,
  bookmarkId: string,
): ModerationReadResult<boolean> {
  return moderationRead('reading post moderation', () => {
    const [row] = db
      .select({ hidden: moderatedPosts.hidden })
      .from(moderatedPosts)
      .where(and(eq(moderatedPosts.platform, platform), eq(moderatedPosts.bookmarkId, bookmarkId)))
      .limit(1)
      .all()
    return row?.hidden === 1
  })
}

export function readModeratedPostKeys(): ModerationReadResult<Set<string>> {
  return moderationRead('listing moderated posts', () => {
    const rows = db
      .select({ platform: moderatedPosts.platform, bookmarkId: moderatedPosts.bookmarkId })
      .from(moderatedPosts)
      .where(eq(moderatedPosts.hidden, 1))
      .all()
    return new Set(rows.map((r) => `${r.platform}:${r.bookmarkId}`))
  })
}

export function hidePost(opts: {
  platform: string
  bookmarkId: string
  hidden: boolean
  actorUserId: string
  reason?: string | null
  contentType?: string | null
}): { updated: number; hidden: boolean } {
  const { platform, bookmarkId, hidden, actorUserId } = opts
  const reason = cleanReason(opts.reason)
  const createdAt = nowIso()

  return runInTransaction(() => {
    if (hidden) {
      db.insert(moderatedPosts)
        .values({
          platform,
          bookmarkId,
          hidden: 1,
          reason,
          contentType: opts.contentType ?? null,
          createdAt,
          createdBy: actorUserId,
        })
        .onConflictDoUpdate({
          target: [moderatedPosts.platform, moderatedPosts.bookmarkId],
          set: {
            hidden: 1,
            reason,
            ...(opts.contentType ? { contentType: opts.contentType } : {}),
            createdAt,
            createdBy: actorUserId,
          },
        })
        .run()
    } else {
      db.delete(moderatedPosts)
        .where(
          and(eq(moderatedPosts.platform, platform), eq(moderatedPosts.bookmarkId, bookmarkId)),
        )
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
      contentType: opts.contentType ?? null,
    })

    return { updated: result.changes ?? 0, hidden }
  })
}

export function readUserBan(userId: string | null | undefined): ModerationReadResult<boolean> {
  if (!userId) return { ok: true, value: false }
  return moderationRead('reading user ban', () => {
    const [row] = db
      .select({ userId: userBans.userId })
      .from(userBans)
      .where(eq(userBans.userId, userId))
      .limit(1)
      .all()
    return !!row
  })
}

export function isUserBanned(userId: string | null | undefined): boolean {
  return requireModerationRead(readUserBan(userId))
}

export function readBannedUserIds(): ModerationReadResult<Set<string>> {
  return moderationRead('listing banned users', () => {
    const rows = db.select({ userId: userBans.userId }).from(userBans).all()
    return new Set(rows.map((r) => r.userId))
  })
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
  if (await isAdminUserId(targetUserId)) {
    return { ok: false, error: 'Cannot ban an admin', status: 400 }
  }

  const reason = cleanReason(opts.reason)
  const createdAt = nowIso()
  runInTransaction(() => {
    if (opts.banned) {
      db.insert(userBans)
        .values({
          userId: targetUserId,
          reason,
          createdAt,
          createdBy: opts.actorUserId,
        })
        .onConflictDoUpdate({
          target: userBans.userId,
          set: { reason, createdAt, createdBy: opts.actorUserId },
        })
        .run()
      writeAudit(opts.actorUserId, 'ban_user', { username: targetUsername })
    } else {
      db.delete(userBans).where(eq(userBans.userId, targetUserId)).run()
      writeAudit(opts.actorUserId, 'unban_user', { username: targetUsername })
    }
  })

  return { ok: true, username: targetUsername, banned: opts.banned }
}

export function hidePlaylistEvents(opts: {
  ownerUserId: string
  tag: string
  hidden: boolean
  actorUserId: string
  username: string
}): { updated: number } {
  return runInTransaction(() => {
    const result = db
      .update(collectionEvents)
      .set({ hidden: opts.hidden ? 1 : 0 })
      .where(
        and(eq(collectionEvents.ownerUserId, opts.ownerUserId), eq(collectionEvents.tag, opts.tag)),
      )
      .run()
    db.insert(collectionAggregates)
      .values({
        ownerUserId: opts.ownerUserId,
        tag: opts.tag,
        hidden: opts.hidden ? 1 : 0,
      })
      .onConflictDoUpdate({
        target: [collectionAggregates.ownerUserId, collectionAggregates.tag],
        set: { hidden: opts.hidden ? 1 : 0 },
      })
      .run()
    writeAudit(opts.actorUserId, opts.hidden ? 'hide_playlist' : 'unhide_playlist', {
      username: opts.username,
      tag: opts.tag,
    })
    return { updated: result.changes ?? 0 }
  })
}

export function previewPathFor(
  platform: string,
  author: string | null,
  id: string,
  contentType?: string | null,
): string {
  return previewPath(platform, author || 'unknown', id, contentType)
}
