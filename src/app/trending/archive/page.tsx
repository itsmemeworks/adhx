import type { Metadata } from 'next'
import Link from 'next/link'
import { listArchiveWeeks } from '@/lib/trending/archive'
import { TrendingListHeader } from '@/components/trending/TrendingListHeader'
import { buildCollectionPageLd, jsonLdScriptContent } from '@/lib/utils/structured-data'
import { PUBLIC_BASE_URL } from '@/lib/routes/base-url'

/**
 * /trending/archive — index of permanent weekly snapshots of the community
 * pulse (what people saved/previewed each ISO week). Unlike the ephemeral
 * `/trending` feed, these pages never disappear — this index links to all of
 * them, newest first.
 *
 * Fully server-rendered; chrome matches the dark ranked list on `/trending`.
 */

// Reads the runtime SQLite DB (migrated at container startup, absent at
// build time) — must stay dynamic, matching /trending and /trending/[filter].
export const dynamic = 'force-dynamic'

const BASE_URL = PUBLIC_BASE_URL

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
    <div className="min-h-screen bg-[#08070a] text-white/90">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScriptContent(jsonLd) }}
      />

      <TrendingListHeader
        status={
          <span className="text-[12.5px] font-semibold text-white/60">
            <span>Archive</span>
          </span>
        }
        links={[
          { href: '/trending', label: 'Trending →' },
          { href: '/', label: 'Watch as theater →' },
        ]}
      />

      <div className="mx-auto max-w-2xl">
        <h1 className="px-4 pt-5 font-serif text-[22px] font-semibold tracking-[-0.015em] text-white sm:px-6 sm:text-[26px]">
          <span>Trending Archive</span>
        </h1>
        <p className="mt-2 max-w-xl px-4 text-[14px] leading-relaxed text-white/45 sm:px-6">
          <span>
            What the community saved and previewed, permanently archived one ISO week at a time.
          </span>
        </p>

        {weeks.length === 0 ? (
          <div className="flex min-h-[40vh] items-center justify-center px-4">
            <p className="text-center text-[15px] text-white/40">
              <span>No archived weeks yet — check back after the first full week of activity.</span>
            </p>
          </div>
        ) : (
          <ol className="mt-4">
            {weeks.map((w, i) => (
              <li key={w.slug}>
                <Link
                  href={`/trending/archive/${w.slug}`}
                  className="group flex items-start gap-4 border-b border-white/[0.06] px-4 py-4 transition-colors hover:bg-white/[0.03] sm:px-5"
                >
                  <span className="w-7 flex-none pt-0.5 text-right font-mono text-[15px] tabular-nums text-white/35 sm:w-9 sm:text-[17px]">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14.5px] font-medium leading-snug text-white/90 sm:text-[15.5px]">
                      <span>{w.label}</span>
                    </p>
                    <p className="mt-1.5 text-[12px] text-white/45">
                      <span>
                        {w.itemCount} {w.itemCount === 1 ? 'post' : 'posts'}
                      </span>
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}
