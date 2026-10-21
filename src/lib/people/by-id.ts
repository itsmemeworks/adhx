import { and, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { userPreferences, users } from '@/lib/db/schema'
import { memberAvatar } from './savers'

/** How one member is shown to another (no id). */
export type Face = { username: string; name: string | null; avatarUrl: string | null }

/**
 * Members by account id, for naming people who aren't attached to a save
 * (who is watching a moment, who reacted). Banned accounts and accounts
 * still waiting to be let in are left out.
 * Server-side only: the ids are the keys, never send them to a client.
 */
export function membersById(ids: readonly string[]): Map<string, Face> {
  const out = new Map<string, Face>()
  const wanted = [...new Set(ids.filter(Boolean))]
  if (wanted.length === 0) return out
  const rows = db
    .select({
      id: users.id,
      username: users.username,
      name: users.displayName,
      avatarUrl: users.avatarUrl,
      avatarSource: userPreferences.value,
    })
    .from(users)
    .leftJoin(
      userPreferences,
      and(eq(userPreferences.userId, users.id), eq(userPreferences.key, 'avatarSource')),
    )
    .where(
      and(
        inArray(users.id, wanted.slice(0, 400)),
        sql`NOT EXISTS (SELECT 1 FROM user_bans WHERE user_bans.user_id = ${users.id})`,
        eq(users.approval, 'approved'),
      ),
    )
    .all()
  for (const r of rows) {
    out.set(r.id, {
      username: r.username,
      name: r.name ?? null,
      avatarUrl: memberAvatar(r.avatarUrl, r.avatarSource),
    })
  }
  return out
}
