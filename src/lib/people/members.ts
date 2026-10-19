import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { memberAvatar, seenBy } from './savers'

/**
 * The server's members as one signed-in member sees them: every non-banned
 * account that has been let in (not waiting for approval), with how many of their saves the viewer can see (visible saves;
 * for the viewer, all their own saves including private ones). For friend
 * channels and the feed's per-friend controls. Empty when signed out.
 *
 * `userId` is for server-side queries only. Never send it to a client.
 */
export type Member = {
  userId: string
  username: string
  name: string | null
  avatarUrl: string | null
  /** Saves the viewer can see. */
  saves: number
  /** Newest of those saves (ISO), or null when there are none. */
  lastSavedAt: string | null
  isYou: boolean
}

type Row = {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  avatar_source: string | null
  saves: number | null
  last_saved_at: string | null
}

/** Members, most recent saver first; people with no visible saves come last, by username. */
export function listMembers(viewerId: string): Member[] {
  if (!viewerId) return []
  const rows = db.all<Row>(sql`
    SELECT u.id, u.username, u.display_name, u.avatar_url, p.value AS avatar_source,
           s.saves, s.last_saved_at
    FROM users u
    LEFT JOIN user_preferences p ON p.user_id = u.id AND p.key = 'avatarSource'
    LEFT JOIN (
      SELECT b.user_id, COUNT(*) AS saves, MAX(b.processed_at) AS last_saved_at
      FROM bookmarks b
      WHERE ${seenBy(viewerId, 'b')}
      GROUP BY b.user_id
    ) s ON s.user_id = u.id
    WHERE NOT EXISTS (SELECT 1 FROM user_bans ub WHERE ub.user_id = u.id)
      AND u.approval = 'approved'
    ORDER BY s.last_saved_at IS NULL, s.last_saved_at DESC, u.username
  `)
  return rows.map((r) => ({
    userId: r.id,
    username: r.username,
    name: r.display_name ?? null,
    avatarUrl: memberAvatar(r.avatar_url, r.avatar_source),
    saves: Number(r.saves) || 0,
    lastSavedAt: r.last_saved_at ?? null,
    isYou: r.id === viewerId,
  }))
}
