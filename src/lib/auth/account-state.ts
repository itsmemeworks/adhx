import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

/**
 * A signed JWT is only a credential for an account that still exists.
 * Requiring the durable users row makes account deletion revoke every
 * outstanding browser session immediately.
 */
export async function hasLiveAccount(userId: string): Promise<boolean> {
  const [account] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  return !!account
}
