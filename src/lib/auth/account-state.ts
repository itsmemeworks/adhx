import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export type Approval = 'approved' | 'pending' | 'declined'

/**
 * A signed JWT is only a credential for an account that still exists.
 * Requiring the durable users row makes account deletion revoke every
 * outstanding browser session immediately.
 */
export async function hasLiveAccount(userId: string): Promise<boolean> {
  return (await accountApproval(userId)) !== null
}

/**
 * Whether this account may use the server: `approved`, or still `pending`
 * (or `declined`) after joining from a member's invite with approvals on.
 * Null when the account doesn't exist.
 */
export async function accountApproval(userId: string): Promise<Approval | null> {
  const [account] = await db
    .select({ approval: users.approval })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  if (!account) return null
  return account.approval === 'pending' || account.approval === 'declined'
    ? account.approval
    : 'approved'
}
