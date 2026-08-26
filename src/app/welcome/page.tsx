import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getCurrentUserId } from '@/lib/auth/session'
import { getAccount } from '@/lib/auth/account'
import { isSafeReturnUrl } from '@/lib/auth/return-url'
import { WelcomeClient } from './WelcomeClient'

// One-shot, authed-only utility page — nothing here is meant to be indexed.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

// The one-shot username-choice prompt shown right after a brand-new email
// signup (see the redirect in /api/auth/email/callback). Strictly one-shot:
// signed-out visitors and anyone who has already spent their choice bounce
// straight to `/`.
export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>
}) {
  const userId = await getCurrentUserId()
  if (!userId) {
    redirect('/')
  }

  const account = await getAccount(userId)
  if (!account || account.user.usernameChosen) {
    redirect('/')
  }

  const { returnTo } = await searchParams
  const destination = returnTo && isSafeReturnUrl(returnTo) ? returnTo : '/'

  return <WelcomeClient suggestedUsername={account.user.username} returnTo={destination} />
}
