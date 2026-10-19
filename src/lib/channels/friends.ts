import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { visibleSave } from '@/lib/people/savers'
import { newTo } from '@/lib/people/seen'
import type { Member } from '@/lib/people/members'

/**
 * "Your people": one channel per friend, made of everything they saved that
 * other members may see (`visibleSave`: never their private saves, quoted
 * copies, or anything once they're banned). Members only, and never the
 * viewer's own saves as a friend.
 */

const COVER_POSTS = 3
const QUEUE_LIMIT = 200

export interface FriendChannelView {
  username: string
  name: string | null
  avatarUrl: string | null
  /** Their saves the viewer can see. */
  size: number
  /** Of those, the ones the viewer hasn't saved (or seen, once views are kept). */
  newCount: number
  /** `platform:id` of their newest few, for covers. */
  coverKeys: string[]
}

/** The other members with visible saves, most recent saver first. */
export function friendChannels(viewerId: string, members: Member[]): FriendChannelView[] {
  if (!viewerId) return []
  const friends = members.filter((m) => !m.isYou && m.saves > 0)
  if (friends.length === 0) return []
  const ids = sql.join(
    friends.map((f) => sql`${f.userId}`),
    sql`, `,
  )
  const fresh = db.all<{ user_id: string; n: number }>(
    sql`SELECT b.user_id, COUNT(*) AS n FROM bookmarks b
        WHERE b.user_id IN (${ids}) AND ${visibleSave('b')} AND ${newTo(viewerId, 'b')}
        GROUP BY b.user_id`,
  )
  const newBy = new Map(fresh.map((r) => [r.user_id, Number(r.n) || 0]))
  const covers = db.all<{ user_id: string; platform: string; id: string }>(
    sql`SELECT user_id, platform, id FROM (
          SELECT b.user_id, b.platform, b.id,
                 ROW_NUMBER() OVER (PARTITION BY b.user_id ORDER BY b.processed_at DESC, b.id DESC) AS rn
          FROM bookmarks b
          WHERE b.user_id IN (${ids}) AND ${visibleSave('b')}
        ) WHERE rn <= ${COVER_POSTS}
        ORDER BY rn`,
  )
  const coversBy = new Map<string, string[]>()
  for (const c of covers) {
    coversBy.set(c.user_id, [...(coversBy.get(c.user_id) ?? []), `${c.platform}:${c.id}`])
  }
  return friends.map((f) => ({
    username: f.username,
    name: f.name,
    avatarUrl: f.avatarUrl,
    size: f.saves,
    newCount: newBy.get(f.userId) ?? 0,
    coverKeys: coversBy.get(f.userId) ?? [],
  }))
}

/**
 * One friend's channel as a play queue: their visible saves, newest first
 * (`onlyNew`: just the ones new to the viewer). Null for an unknown, banned
 * or saveless member, and for the viewer themself (their saves are My saves).
 */
export function friendChannelKeys(
  viewerId: string,
  members: Member[],
  username: string,
  opts: { onlyNew?: boolean } = {},
): { friend: FriendChannelView; keys: string[] } | null {
  if (!viewerId) return null
  const lower = username.toLowerCase()
  const member = members.find((m) => m.username.toLowerCase() === lower)
  if (!member || member.isYou || member.saves === 0) return null
  const [friend] = friendChannels(viewerId, [member])
  if (!friend) return null
  const rows = db.all<{ platform: string; id: string }>(
    sql`SELECT b.platform, b.id FROM bookmarks b
        WHERE b.user_id = ${member.userId} AND ${visibleSave('b')}
        ${opts.onlyNew ? sql`AND ${newTo(viewerId, 'b')}` : sql``}
        ORDER BY b.processed_at DESC, b.id DESC
        LIMIT ${QUEUE_LIMIT}`,
  )
  return { friend, keys: rows.map((r) => `${r.platform}:${r.id}`) }
}
