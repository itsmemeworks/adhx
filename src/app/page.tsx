import { redirect } from 'next/navigation'
import { getCurrentUserId } from '@/lib/auth/session'
import { getTheaterFeed } from '@/lib/theater/feed'
import { TheaterStaticList } from '@/components/theater/TheaterStaticList'
import { PublicHome } from '@/components/next/moments/PublicHome'
import { metrics } from '@/lib/sentry'
import { recordAnalytic } from '@/lib/analytics/record'
import { savedToPlay } from '@/lib/next-ui/routes'
import { feedPlayHref } from '@/components/next/theater/queue'

/**
 * `/` — signed out: what ADHX is, a way in, and Right now live underneath,
 * plus the crawlable static list of what's being saved.
 *
 * Signed in, this is New (`/play?feed=new`: what your people saved that
 * you haven't seen), or the theater on a just-added post when there is one
 * (`?added=success|duplicate&id=`).
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
    redirect(addedId ? savedToPlay(addedId, params.platform) : feedPlayHref('new'))
  }

  const seed = await getTheaterFeed()
  metrics.theaterOpened('home')
  recordAnalytic({ name: 'theater.open', userId, surface: 'live' })

  return (
    <>
      <TheaterStaticList items={seed.items} savedToday={seed.savedToday} />
      <PublicHome />
    </>
  )
}
