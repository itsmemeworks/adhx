import { redirect } from 'next/navigation'
import { getCurrentUserId } from '@/lib/auth/session'
import { isNextUiEnabled } from '@/lib/next-ui/server'
import { startHref } from '@/lib/next-ui/routes'
import { SearchScreen } from '@/components/next/search/SearchScreen'
import { stateFromParams } from '@/components/next/search/model'

/**
 * `/search` — find saves by meaning (redesign phase 3, behind `next_ui`).
 * With the flag off it sends people to the current library search.
 */
export const dynamic = 'force-dynamic'

export const metadata = { title: 'Search · adhx', robots: { index: false } }

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const params = await searchParams
  if (!(await isNextUiEnabled(params))) redirect('/library')
  if (!(await getCurrentUserId())) redirect(startHref('/search', params))
  return <SearchScreen initial={stateFromParams(params)} />
}
