import { redirect } from 'next/navigation'
import { getCurrentUserId } from '@/lib/auth/session'
import { getTheaterFeed } from '@/lib/theater/feed'
import { TheaterStaticList } from '@/components/theater/TheaterStaticList'
import { PublicHome } from '@/components/next/moments/PublicHome'
import { metrics } from '@/lib/sentry'
import { recordAnalytic } from '@/lib/analytics/record'
import { savedToPlay } from '@/lib/next-ui/routes'
import { productSiteEnabled } from '@/lib/site'
import { ProductSite } from '@/components/site/ProductSite'
import type { Metadata } from 'next'

/**
 * `/` — signed out: what ADHX is, a way in, and Right now live underneath,
 * plus the crawlable static list of what's being saved. On adhx.com
 * (ADHX_PRODUCT_SITE=1) it's the product site instead.
 *
 * Signed in, this is Right now (`/now`), or the theater on a just-added
 * post when there is one (`?added=success|duplicate&id=`).
 *
 * force-dynamic: session cookie + runtime SQLite (migrated at container start).
 */
export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  if (!productSiteEnabled()) return {}
  return {
    title: 'ADHX: keep every post you love, on your own server',
    description:
      'Self-hosted and open source. Save posts from X, Instagram, TikTok, YouTube, Reddit and nine more networks, keep the originals in full quality, and find anything by describing it. With iPhone and Android companion apps.',
  }
}

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

  if (productSiteEnabled()) return <ProductSite />

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
