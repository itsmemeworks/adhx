import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { getCollectionLeaderboard, slugToWindow, type LeaderboardEntry } from '@/lib/discovery/rank'
import { CollectionsBoard } from '@/components/collections/CollectionsBoard'
import { CollectionsStaticList } from '@/components/collections/CollectionsStaticList'
import { WINDOW_COPY } from '@/components/collections/copy'
import { buildCollectionPageLd, jsonLdScriptContent } from '@/lib/utils/structured-data'

/**
 * /collections/[window] — the non-default Discovery leaderboard windows
 * (today / month / all-time). `week` is the default and lives at the bare
 * `/collections`, so a `/collections/week` visit permanent-redirects there
 * (the canonical URL) rather than rendering a duplicate page.
 *
 * Same runtime-render rule as /trending/[filter]: `force-dynamic`, no
 * `generateStaticParams` — this reads the runtime SQLite DB, absent at build
 * time. Slugs are validated at request time via `slugToWindow` + `notFound`.
 */
export const dynamic = 'force-dynamic'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://adhx.com'

interface Props {
  params: Promise<{ window: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { window: slug } = await params
  const window = slugToWindow(slug)
  if (!window || window === 'week') return {}
  const { title, description } = WINDOW_COPY[window]
  return {
    title,
    description,
    alternates: { canonical: `/collections/${slug}` },
    openGraph: { type: 'website', url: `${BASE_URL}/collections/${slug}`, title, description },
    twitter: { card: 'summary_large_image', title, description },
  }
}

export default async function CollectionsWindowPage({ params }: Props) {
  const { window: slug } = await params
  const window = slugToWindow(slug)
  if (!window) notFound()
  // The default window's canonical URL is the bare /collections.
  if (window === 'week') permanentRedirect('/collections')

  // Resilience: a DB failure degrades to an empty board (matching /trending
  // + sitemap.ts) instead of a 500.
  let entries: LeaderboardEntry[] = []
  try {
    entries = getCollectionLeaderboard({ window })
  } catch (error) {
    console.error(`Collections[${slug}]: failed to query leaderboard:`, error)
  }

  const { title, description } = WINDOW_COPY[window]
  const jsonLd = buildCollectionPageLd({
    name: title,
    description,
    url: `${BASE_URL}/collections/${slug}`,
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
      <CollectionsBoard window={window} entries={entries} />
    </>
  )
}
