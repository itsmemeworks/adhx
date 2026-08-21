import { db } from '@/lib/db'
import { users, oauthTokens, usernameAliases } from '@/lib/db/schema'
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

export interface UsernameAlias {
  userId: string
  /** The owner's CURRENT username (not the stale one being looked up). */
  username: string
}

/**
 * Resolve a username the account has since changed AWAY from (via
 * `chooseUsername()` in `src/lib/auth/account.ts`) to its owner's current
 * identity. Returns `null` when `oldUsername` was never anyone's username at
 * all — i.e. a genuine 404, not a stale link.
 *
 * Callers decide what to do with a hit:
 * - The `/t/{username}` and `/t/{username}/{tag}` pages issue a
 *   `permanentRedirect()` to the same path with the current username, so
 *   old shared links never dead-end.
 * - The `/api/share/tag/by-name/...` JSON routes resolve silently and keep
 *   serving the request under the current username — there's no "page" to
 *   redirect for a fetch.
 */
export async function resolveUsernameAlias(oldUsername: string): Promise<UsernameAlias | null> {
  const [alias] = await db
    .select({ userId: usernameAliases.userId })
    .from(usernameAliases)
    .where(eq(usernameAliases.username, oldUsername.toLowerCase()))
    .limit(1)
  if (!alias) return null

  const username = await getUsernameForUserId(alias.userId)
  if (!username) return null

  return { userId: alias.userId, username }
}
