import { getCurrentUserId } from '@/lib/auth/session'
import { getTheaterFeed } from '@/lib/theater/feed'
import { TheaterStaticList } from '@/components/theater/TheaterStaticList'
import { TheaterShell } from '@/components/theater/TheaterShell'
import { metrics } from '@/lib/sentry'
import AuthedHome from './AuthedHome'

/**
 * `/` — signed-in renders the Collection (`AuthedHome`, unchanged), signed-out
 * renders the theater (docs/specs/theater-first.md).
 *
 * force-dynamic: this reads the session cookie (`getCurrentUserId`, via
 * next/headers) and, for signed-out visitors, the runtime SQLite DB — which
 * is only migrated at container startup. Pre-rendering at build time would
 * either bake a signed-out response for everyone or query a table-less DB.
 */
export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const userId = await getCurrentUserId()

  if (userId) {
    return <AuthedHome />
  }

  const seed = await getTheaterFeed()
  metrics.theaterOpened('home')

  return (
    <>
      <TheaterStaticList items={seed.items} savedToday={seed.savedToday} />
      <TheaterShell seed={seed} />
    </>
  )
}
