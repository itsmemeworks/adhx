import { redirect } from 'next/navigation'
import { getCurrentUserId } from '@/lib/auth/session'
import AuthedHome from '../AuthedHome'
import { isNextUiEnabled } from '@/lib/next-ui/server'
import { libraryToSearch } from '@/lib/next-ui/routes'

/**
 * `/library` — the Collection GRID: masonry/list/bento views, the FilterBar
 * (category + platform filters, tags, search) and the collection overlay it opens.
 *
 * This is where `AuthedHome` moved to when `/` became the theater. The theater
 * covers "play me what's new" (`/live` = Live, `/saved` = Saved);
 * the library covers "find that one thing I saved", which is what the grid,
 * filters and search are for.
 */
export const dynamic = 'force-dynamic'

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const userId = await getCurrentUserId()
  if (!userId) redirect('/')
  // Redesign (default since phase 7): the library grid became search.
  const params = await searchParams
  if (await isNextUiEnabled(params)) redirect(libraryToSearch(params.search))

  return <AuthedHome />
}
