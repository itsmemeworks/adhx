import { redirect } from 'next/navigation'
import { getCurrentUserId } from '@/lib/auth/session'
import { getTheaterFeed } from '@/lib/theater/feed'
import { metrics } from '@/lib/sentry'
import AuthedTheater from '../AuthedTheater'

/**
 * `/collection` — the My Collection side of the theater's Live ⇄ My Collection
 * switch (the Live side is `/`). Your own active queue as a playlist, with the
 * collection actions; the grid with filters and search is `/library`.
 *
 * Signed-out visitors have no collection to play, so they land on the public
 * theater instead.
 *
 * force-dynamic for the same reason as `/`: session cookie + runtime SQLite.
 */
export const dynamic = 'force-dynamic'

export default async function CollectionTheaterPage() {
  const userId = await getCurrentUserId()
  if (!userId) redirect('/')

  // The live seed is fetched here too, not just on `/`: flipping the switch
  // back to Live shows the tab immediately, before the navigation lands.
  const seed = await getTheaterFeed()
  metrics.theaterOpened('collection')

  return <AuthedTheater seed={seed} tab="collection" />
}
