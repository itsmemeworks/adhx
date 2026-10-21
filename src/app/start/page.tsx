import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { bookmarks } from '@/lib/db/schema'
import { getCurrentUserId } from '@/lib/auth/session'
import { isSafeReturnUrl } from '@/lib/auth/return-url'
import { StartScreen } from '@/components/next/onboarding/StartScreen'

/**
 * `/start` — sign up / sign in with an email link, then bring your X
 * bookmarks.
 * `?returnTo=` is where the email link lands afterwards; `?sync=1` starts
 * the X import straight away (the X connect flow returns here with it).
 * Signing in again with saves already here goes straight to them.
 */
export const dynamic = 'force-dynamic'

export const metadata = { title: 'Get started · adhx', robots: { index: false } }

export default async function StartPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const params = await searchParams
  const returnTo = isSafeReturnUrl(params.returnTo) ? params.returnTo : '/start'
  if (params.sync !== '1') {
    const userId = await getCurrentUserId()
    if (userId && hasSaves(userId)) redirect(returnTo.startsWith('/start') ? '/' : returnTo)
  }
  return <StartScreen returnTo={returnTo} autoSync={params.sync === '1'} />
}

function hasSaves(userId: string): boolean {
  return (
    db
      .select({ id: bookmarks.id })
      .from(bookmarks)
      .where(eq(bookmarks.userId, userId))
      .limit(1)
      .all().length > 0
  )
}
