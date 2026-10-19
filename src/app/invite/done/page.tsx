import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getCurrentUserId } from '@/lib/auth/session'
import { getAccount } from '@/lib/auth/account'
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
  return <InviteDoneClient username={account.user.username} hasEmail={!!account.identities.email} />
}
