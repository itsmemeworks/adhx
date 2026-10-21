import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { memberAvatar, seenBy } from './savers'

/**
 * Settings → Your people: everyone let in on this server, with the saves the
 * viewer can see, when they last saved and a role chip. Admins also see
 * banned members (to unban them). Never an account id: people are named by
 * username, the handle the admin helpers take.
 */
export type Person = {
  username: string
  name: string | null
  avatarUrl: string | null
  saves: number
  lastSavedAt: string | null
  /** `owner` is the first admin; other admins are `admin`. */
  role: 'owner' | 'admin' | 'member'
  banned: boolean
  isYou: boolean
}

type Row = {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  avatar_source: string | null
  role: string
  banned: number
  saves: number | null
  last_saved_at: string | null
  owner_id: string | null
}

export function listPeople(viewerId: string, options: { includeBanned: boolean }): Person[] {
  if (!viewerId) return []
  const rows = db.all<Row>(sql`
    SELECT u.id, u.username, u.display_name, u.avatar_url, p.value AS avatar_source, u.role,
           EXISTS (SELECT 1 FROM user_bans ub WHERE ub.user_id = u.id) AS banned,
           s.saves, s.last_saved_at,
           (SELECT o.id FROM users o WHERE o.role = 'admin' ORDER BY o.created_at, o.id LIMIT 1) AS owner_id
    FROM users u
    LEFT JOIN user_preferences p ON p.user_id = u.id AND p.key = 'avatarSource'
    LEFT JOIN (
      SELECT b.user_id, COUNT(*) AS saves, MAX(b.processed_at) AS last_saved_at
      FROM bookmarks b
      WHERE ${seenBy(viewerId, 'b')}
      GROUP BY b.user_id
    ) s ON s.user_id = u.id
    WHERE u.approval = 'approved'
      AND (${options.includeBanned ? 1 : 0} = 1
           OR NOT EXISTS (SELECT 1 FROM user_bans ub WHERE ub.user_id = u.id))
    ORDER BY u.id = ${viewerId} DESC, u.role = 'admin' DESC,
             s.last_saved_at IS NULL, s.last_saved_at DESC, u.username
  `)
  return rows.map((r) => ({
    username: r.username,
    name: r.display_name ?? null,
    avatarUrl: memberAvatar(r.avatar_url, r.avatar_source),
    saves: Number(r.saves) || 0,
    lastSavedAt: r.last_saved_at ?? null,
    role: r.role === 'admin' ? (r.id === r.owner_id ? 'owner' : 'admin') : 'member',
    banned: !!r.banned,
    isYou: r.id === viewerId,
  }))
}
