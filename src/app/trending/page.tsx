import type { Metadata } from 'next'
import { getTrendingItems, type TrendingItem } from '@/lib/trending/query'
import { DiscoverFeed } from '@/components/discover/DiscoverFeed'
import { buildCollectionPageLd } from '@/lib/utils/structured-data'
import { TrendingStaticList, itemHref } from '@/components/trending/TrendingStaticList'

/**
 * /trending — the crawlable, ISR-rendered public discovery hub.
 *
 * This is the SEO-canonical home for "what people are saving right now". Unlike
 * the old client-only /discover, the server renders REAL HTML for each item
 * (author, text, thumbnail, type, save count, platform, link) so View Source —
 * and any crawler with JS disabled — sees full content + links, not a skeleton.
 * The interactive, self-refreshing grid (<DiscoverFeed>) hydrates on top, seeded
 * with the same items so there's no skeleton flash.
 *
 * ANONYMITY: every item comes from `getTrendingItems()`, the single audited
 * choke point that never selects `activity.userId`. Nothing here exposes a saver.
 */

// Render at request time, not build time: this reads the runtime database
// (migrated at container startup), which doesn't exist during `next build` —
// pre-rendering would query a table-less DB. The query is a cheap local SQLite
// read and the live pulse is best served fresh, so per-request is fine; the
// client grid still keeps the live feel via its own 12s polling.
export const dynamic = 'force-dynamic'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://adhx.com'

export const metadata: Metadata = {
  title: 'Trending now — what people are saving',
  description:
    'What people are saving across X, TikTok, Instagram and YouTube right now. A live, anonymous feed of trending posts — preview any of them and save your own to ADHX.',
  alternates: { canonical: '/trending' },
  openGraph: {
    type: 'website',
    url: `${BASE_URL}/trending`,
    title: 'Trending now — what people are saving',
    description:
      'A live, anonymous feed of what people are saving across X, TikTok, Instagram and YouTube right now.',
    // OG image inherited from the app's default opengraph-image.tsx.
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Trending now — what people are saving',
    description:
      'A live, anonymous feed of what people are saving across X, TikTok, Instagram and YouTube right now.',
  },
}

export default async function TrendingPage() {
  // The bare hub defaults to the "Latest" lens — the newest items, newest-first,
  // however they entered the pulse. (The "Popular" lens, ranked by interactions,
  // is a pill / the /trending/popular sub-path.)
  //
  // Resilience: a DB failure during build/ISR degrades to an empty hub (zero
  // items) instead of throwing a 500 — matching sitemap.ts's graceful fallback.
  let items: TrendingItem[] = []
  try {
    const { items: recent } = await getTrendingItems({ limit: 30 })
    items = recent
  } catch (error) {
    console.error('Trending: failed to query trending items:', error)
  }

  const jsonLd = buildCollectionPageLd({
    name: 'Trending now on ADHX',
    description: 'What people are saving across X, TikTok, Instagram and YouTube right now.',
    url: `${BASE_URL}/trending`,
    baseUrl: BASE_URL,
    items: items.map((item) => ({
      url: itemHref(item),
      name: item.authorName || item.text || item.author || undefined,
    })),
  })

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <h1 className="sr-only">What people are saving across X, TikTok, Instagram and YouTube</h1>
      <TrendingStaticList items={items} heading="Latest posts" />
      <DiscoverFeed initialItems={items} initialFilter="latest" />
    </>
  )
}
