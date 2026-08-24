import { redirect } from 'next/navigation'
import { getCurrentUserId } from '@/lib/auth/session'
import AuthedHome from '../AuthedHome'

/**
 * `/library` — the Collection GRID: masonry/list/bento views, the FilterBar
 * (category + platform filters, tags, search) and the collection overlay it opens.
 *
 * This is where `AuthedHome` moved to when `/` became the theater. The theater
 * covers "play me what's new" (`/live` = Live, `/collection` = My Collection);
 * the library covers "find that one thing I saved", which is what the grid,
 * filters and search are for.
 */
export const dynamic = 'force-dynamic'

export default async function LibraryPage() {
  const userId = await getCurrentUserId()
  if (!userId) redirect('/')

  return <AuthedHome />
}
