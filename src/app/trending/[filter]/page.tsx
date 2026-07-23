import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { getTrendingItems, type TrendingItem } from '@/lib/trending/query'
import { applyFilter, filterLabel, slugToFilter } from '@/lib/trending/filter'
import { DiscoverFeed } from '@/components/discover/DiscoverFeed'
import { buildCollectionPageLd, jsonLdScriptContent } from '@/lib/utils/structured-data'
import { TrendingStaticList, itemHref } from '@/components/trending/TrendingStaticList'

/**
 * /trending/[filter] — a crawlable hub for a single lens (videos / photos /
 * text / articles / latest). Same SSR-then-hydrate shape as /trending: real
 * HTML for each matching item in source, then the live <DiscoverFeed> grid on
 * top, pre-selected to this filter. Sharing a filtered view lands the visitor
 * on the same filter.
 *
 * The default "trending" lens lives at the bare /trending (not a sub-path).
 *
 * ANONYMITY: items come from `getTrendingItems()`, which never selects userId.
 */

// Render at request time, not build time: this reads the runtime database
// (migrated at container startup), absent during `next build`. We deliberately
// do NOT use generateStaticParams (which would pre-render — and query — each
// hub at build); slugs are validated at runtime via slugToFilter + notFound.
// The query is a cheap local SQLite read, so per-request rendering is fine.
export const dynamic = 'force-dynamic'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://adhx.com'

interface Props {
  params: Promise<{ filter: string }>
}

/** Per-filter copy for titles/descriptions. */
function copy(label: string): { title: string; description: string } {
  if (label === 'Popular') {
    return {
      title: 'Popular — what people are saving most',
      description:
        'The most-saved and most-previewed posts across X, TikTok, Instagram and YouTube on ADHX right now. A live, anonymous feed — preview any of them and save your own to ADHX.',
    }
  }
  const lower = label.toLowerCase()
  return {
    title: `Trending ${lower} — what people are saving`,
    description: `Trending ${lower} across X, TikTok, Instagram and YouTube right now. A live, anonymous feed — preview any of them and save your own to ADHX.`,
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { filter: slug } = await params
  const filter = slugToFilter(slug)
  if (!filter) return {}
  const { title, description } = copy(filterLabel(filter))
  return {
    title,
    description,
    alternates: { canonical: `/trending/${slug}` },
    openGraph: { type: 'website', url: `${BASE_URL}/trending/${slug}`, title, description },
    twitter: { card: 'summary_large_image', title, description },
  }
}

export default async function TrendingFilterPage({ params }: Props) {
  const { filter: slug } = await params
  // "latest" is the default lens at the bare /trending now — keep the old
  // /trending/latest URL working by sending it there.
  if (slug === 'latest') redirect('/trending')
  const filter = slugToFilter(slug)
  if (!filter) notFound()

  const label = filterLabel(filter)
  // Pull a recent window (no minTrend) and apply the same lens the client grid
  // uses, so the crawlable list matches what visitors see after hydration.
  //
  // Resilience: a DB failure during build/ISR degrades to an empty hub (zero
  // items) instead of throwing a 500 — matching /trending + sitemap.ts.
  let items: TrendingItem[] = []
  try {
    const { items: recent } = await getTrendingItems({ limit: 60 })
    items = applyFilter(recent, filter).slice(0, 30)
  } catch (error) {
    console.error(`Trending[${slug}]: failed to query trending items:`, error)
  }

  const { title, description } = copy(label)
  const jsonLd = buildCollectionPageLd({
    name: title,
    description,
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
        dangerouslySetInnerHTML={{ __html: jsonLdScriptContent(jsonLd) }}
      />
      <h1 className="sr-only">{title}</h1>
      <TrendingStaticList items={items} heading={`${label} posts`} />
      <DiscoverFeed initialItems={items} initialFilter={filter} />
    </>
  )
}
