import { randomBytes } from 'crypto'
import { and, desc, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { bookmarks, postReactions, userPreferences, users } from '@/lib/db/schema'
import { countReaction, reactionKind } from '@/lib/admin/counts'
import { readPostModeration } from '@/lib/admin/moderation'
import { memberAvatar, seenBy } from '@/lib/people/savers'
import { captureException } from '@/lib/sentry'
import type { ReactionEmoji } from '@/lib/moments/reactions'
import { limitReaction, parseReaction, type ReactionError } from './parse'

/**
 * Reactions kept on posts (`post_reactions`, docs/specs/phone-app.md →
 * Reactions). Named to friends, never to strangers:
 *
 * - Only members see them, with names and faces; nothing here is ever sent to
 *   a signed-out viewer or a public page (no counts either).
 * - A post's reactions are visible to members who can see the post
 *   (`seenBy`: anyone's visible save, or their own save). A post saved only
 *   privately keeps its reactions to its owner.
 * - Banned members' reactions are never shown; admin-hidden posts show none.
 *   Moderation is read fail-closed: when it can't be read, nothing is shown
 *   or kept.
 * - Each reaction is also counted for admins (`reaction_counts`).
 */

/** The newest this many are returned, oldest first. */
export const REACTIONS_SHOWN = 100

const REACTION_ID = /^r[0-9a-z]{1,40}$/

export type PostReaction = {
  id: string
  emoji: string | null
  text: string | null
  at: string
  saver: { username: string; name: string | null; avatarUrl: string | null; isYou: boolean }
}

/** A fresh reaction id (`r` + time + random), shared by Live and kept reactions. */
export function newReactionId(): string {
  return `r${Date.now().toString(36)}${randomBytes(6).toString('hex')}`
}

/** A reaction id as the delete routes accept it. */
export function validReactionId(id: unknown): id is string {
  return typeof id === 'string' && REACTION_ID.test(id)
}

/** Whether the viewer can see a save of the post (anyone's visible save, or their own). */
export function canSeePost(viewerId: string, platform: string, id: string): boolean {
  if (!viewerId) return false
  const rows = db
    .select({ one: sql<number>`1` })
    .from(bookmarks)
    .where(and(eq(bookmarks.platform, platform), eq(bookmarks.id, id), seenBy(viewerId)))
    .limit(1)
    .all()
  return rows.length > 0
}

/** Admin-hidden? Throws when moderation can't be read (fail closed). */
function isHidden(platform: string, id: string): boolean {
  const moderation = readPostModeration(platform, id)
  if (!moderation.ok) throw moderation.error
  return moderation.value
}

/**
 * A post's reactions for a member, oldest first (the newest
 * `REACTIONS_SHOWN`), or null when they can't see any save of it. Hidden
 * posts have none.
 */
export function listPostReactions(
  viewerId: string,
  platform: string,
  id: string,
): PostReaction[] | null {
  if (!canSeePost(viewerId, platform, id)) return null
  if (isHidden(platform, id)) return []
  const rows = db
    .select({
      id: postReactions.id,
      userId: postReactions.userId,
      emoji: postReactions.emoji,
      text: postReactions.text,
      at: postReactions.createdAt,
      username: users.username,
      name: users.displayName,
      avatarUrl: users.avatarUrl,
      avatarSource: userPreferences.value,
    })
    .from(postReactions)
    .innerJoin(users, eq(users.id, postReactions.userId))
    .leftJoin(
      userPreferences,
      and(
        eq(userPreferences.userId, postReactions.userId),
        eq(userPreferences.key, 'avatarSource'),
      ),
    )
    .where(
      and(
        eq(postReactions.platform, platform),
        eq(postReactions.postId, id),
        sql`NOT EXISTS (SELECT 1 FROM user_bans WHERE user_bans.user_id = ${postReactions.userId})`,
      ),
    )
    .orderBy(desc(postReactions.createdAt), desc(sql`${postReactions}.rowid`))
    .limit(REACTIONS_SHOWN)
    .all()
  return rows.reverse().map((r) => ({
    id: r.id,
    emoji: r.emoji ?? null,
    text: r.emoji ? null : (r.text ?? null),
    at: r.at,
    saver: {
      username: r.username,
      name: r.name ?? null,
      avatarUrl: memberAvatar(r.avatarUrl, r.avatarSource),
      isYou: r.userId === viewerId,
    },
  }))
}

type Row = {
  id: string
  userId: string
  platform: string
  postId: string
  emoji: ReactionEmoji | null
  text: string | null
  at: string
}

function insert(row: Row): void {
  db.insert(postReactions)
    .values({
      id: row.id,
      userId: row.userId,
      platform: row.platform,
      postId: row.postId,
      emoji: row.emoji,
      text: row.emoji ? null : row.text,
      createdAt: row.at,
    })
    .run()
}

/**
 * Keep a Live reaction on its post, under the id the room saw. Best effort:
 * the room still gets it when this fails. Only kept when the member can see
 * the post and it isn't hidden. True when kept.
 */
export function storeLiveReaction(row: Row): boolean {
  try {
    if (!canSeePost(row.userId, row.platform, row.postId)) return false
    if (isHidden(row.platform, row.postId)) return false
    insert(row)
    return true
  } catch (error) {
    captureException(error, { endpoint: 'moments.react.keep' })
    return false
  }
}

export type AddResult = { ok: true; id: string; at: string } | ReactionError

/** `{ platform, id, emoji }` or `{ platform, id, text }` from a member who can see the post. */
export function addPostReaction(userId: string, body: unknown): AddResult {
  const parsed = parseReaction(body)
  if ('ok' in parsed) return parsed
  const limited = limitReaction(userId, parsed.text !== null)
  if (limited) return limited
  const notFound: ReactionError = {
    ok: false,
    status: 404,
    code: 'not_found',
    error: 'That post isn’t here.',
  }
  if (!canSeePost(userId, parsed.platform, parsed.id)) return notFound
  if (isHidden(parsed.platform, parsed.id)) return notFound
  const row: Row = {
    id: newReactionId(),
    userId,
    platform: parsed.platform,
    postId: parsed.id,
    emoji: parsed.emoji,
    text: parsed.text,
    at: new Date().toISOString(),
  }
  insert(row)
  // Counted for admins (who, which kind, which day), like Live.
  countReaction(userId, reactionKind(parsed.emoji))
  return { ok: true, id: row.id, at: row.at }
}

/** Remove one of your own reactions. False when there's no such reaction of yours. */
export function deletePostReaction(userId: string, id: string): boolean {
  if (!validReactionId(id)) return false
  const result = db
    .delete(postReactions)
    .where(and(eq(postReactions.id, id), eq(postReactions.userId, userId)))
    .run()
  return result.changes > 0
}
