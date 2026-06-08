import type { Metadata } from 'next'
import { getTrendingItems, type TrendingItem } from '@/lib/trending/query'
import { isReelPlayable } from '@/lib/trending/filter'
import { ReelPlayer } from '@/components/trending/ReelPlayer'

/**
 * /trending/play — the Trending Reel. A full-bleed, TikTok-style autoplay player
 * for the trending videos, seeded server-side from `getTrendingItems()` and kept
 * live by the client poll. Its own shareable URL: "watch what's trending on ADHX".
 *
 * Reads the runtime DB (migrated at container startup), so it renders at request
 * time — never pre-rendered at build (matches /trending). ANONYMITY: items come
 * from `getTrendingItems()`, which never selects `activity.userId`.
 */
export const dynamic = 'force-dynamic'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://adhx.com'

export const metadata: Metadata = {
  title: 'Trending reel — watch what people are saving',
  description:
    'A full-screen, autoplaying reel of the videos people are saving across X and TikTok right now. Tap to save your own to ADHX.',
  alternates: { canonical: '/trending/play' },
  openGraph: {
    type: 'website',
    url: `${BASE_URL}/trending/play`,
    title: 'Trending reel — watch what people are saving',
    description:
      'A full-screen, autoplaying reel of the videos people are saving across X and TikTok right now.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Trending reel — watch what people are saving',
    description: 'Watch the videos people are saving across X and TikTok right now.',
  },
}

export default async function TrendingPlayPage() {
  // Pull a generous recent window and keep only the clips the reel can actually
  // play (TikTok + X video, with a source id). A DB failure degrades to an empty
  // reel (the player shows a "nothing to play" state) rather than a 500.
  let items: TrendingItem[] = []
  try {
    const { items: recent } = await getTrendingItems({ limit: 80 })
    items = recent.filter(isReelPlayable)
  } catch (error) {
    console.error('Trending reel: failed to query trending items:', error)
  }

  return <ReelPlayer initialItems={items} />
}
