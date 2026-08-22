import { redirect } from 'next/navigation'
import { getCurrentUserId } from '@/lib/auth/session'
import { getTheaterFeed } from '@/lib/theater/feed'
import { TheaterStaticList } from '@/components/theater/TheaterStaticList'
import { TheaterShell } from '@/components/theater/TheaterShell'
import { metrics } from '@/lib/sentry'
import { recordAnalytic } from '@/lib/analytics/record'
import { collectionPath } from '@/lib/theater/collection-href'
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

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{
    added?: string
    id?: string
    tweetId?: string
    platform?: string
  }>
}) {
  const userId = await getCurrentUserId()
  const params = await searchParams
  const addedId = params.id ?? params.tweetId
  // Save-after-add still lands on `/?added=success&id=` — send it to the
  // one personal theater, not an overlay on this Live route.
  if (userId && (params.added === 'success' || params.added === 'duplicate') && addedId) {
    redirect(collectionPath({ open: addedId, platform: params.platform }))
  }

  const seed = await getTheaterFeed()
  metrics.theaterOpened('home')
  recordAnalytic({ name: 'theater.open', userId, surface: 'live' })

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
