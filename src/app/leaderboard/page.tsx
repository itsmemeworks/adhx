import type { Metadata } from 'next'
import { getCollectionLeaderboard, type LeaderboardEntry } from '@/lib/discovery/rank'
import { CollectionsBoard } from '@/components/collections/CollectionsBoard'
import { CollectionsStaticList } from '@/components/collections/CollectionsStaticList'
import { WINDOW_COPY } from '@/components/collections/copy'
import { buildCollectionPageLd, jsonLdScriptContent } from '@/lib/utils/structured-data'
import { getCurrentUserId } from '@/lib/auth/session'
import { PUBLIC_BASE_URL } from '@/lib/routes/base-url'

/**
 * /leaderboard — the public, anonymous, crawlable Discovery leaderboard
 * ("podium" design, docs/specs/discovery-leaderboards.md §6). Bare
 * `/leaderboard` is the `week` window (the default); the other three windows
 * live at `/leaderboard/[window]`.
 *
 * This used to live at `/collections`, which collided with the unrelated
 * `/api/collections` custom-collections API — the owner asked for it to move
 * here. The old `/collections` + `/collections/[window]` paths still work:
 * they're now thin redirect stubs (`src/app/collections/page.tsx` and
 * `src/app/collections/[window]/page.tsx`) since they're on staging and
 * already shipped in sitemaps.
 *
 * `export const dynamic = 'force-dynamic'`: this reads the runtime SQLite DB
 * (migrated at container startup, not present during `next build`) via
 * `getCollectionLeaderboard()` — same runtime-render rule as /trending. No
 * `generateStaticParams` here (this route has no dynamic segment, but the
 * sibling `[window]` route deliberately omits it too, for the same reason).
 */
export const dynamic = 'force-dynamic'

const BASE_URL = PUBLIC_BASE_URL
const { title, description } = WINDOW_COPY.week

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/leaderboard' },
  openGraph: {
    type: 'website',
    url: `${BASE_URL}/leaderboard`,
    title,
    description,
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
  },
}

export default async function LeaderboardPage() {
  // Signed-in visitors already have the global app Header as their chrome —
  // CollectionsBoard skips its own internal dark header for them so the page
  // doesn't stack two headers (see CollectionsBoard's `authed` prop).
  const authed = Boolean(await getCurrentUserId())

  // Resilience: a DB failure degrades to an empty board (matching /trending
  // + sitemap.ts) instead of a 500.
  let entries: LeaderboardEntry[] = []
  try {
    entries = getCollectionLeaderboard({ window: 'week' })
  } catch (error) {
    console.error('Leaderboard: failed to query leaderboard:', error)
  }

  const jsonLd = buildCollectionPageLd({
    name: title,
    description,
    url: `${BASE_URL}/leaderboard`,
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
      <CollectionsBoard window="week" entries={entries} authed={authed} />
    </>
  )
}
