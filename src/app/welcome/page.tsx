import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { getAccount } from '@/lib/auth/account'
import { isSafeReturnUrl } from '@/lib/auth/return-url'
import { WelcomeClient } from './WelcomeClient'

// The one-shot username-choice prompt shown right after a brand-new email
// signup (see the redirect in /api/auth/email/callback). Strictly one-shot:
// signed-out visitors and anyone who has already spent their choice bounce
// straight to `/`.
export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>
}) {
  const session = await getSession()
  if (!session) {
    redirect('/')
  }

  const account = await getAccount(session.userId)
  if (!account || account.user.usernameChosen) {
    redirect('/')
  }

  const { returnTo } = await searchParams
  const destination = returnTo && isSafeReturnUrl(returnTo) ? returnTo : '/'

  return <WelcomeClient suggestedUsername={account.user.username} returnTo={destination} />
}
