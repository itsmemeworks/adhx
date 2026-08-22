import { getCurrentUserId } from '@/lib/auth/session'
import { getTheaterFeed } from '@/lib/theater/feed'
import { TheaterStaticList } from '@/components/theater/TheaterStaticList'
import { TheaterShell } from '@/components/theater/TheaterShell'
import { metrics } from '@/lib/sentry'
import AuthedTheater from './AuthedTheater'

/**
 * `/` — the theater, signed in or out (docs/specs/theater-first.md).
 *
 * Signed OUT it's the public live theater plus the crawlable static list.
 * Signed IN it's the same theater with the Live ⇄ My Collection switch, opened
 * on **Live** — the owner's call: "most people, when logged in, will want to
 * keep the live view of the theater on, so that should be the default route".
 * The other side of that switch is `/collection`, and the grid (filters,
 * search, views) moved to `/library`.
 *
 * force-dynamic: this reads the session cookie (`getCurrentUserId`, via
 * next/headers) and the runtime SQLite DB — which is only migrated at
 * container startup. Pre-rendering at build time would either bake a
 * signed-out response for everyone or query a table-less DB.
 */
export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const userId = await getCurrentUserId()
  const seed = await getTheaterFeed()
  metrics.theaterOpened('home')

  if (userId) {
    return <AuthedTheater seed={seed} tab="live" />
  }

  return (
    <>
      <TheaterStaticList items={seed.items} savedToday={seed.savedToday} />
      <TheaterShell seed={seed} />
    </>
  )
}
