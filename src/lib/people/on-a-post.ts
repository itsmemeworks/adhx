import { and, desc, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { postViews, userPreferences, users } from '@/lib/db/schema'
import { readPostModeration } from '@/lib/admin/moderation'
import { canSeePost, listPostReactions, type PostReaction } from '@/lib/reactions/post-reactions'
import { memberAvatar, saversFor, type Saver } from './savers'

/**
 * Who's on a post, for the phone player's face row (board 15.9): who saved
 * it, who reacted and who watched it. Members only, and only for a post the
 * viewer can see (anyone's visible save, or their own). Banned members never
 * appear; an admin-hidden post has no one on it. "Watched" is a `post_views`
 * row (2 s on screen, or swiped past) by another member: it's shown to the
 * people on this ADHX who can see the post, never to strangers.
 */

export type Watcher = {
  username: string
  name: string | null
  avatarUrl: string | null
  /** When they watched it (ISO). */
  at: string
  isYou: boolean
}

export type OnAPost = { savers: Saver[]; reactions: PostReaction[]; watched: Watcher[] }

/** The newest this many watchers are returned. */
export const WATCHERS_SHOWN = 50

export function onAPost(viewerId: string, platform: string, id: string): OnAPost | null {
  if (!canSeePost(viewerId, platform, id)) return null
  const moderation = readPostModeration(platform, id)
  if (!moderation.ok) throw moderation.error
  if (moderation.value) return { savers: [], reactions: [], watched: [] }
  const savers = saversFor([{ platform, id }], viewerId).get(`${platform}:${id}`) ?? []
  const reactions = listPostReactions(viewerId, platform, id) ?? []
  const rows = db
    .select({
      userId: postViews.userId,
      at: postViews.seenAt,
      username: users.username,
      name: users.displayName,
      avatarUrl: users.avatarUrl,
      avatarSource: userPreferences.value,
    })
    .from(postViews)
    .innerJoin(users, eq(users.id, postViews.userId))
    .leftJoin(
      userPreferences,
      and(eq(userPreferences.userId, postViews.userId), eq(userPreferences.key, 'avatarSource')),
    )
    .where(
      and(
        eq(postViews.platform, platform),
        eq(postViews.postId, id),
        sql`NOT EXISTS (SELECT 1 FROM user_bans WHERE user_bans.user_id = ${postViews.userId})`,
      ),
    )
    .orderBy(desc(postViews.seenAt))
    .limit(WATCHERS_SHOWN)
    .all()
  const watched = rows.map((r) => ({
    username: r.username,
    name: r.name ?? null,
    avatarUrl: memberAvatar(r.avatarUrl, r.avatarSource),
    at: r.at,
    isYou: r.userId === viewerId,
  }))
  return { savers, reactions, watched }
}
