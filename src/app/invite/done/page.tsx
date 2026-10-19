import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getCurrentUserId } from '@/lib/auth/session'
import { getAccount } from '@/lib/auth/account'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { invites } from '@/lib/db/schema'
import { membersById } from '@/lib/people/by-id'
import { InviteDoneClient } from './InviteDoneClient'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'You’re in',
  robots: { index: false, follow: false },
}

/** Where an invite lands once you've joined: pair your phone, or skip to the feed. */
export default async function InviteDonePage() {
  const userId = await getCurrentUserId()
  if (!userId) redirect('/')
  const account = await getAccount(userId)
  if (!account) redirect('/')
  // Whose invite brought you here: "on Ana’s ADHX".
  const [used] = await db
    .select({ createdBy: invites.createdBy })
    .from(invites)
    .where(eq(invites.usedBy, userId))
    .limit(1)
  const face = used ? membersById([used.createdBy]).get(used.createdBy) : undefined
  return (
    <InviteDoneClient
      username={account.user.username}
      displayName={account.user.displayName}
      avatarUrl={account.user.avatarUrl}
      inviter={
        face ? { username: face.username, name: face.name, avatarUrl: face.avatarUrl } : null
      }
      hasEmail={!!account.identities.email}
    />
  )
}
