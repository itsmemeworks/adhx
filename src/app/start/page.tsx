import { redirect } from 'next/navigation'
import { isNextUiEnabled } from '@/lib/next-ui/server'
import { isSafeReturnUrl } from '@/lib/auth/return-url'
import { StartScreen } from '@/components/next/onboarding/StartScreen'

/**
 * `/start` — sign up / sign in with an email link, then bring your X
 * bookmarks (redesign phase 6, behind `next_ui`; flag off → `/`).
 * `?returnTo=` is where the email link lands afterwards; `?sync=1` starts
 * the X import straight away (the X connect flow returns here with it).
 */
export const dynamic = 'force-dynamic'

export const metadata = { title: 'Get started · adhx', robots: { index: false } }

export default async function StartPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const params = await searchParams
  if (!(await isNextUiEnabled(params))) redirect('/')
  const returnTo = isSafeReturnUrl(params.returnTo) ? params.returnTo : '/start'
  return <StartScreen returnTo={returnTo} autoSync={params.sync === '1'} />
}
