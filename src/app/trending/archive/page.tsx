import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { listArchiveWeeks } from '@/lib/trending/archive'
import { MatterLogo } from '@/components/matter'
import { ThemeToggle } from '@/components/ThemeToggle'
import { buildCollectionPageLd, jsonLdScriptContent } from '@/lib/utils/structured-data'

/**
 * /trending/archive — index of permanent weekly snapshots of the community
 * pulse (what people saved/previewed each ISO week). Unlike the ephemeral
 * `/trending` feed, these pages never disappear — this index links to all of
 * them, newest first.
 *
 * Fully server-rendered (only the theme toggle hydrates as an island); no
 * data fetching happens client-side.
 */

// Reads the runtime SQLite DB (migrated at container startup, absent at
// build time) — must stay dynamic, matching /trending and /trending/[filter].
export const dynamic = 'force-dynamic'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://adhx.com'

export const metadata: Metadata = {
  // No brand in the string — the layout title template appends '| ADHX'.
  // (The OG/Twitter titles below keep it: unfurls don't get the template.)
  title: 'Trending Archive',
  description:
    'A permanent, week-by-week archive of what people saved and previewed across X, TikTok, Instagram and YouTube on ADHX.',
  alternates: { canonical: '/trending/archive' },
  openGraph: {
    type: 'website',
    url: `${BASE_URL}/trending/archive`,
    title: 'Trending Archive — ADHX',
    description:
      'A permanent, week-by-week archive of what people saved and previewed across X, TikTok, Instagram and YouTube on ADHX.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Trending Archive — ADHX',
    description:
      'A permanent, week-by-week archive of what people saved and previewed across X, TikTok, Instagram and YouTube on ADHX.',
  },
}

export default async function TrendingArchiveIndexPage() {
  // Resilience: a DB failure degrades to an empty index rather than a 500,
  // matching /trending's fallback behavior.
  let weeks: Awaited<ReturnType<typeof listArchiveWeeks>> = []
  try {
    weeks = await listArchiveWeeks()
  } catch (error) {
    console.error('Trending archive index: failed to list weeks:', error)
  }

  const jsonLd = buildCollectionPageLd({
    name: 'ADHX Trending Archive',
    description: 'Permanent weekly snapshots of what the community saved and previewed.',
    url: `${BASE_URL}/trending/archive`,
    baseUrl: BASE_URL,
    items: weeks.map((w) => ({
      url: `/trending/archive/${w.slug}`,
      name: w.label,
    })),
  })

  return (
    <div className="min-h-screen bg-paper">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScriptContent(jsonLd) }}
      />

      <nav className="flex items-center border-b border-hairline px-5 py-4 sm:px-11">
        <Link href="/" aria-label="ADHX home">
          <MatterLogo size={20} />
        </Link>
        <div className="ml-auto flex items-center gap-4">
          <Link
            href="/trending"
            className="text-sm font-medium text-ink-2 transition-colors hover:text-ink"
          >
            Trending
          </Link>
          <ThemeToggle />
        </div>
      </nav>

      <main className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
        <Link
          href="/trending"
          className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-ink-2 transition-colors hover:text-ink"
        >
          <ArrowLeft size={15} />
          Back to Trending
        </Link>

        <h1 className="font-serif text-3xl font-semibold tracking-[-0.015em] text-ink sm:text-4xl">
          Trending Archive
        </h1>
        <p className="mt-2.5 max-w-xl text-[15px] leading-relaxed text-ink-2">
          What the community saved and previewed, permanently archived one ISO week at a time.
        </p>

        {weeks.length === 0 ? (
          <p className="mt-10 text-sm text-ink-3">
            No archived weeks yet — check back after the first full week of activity.
          </p>
        ) : (
          <ul className="mt-8 divide-y divide-hairline border-y border-hairline">
            {weeks.map((w) => (
              <li key={w.slug}>
                <Link
                  href={`/trending/archive/${w.slug}`}
                  className="flex items-center justify-between gap-4 py-4 transition-colors hover:bg-inset"
                >
                  <span className="font-serif text-[17px] font-medium text-ink">{w.label}</span>
                  <span className="flex-none font-mono text-[12.5px] text-ink-3">
                    {w.itemCount} {w.itemCount === 1 ? 'item' : 'items'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
