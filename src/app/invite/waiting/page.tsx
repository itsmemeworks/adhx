import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { getCurrentUserId, getWaitingAccount } from '@/lib/auth/session'
import { waitingFor } from '@/lib/auth/approval'
import { WaitingClient } from './WaitingClient'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Waiting to be let in',
  robots: { index: false, follow: false },
}

/**
 * Where someone a member invited waits while "Anyone, I approve" is on. Their
 * account exists but is signed out everywhere else until an admin says yes.
 */
export default async function InviteWaitingPage() {
  const waiting = await getWaitingAccount()
  if (!waiting) {
    redirect((await getCurrentUserId()) ? '/invite/done' : '/')
  }
  const user = db
    .select({ username: users.username })
    .from(users)
    .where(eq(users.id, waiting.userId))
    .get()
  const names = waitingFor(waiting.userId)
  return (
    <WaitingClient
      username={user?.username ?? ''}
      admin={names.admin}
      inviter={names.inviter}
      initial={waiting.approval}
    />
  )
}
