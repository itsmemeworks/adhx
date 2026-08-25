import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  getArchiveItems,
  parseIsoWeekSlug,
  shiftWeekSlug,
  isCurrentIsoWeek,
  type ArchiveWeekResult,
} from '@/lib/trending/archive'
import type { TrendingItem } from '@/lib/trending/query'
import { rankItems } from '@/lib/trending/rank'
import { TrendingStaticList, itemHref } from '@/components/trending/TrendingStaticList'
import { TrendingListHeader } from '@/components/trending/TrendingListHeader'
import { TrendingRankedRow, trendingItemKey } from '@/components/trending/TrendingRankedRow'
import { buildCollectionPageLd, jsonLdScriptContent } from '@/lib/utils/structured-data'
import { PUBLIC_BASE_URL } from '@/lib/routes/base-url'
import type { ContentType } from '@/components/matter'
import { inferType } from '@/lib/trending/filter'

/**
 * /trending/archive/[week] — a permanent snapshot of what the community
 * saved/previewed during one ISO week (`2026-w30`). Chrome and ranking match
 * live `/trending` (dark numbered list, trendCount desc). Items are frozen
 * for that week — no live poll.
 *
 * ANONYMITY: items come from `getArchiveItems()`, which mirrors `./query`'s
 * invariant of never selecting `activity.userId`.
 */

// Reads the runtime SQLite DB (absent at build time) and depends on "now" to
// exclude the in-progress week — must stay dynamic. No generateStaticParams:
// slugs are validated at request time via parseIsoWeekSlug + notFound.
export const dynamic = 'force-dynamic'

const BASE_URL = PUBLIC_BASE_URL

interface Props {
  params: Promise<{ week: string }>
}

const TYPE_COUNT_LABEL: Record<ContentType, string> = {
  video: 'video',
  photo: 'photo',
  text: 'text post',
  article: 'article',
}

function countsByType(items: TrendingItem[]): Partial<Record<ContentType, number>> {
  const counts: Partial<Record<ContentType, number>> = {}
  for (const item of items) {
    const type = inferType(item)
    counts[type] = (counts[type] ?? 0) + 1
  }
  return counts
}

function describeCounts(items: TrendingItem[]): string {
  const counts = countsByType(items)
  const parts = (Object.keys(counts) as ContentType[])
    .filter((t) => counts[t])
    .map((t) => `${counts[t]} ${TYPE_COUNT_LABEL[t]}${counts[t]! > 1 ? 's' : ''}`)
  return parts.length > 0 ? parts.join(', ') : `${items.length} saved posts`
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { week: slug } = await params
  const parsed = parseIsoWeekSlug(slug)
  if (!parsed || isCurrentIsoWeek(slug)) return {}

  let archive: ArchiveWeekResult | null = null
  try {
    archive = await getArchiveItems(slug)
  } catch {
    return {}
  }
  if (!archive) return {}

  const title = `Best of the internet, ${archive.label} — Trending Archive`
  const description = `What the ADHX community saved and previewed the week of ${archive.label}: ${describeCounts(archive.items)}.`

  return {
    title,
    description,
    alternates: { canonical: `/trending/archive/${archive.slug}` },
    openGraph: {
      type: 'website',
      url: `${BASE_URL}/trending/archive/${archive.slug}`,
      title,
      description,
    },
    twitter: { card: 'summary_large_image', title, description },
  }
}

const WEEK_NAV =
  'text-sm text-white/40 underline decoration-white/15 underline-offset-4 transition-colors hover:text-white/70'

export default async function TrendingArchiveWeekPage({ params }: Props) {
  const { week: slug } = await params
  const parsed = parseIsoWeekSlug(slug)
  if (!parsed) notFound()
  // The in-progress week isn't a finished snapshot yet — it lives at /trending.
  if (isCurrentIsoWeek(slug)) notFound()

  let archive: ArchiveWeekResult | null = null
  try {
    archive = await getArchiveItems(slug)
  } catch (error) {
    console.error(`Trending archive[${slug}]: failed to query items:`, error)
  }
  if (!archive || archive.items.length === 0) notFound()

  const prevSlug = shiftWeekSlug(archive.slug, -1)
  const nextSlugRaw = shiftWeekSlug(archive.slug, 1)
  // Don't link forward into the still-in-progress current week — that content
  // lives at the live /trending feed, not a frozen archive page.
  const nextSlug = nextSlugRaw && !isCurrentIsoWeek(nextSlugRaw) ? nextSlugRaw : null

  const title = `Best of the internet, ${archive.label}`
  const ranked = rankItems(archive.items)
  const jsonLd = buildCollectionPageLd({
    name: title,
    description: `What the ADHX community saved and previewed the week of ${archive.label}.`,
    url: `${BASE_URL}/trending/archive/${archive.slug}`,
    baseUrl: BASE_URL,
    items: ranked.map((item) => ({
      url: itemHref(item),
      name: item.authorName || item.text || item.author || undefined,
    })),
  })

  return (
    <div className="min-h-screen bg-[#08070a] text-white/90">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScriptContent(jsonLd) }}
      />
      <h1 className="sr-only">{title}</h1>
      <TrendingStaticList items={ranked} heading={title} />

      <TrendingListHeader
        status={
          <span className="text-[12.5px] font-semibold text-white/60">
            <span>Archive</span>
          </span>
        }
        links={[
          { href: '/trending/archive', label: 'All weeks →' },
          { href: '/trending', label: 'Trending →' },
        ]}
      />

      <div className="mx-auto max-w-2xl">
        <p className="px-4 pt-5 text-[14px] leading-relaxed text-white/45 sm:px-6">
          <span>
            {archive.totalCount} {archive.totalCount === 1 ? 'post' : 'posts'} the ADHX community
            saved and previewed the week of {archive.label} — {describeCounts(archive.items)}.
          </span>
        </p>

        <ol className="mt-2">
          {ranked.map((item, i) => (
            <li key={trendingItemKey(item)}>
              <TrendingRankedRow item={item} rank={i + 1} />
            </li>
          ))}
        </ol>

        <nav
          aria-label="Adjacent weeks"
          className="flex items-center justify-between px-4 py-8 sm:px-6"
        >
          {prevSlug ? (
            <Link href={`/trending/archive/${prevSlug}`} className={WEEK_NAV}>
              <span>← Previous week</span>
            </Link>
          ) : (
            <span />
          )}
          {nextSlug ? (
            <Link href={`/trending/archive/${nextSlug}`} className={WEEK_NAV}>
              <span>Next week →</span>
            </Link>
          ) : (
            <span />
          )}
        </nav>
      </div>
    </div>
  )
}
