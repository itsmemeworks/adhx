import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTrendingItems, type TrendingItem } from '@/lib/trending/query'
import type { PlatformId } from '@/lib/platform/url'
import { DiscoverFeed } from '@/components/discover/DiscoverFeed'
import { buildCollectionPageLd } from '@/lib/utils/structured-data'
import { TrendingStaticList, itemHref } from '@/components/trending/TrendingStaticList'

/**
 * /trending/[platform] — a per-platform crawlable trending hub (x / tiktok /
 * instagram / youtube). Same SSR-then-hydrate shape as /trending: real HTML for
 * each item in source, then the live <DiscoverFeed> grid on top.
 *
 * ANONYMITY: items come from `getTrendingItems()`, which never selects userId.
 */

export const revalidate = 300

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://adhx.com'

interface Props {
  params: Promise<{ platform: string }>
}

/** URL slug → query platform id. The X hub lives at /trending/x. */
const SLUG_TO_PLATFORM: Record<string, PlatformId> = {
  x: 'twitter',
  tiktok: 'tiktok',
  instagram: 'instagram',
  youtube: 'youtube',
}

const PLATFORM_NAME: Record<PlatformId, string> = {
  twitter: 'X',
  tiktok: 'TikTok',
  instagram: 'Instagram',
  youtube: 'YouTube',
}

/** Pre-render the four known platform hubs at build; unknown slugs 404. */
export function generateStaticParams() {
  return Object.keys(SLUG_TO_PLATFORM).map((platform) => ({ platform }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { platform: slug } = await params
  const platform = SLUG_TO_PLATFORM[slug]
  if (!platform) return {}
  const name = PLATFORM_NAME[platform]
  const title = `Trending on ${name} — what people are saving`
  const description = `What people are saving from ${name} right now. A live, anonymous feed of trending ${name} posts — preview any of them and save your own to ADHX.`
  return {
    title,
    description,
    alternates: { canonical: `/trending/${slug}` },
    openGraph: {
      type: 'website',
      url: `${BASE_URL}/trending/${slug}`,
      title,
      description,
    },
    twitter: { card: 'summary_large_image', title, description },
  }
}

export default async function TrendingPlatformPage({ params }: Props) {
  const { platform: slug } = await params
  const platform = SLUG_TO_PLATFORM[slug]
  if (!platform) notFound()

  const name = PLATFORM_NAME[platform]
  // Per-platform: most recent events for this platform (no minTrend so the hub
  // still has content even for quieter platforms).
  //
  // Resilience: a DB failure during build/ISR degrades to an empty hub (zero
  // items) instead of throwing a 500 — matching sitemap.ts's graceful fallback.
  let items: TrendingItem[] = []
  try {
    const result = await getTrendingItems({ platform, limit: 30 })
    items = result.items
  } catch (error) {
    console.error(`Trending[${slug}]: failed to query trending items:`, error)
  }

  const jsonLd = buildCollectionPageLd({
    name: `Trending on ${name}`,
    description: `What people are saving from ${name} right now.`,
    url: `${BASE_URL}/trending/${slug}`,
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
      <h1 className="sr-only">Trending on {name} — what people are saving right now</h1>
      <TrendingStaticList items={items} heading={`Trending ${name} posts`} />
      <DiscoverFeed initialItems={items} initialFilter="trending" />
    </>
  )
}
