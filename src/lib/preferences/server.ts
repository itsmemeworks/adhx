import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { userPreferences } from '@/lib/db/schema'
import { isOwnPicture } from '@/lib/avatar/paths'

/** These preference values for one account (missing keys are absent). */
export function readPreferences(userId: string, keys: string[]): Record<string, string> {
  if (!userId || keys.length === 0) return {}
  const rows = db
    .select({ key: userPreferences.key, value: userPreferences.value })
    .from(userPreferences)
    .where(and(eq(userPreferences.userId, userId), inArray(userPreferences.key, keys)))
    .all()
  const out: Record<string, string> = {}
  for (const r of rows) if (r.value !== null) out[r.key] = r.value
  return out
}

export function writePreference(userId: string, key: string, value: string): void {
  const now = new Date().toISOString()
  db.insert(userPreferences)
    .values({ userId, key, value, updatedAt: now })
    .onConflictDoUpdate({
      target: [userPreferences.userId, userPreferences.key],
      set: { value, updatedAt: now },
    })
    .run()
}

/**
 * Where the picture comes from, for Settings: `upload`, `gob`, `x` or
 * `generated`. Accounts from before pictures could be changed have only
 * `x`/`generated` stored (or nothing), so fall back on the address.
 */
export function avatarSourceOf(
  avatarUrl: string | null,
  stored: string | null,
): 'upload' | 'gob' | 'x' | 'generated' {
  if (stored === 'generated') return 'generated'
  if (isOwnPicture(avatarUrl)) return stored === 'gob' ? 'gob' : 'upload'
  return avatarUrl ? 'x' : 'generated'
}
