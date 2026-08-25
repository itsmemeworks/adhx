import { redirect } from 'next/navigation'
import { getCurrentUserId } from '@/lib/auth/session'
import { getTheaterFeed } from '@/lib/theater/feed'
import { TheaterStaticList } from '@/components/theater/TheaterStaticList'
import { TheaterShell } from '@/components/theater/TheaterShell'
import { metrics } from '@/lib/sentry'
import { recordAnalytic } from '@/lib/analytics/record'
import { collectionPath } from '@/lib/theater/collection-href'

/**
 * `/` — signed-out public live theater + crawlable static list.
 *
 * Signed IN this redirects to `/live` (community leftover). Saved is
 * `/saved`. An explicit add (`?added=success|duplicate`) still opens
 * the saved post on `/saved`.
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
  const addedId = params.id ?? params.tweetId
  if (userId) {
    if ((params.added === 'success' || params.added === 'duplicate') && addedId) {
      redirect(collectionPath({ open: addedId, platform: params.platform }))
    }
    redirect('/live')
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
