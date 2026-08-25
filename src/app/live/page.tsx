import { redirect } from 'next/navigation'
import { getCurrentUserId } from '@/lib/auth/session'
import { getTheaterFeed } from '@/lib/theater/feed'
import { metrics } from '@/lib/sentry'
import { recordAnalytic } from '@/lib/analytics/record'
import AuthedTheater from '../AuthedTheater'

/**
 * `/live` — signed-in Live tab (community pulse). Signed-out visitors go to
 * `/`, which is the public live theater. Signed-in `/` redirects here.
 *
 * force-dynamic: session cookie + runtime SQLite.
 */
export const dynamic = 'force-dynamic'

export default async function LiveTheaterPage() {
  const userId = await getCurrentUserId()
  if (!userId) redirect('/')

  const seed = await getTheaterFeed()
  metrics.theaterOpened('home')
  recordAnalytic({ name: 'theater.open', userId, surface: 'live' })

  return <AuthedTheater seed={seed} tab="live" />
}
