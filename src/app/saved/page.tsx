import { redirect } from 'next/navigation'
import { getCurrentUserId } from '@/lib/auth/session'
import { getTheaterFeed } from '@/lib/theater/feed'
import { metrics } from '@/lib/sentry'
import { recordAnalytic } from '@/lib/analytics/record'
import AuthedTheater from '../AuthedTheater'
import { isNextUiEnabled } from '@/lib/next-ui/server'
import { savedToPlay } from '@/lib/next-ui/routes'

/**
 * `/saved` — Saved, the default signed-in theater (Discover
 * is `/live`). Signed-in `/` redirects here; this route is all active saves
 * (library card taps, `?open=`). The grid with filters and search is `/library`.
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
  searchParams: Promise<{ open?: string; platform?: string; next_ui?: string }>
}) {
  const userId = await getCurrentUserId()
  if (!userId) redirect('/')

  const { open, platform, ...rest } = await searchParams
  // Redesign (default since phase 7): Saved is the new theater on your newest saves.
  if (await isNextUiEnabled({ open, platform, ...rest })) redirect(savedToPlay(open, platform))

  // The live seed is fetched here too, not just on `/live`: flipping the switch
  // back to Live shows the tab immediately, before the navigation lands.
  const seed = await getTheaterFeed()
  metrics.theaterOpened('collection')
  recordAnalytic({ name: 'theater.open', userId, surface: 'collection' })

  return <AuthedTheater seed={seed} tab="collection" openId={open} openPlatform={platform} />
}
