import type { Metadata } from 'next'
import { getCollectionLeaderboard, type LeaderboardEntry } from '@/lib/discovery/rank'
import { CollectionsBoard } from '@/components/collections/CollectionsBoard'
import { CollectionsStaticList } from '@/components/collections/CollectionsStaticList'
import { WINDOW_COPY } from '@/components/collections/copy'
import { buildCollectionPageLd, jsonLdScriptContent } from '@/lib/utils/structured-data'

/**
 * /collections — the public, anonymous, crawlable Discovery leaderboard
 * ("podium" design, docs/specs/discovery-leaderboards.md §6). Bare
 * `/collections` is the `week` window (the default); the other three windows
 * live at `/collections/[window]`.
 *
 * `export const dynamic = 'force-dynamic'`: this reads the runtime SQLite DB
 * (migrated at container startup, not present during `next build`) via
 * `getCollectionLeaderboard()` — same runtime-render rule as /trending. No
 * `generateStaticParams` here (this route has no dynamic segment, but the
 * sibling `[window]` route deliberately omits it too, for the same reason).
 */
export const dynamic = 'force-dynamic'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://adhx.com'
const { title, description } = WINDOW_COPY.week

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/collections' },
  openGraph: {
    type: 'website',
    url: `${BASE_URL}/collections`,
    title,
    description,
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
  },
}

export default async function CollectionsPage() {
  // Resilience: a DB failure degrades to an empty board (matching /trending
  // + sitemap.ts) instead of a 500.
  let entries: LeaderboardEntry[] = []
  try {
    entries = getCollectionLeaderboard({ window: 'week' })
  } catch (error) {
    console.error('Collections: failed to query leaderboard:', error)
  }

  const jsonLd = buildCollectionPageLd({
    name: title,
    description,
    url: `${BASE_URL}/collections`,
    baseUrl: BASE_URL,
    items: entries.map((entry) => ({
      url: `/t/${entry.username}/${entry.tag}`,
      name: `#${entry.tag}`,
    })),
  })

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScriptContent(jsonLd) }}
      />
      <h1 className="sr-only">{title}</h1>
      <CollectionsStaticList entries={entries} heading={title} />
      <CollectionsBoard window="week" entries={entries} />
    </>
  )
}
