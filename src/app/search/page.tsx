import { redirect } from 'next/navigation'
import { getCurrentUserId } from '@/lib/auth/session'
import { startHref } from '@/lib/next-ui/routes'
import { SearchScreen } from '@/components/next/search/SearchScreen'
import { stateFromParams } from '@/components/next/search/model'

/**
 * `/search` — find saves by meaning.
 */
export const dynamic = 'force-dynamic'

export const metadata = { title: 'Search', robots: { index: false } }

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const params = await searchParams
  if (!(await getCurrentUserId())) redirect(startHref('/search', params))
  return <SearchScreen initial={stateFromParams(params)} />
}
