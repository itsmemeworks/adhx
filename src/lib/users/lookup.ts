import { db } from '@/lib/db'
import { users, oauthTokens } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

/**
 * Canonical username lookups for friendly URLs (`/t/{username}/{tag}` etc.).
 *
 * Post-accounts-migration the `users` table is the source of truth — it's the
 * ONLY place email-first accounts (no X connection, so no `oauth_tokens` row)
 * have a username at all. `oauth_tokens` remains as a fallback for any row
 * the startup backfill hasn't touched yet, which also keeps older fixtures
 * working. Reading from `oauth_tokens` alone silently 404'd every share
 * action for email-only accounts.
 */
export async function getUsernameForUserId(userId: string): Promise<string | null> {
  const [user] = await db
    .select({ username: users.username })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  if (user?.username) return user.username

  const [token] = await db
    .select({ username: oauthTokens.username })
    .from(oauthTokens)
    .where(eq(oauthTokens.userId, userId))
    .limit(1)
  return token?.username ?? null
}

export async function getUserIdForUsername(username: string): Promise<string | null> {
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username))
    .limit(1)
  if (user?.id) return user.id

  const [token] = await db
    .select({ userId: oauthTokens.userId })
    .from(oauthTokens)
    .where(eq(oauthTokens.username, username))
    .limit(1)
  return token?.userId ?? null
}
