import { redirect } from 'next/navigation'
import { getCurrentUserId } from '@/lib/auth/session'
import { getTheaterFeed } from '@/lib/theater/feed'
import { metrics } from '@/lib/sentry'
import { recordAnalytic } from '@/lib/analytics/record'
import AuthedTheater from '../AuthedTheater'

/**
 * `/saved` — the Saved side of the theater's Live ⇄ Saved switch (the Live
 * side is `/live`). Signed-in `/` redirects here — next unread is the default
 * landing. The grid with filters and search is `/library`.
 *
 * Signed-out visitors have no saves to play, so they land on the public
 * theater instead.
 *
 * force-dynamic for the same reason as `/`: session cookie + runtime SQLite.
 */
export const dynamic = 'force-dynamic'

export default async function SavedTheaterPage({
  searchParams,
}: {
  searchParams: Promise<{ open?: string; platform?: string }>
}) {
  const userId = await getCurrentUserId()
  if (!userId) redirect('/')

  // The live seed is fetched here too, not just on `/live`: flipping the switch
  // back to Live shows the tab immediately, before the navigation lands.
  const seed = await getTheaterFeed()
  metrics.theaterOpened('collection')
  recordAnalytic({ name: 'theater.open', userId, surface: 'collection' })

  const { open, platform } = await searchParams
  return <AuthedTheater seed={seed} tab="collection" openId={open} openPlatform={platform} />
}
