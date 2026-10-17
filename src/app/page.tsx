import { redirect } from 'next/navigation'
import { getCurrentUserId } from '@/lib/auth/session'
import { getTheaterFeed } from '@/lib/theater/feed'
import { TheaterStaticList } from '@/components/theater/TheaterStaticList'
import { TheaterShell } from '@/components/theater/TheaterShell'
import { metrics } from '@/lib/sentry'
import { recordAnalytic } from '@/lib/analytics/record'
import { savedToPlay } from '@/lib/next-ui/routes'

/**
 * `/` — signed-out public live theater + crawlable static list.
 *
 * Signed in, this is Right now (`/now`), or the theater on a just-added
 * post when there is one (`?added=success|duplicate&id=`).
 *
 * force-dynamic: session cookie + runtime SQLite (migrated at container start).
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
  if (userId) {
    const addedId = params.added ? (params.id ?? params.tweetId) : null
    redirect(addedId ? savedToPlay(addedId, params.platform) : '/now')
  }

  const seed = await getTheaterFeed()
  metrics.theaterOpened('home')
  recordAnalytic({ name: 'theater.open', userId, surface: 'live' })

  return (
    <>
      <TheaterStaticList items={seed.items} savedToday={seed.savedToday} />
      <TheaterShell seed={seed} />
    </>
  )
}
