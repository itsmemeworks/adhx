import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ArrowRight, Flame, Play, FileText } from 'lucide-react'
import {
  getArchiveItems,
  parseIsoWeekSlug,
  shiftWeekSlug,
  isCurrentIsoWeek,
  type ArchiveWeekResult,
} from '@/lib/trending/archive'
import type { TrendingItem } from '@/lib/trending/query'
import { itemHref } from '@/components/trending/TrendingStaticList'
import { MatterLogo, PlatformGlyph, TypeBadge, type ContentType } from '@/components/matter'
import { ThemeToggle } from '@/components/ThemeToggle'
import { buildCollectionPageLd, jsonLdScriptContent } from '@/lib/utils/structured-data'

/**
 * /trending/archive/[week] — a permanent snapshot of what the community
 * saved/previewed during one ISO week (`2026-w30`). Fully server-rendered:
 * every item is real markup in the initial HTML (no hydration needed to see
 * content), so it stays indexable and readable forever, unlike the ephemeral
 * `/trending` feed.
 *
 * ANONYMITY: items come from `getArchiveItems()`, which mirrors `./query`'s
 * invariant of never selecting `activity.userId`.
 */

// Reads the runtime SQLite DB (absent at build time) and depends on "now" to
// exclude the in-progress week — must stay dynamic. No generateStaticParams:
// slugs are validated at request time via parseIsoWeekSlug + notFound.
export const dynamic = 'force-dynamic'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://adhx.com'

interface Props {
  params: Promise<{ week: string }>
}

const TYPE_COUNT_LABEL: Record<ContentType, string> = {
  video: 'video',
  photo: 'photo',
  text: 'text post',
  quote: 'quote',
  article: 'article',
}

function countsByType(items: TrendingItem[]): Partial<Record<ContentType, number>> {
  const counts: Partial<Record<ContentType, number>> = {}
  for (const item of items) {
    const type = (item.contentType ?? 'text') as ContentType
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

  const title = `Best of the internet, ${archive.label} — ADHX Trending Archive`
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
  const jsonLd = buildCollectionPageLd({
    name: title,
    description: `What the ADHX community saved and previewed the week of ${archive.label}.`,
    url: `${BASE_URL}/trending/archive/${archive.slug}`,
    baseUrl: BASE_URL,
    items: archive.items.map((item) => ({
      url: itemHref(item),
      name: item.authorName || item.text || item.author || undefined,
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
            href="/trending/archive"
            className="text-sm font-medium text-ink-2 transition-colors hover:text-ink"
          >
            Archive
          </Link>
          <Link
            href="/trending"
            className="text-sm font-medium text-ink-2 transition-colors hover:text-ink"
          >
            Trending
          </Link>
          <ThemeToggle />
        </div>
      </nav>

      <main className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
        <Link
          href="/trending/archive"
          className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-ink-2 transition-colors hover:text-ink"
        >
          <ArrowLeft size={15} />
          All weeks
        </Link>

        <h1 className="font-serif text-3xl font-semibold tracking-[-0.015em] text-ink sm:text-4xl">
          {title}
        </h1>
        <p className="mt-2.5 text-[15px] text-ink-2">
          {archive.totalCount} {archive.totalCount === 1 ? 'post' : 'posts'} the ADHX community
          saved and previewed this week — {describeCounts(archive.items)}.
        </p>

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {archive.items.map((item) => (
            <ArchiveItemCard key={`${item.platform}:${item.bookmarkId ?? item.url}`} item={item} />
          ))}
        </div>

        <div className="mt-10 flex items-center justify-between border-t border-hairline pt-6">
          {prevSlug ? (
            <Link
              href={`/trending/archive/${prevSlug}`}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-2 transition-colors hover:text-ink"
            >
              <ArrowLeft size={15} />
              Previous week
            </Link>
          ) : (
            <span />
          )}
          {nextSlug ? (
            <Link
              href={`/trending/archive/${nextSlug}`}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-2 transition-colors hover:text-ink"
            >
              Next week
              <ArrowRight size={15} />
            </Link>
          ) : (
            <span />
          )}
        </div>
      </main>
    </div>
  )
}

const monthDay = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
})

/** Static, server-rendered card for one archived post — mirrors DiscoverCard's shapes without client interactivity. */
function ArchiveItemCard({ item }: { item: TrendingItem }) {
  const type = (item.contentType ?? 'text') as ContentType
  const isMedia = type === 'video' || type === 'photo'
  const isArticle = type === 'article'
  const hasThumb = Boolean(item.thumbnailUrl)
  const caption = (item.text || '').trim()
  const href = itemHref(item)
  const time = monthDay.format(new Date(item.createdAt))
  const saveCount = item.saveCount ?? 0

  const TopRight =
    saveCount >= 2 ? (
      <div className="absolute right-2.5 top-2.5">
        <span className="inline-flex items-center gap-1 rounded-full bg-black/50 px-2.5 py-1 text-[11.5px] font-bold text-orange-300 backdrop-blur-sm">
          <Flame size={12} className="text-orange-400" fill="currentColor" />
          {saveCount}
        </span>
      </div>
    ) : null

  let body: React.ReactNode
  if (isMedia) {
    body = (
      <div className="relative flex flex-1 min-h-[200px]">
        {hasThumb ? (
          <img
            src={item.thumbnailUrl!}
            alt=""
            referrerPolicy="no-referrer"
            loading="lazy"
            className="absolute inset-0 h-full w-full bg-inset object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-ink to-[#15110d]" />
        )}
        {caption && (
          <div
            className="absolute inset-0"
            style={{ background: 'linear-gradient(transparent 42%, rgba(11,11,17,.84))' }}
            aria-hidden
          />
        )}
        <div className="absolute left-2.5 top-2.5">
          <TypeBadge type={type} />
        </div>
        {type === 'video' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-md">
              <Play size={18} fill="currentColor" />
            </span>
          </div>
        )}
        {caption && (
          <div className="absolute inset-x-0 bottom-0 px-3.5 pb-3 pt-8">
            <p className="line-clamp-2 text-[13.5px] font-medium leading-snug text-white [text-shadow:0_1px_3px_rgba(0,0,0,.55)]">
              {caption}
            </p>
          </div>
        )}
      </div>
    )
  } else if (isArticle && hasThumb) {
    body = (
      <div className="relative flex flex-1 min-h-[210px]">
        <img
          src={item.thumbnailUrl!}
          alt=""
          referrerPolicy="no-referrer"
          loading="lazy"
          className="absolute inset-0 h-full w-full bg-inset object-cover"
        />
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(transparent 30%, rgba(11,11,17,.86))' }}
          aria-hidden
        />
        <div className="absolute left-2.5 top-2.5">
          <TypeBadge type="article" />
        </div>
        <div className="absolute inset-x-0 bottom-0 px-4 pb-3.5 pt-8">
          <h3 className="font-serif font-semibold text-[17px] leading-tight text-white line-clamp-3 [text-shadow:0_1px_3px_rgba(0,0,0,.5)]">
            {caption || 'Article'}
          </h3>
        </div>
      </div>
    )
  } else if (isArticle) {
    body = (
      <div className="relative flex flex-1 min-h-[200px] flex-col overflow-hidden p-4 bg-gradient-to-br from-clay/[0.14] to-surface">
        <FileText
          className="absolute -right-5 -bottom-[22px] w-[120px] h-[120px] text-clay/[0.13]"
          aria-hidden
        />
        <div className="relative flex items-center gap-1.5">
          <TypeBadge type="article" />
        </div>
        <h3 className="relative mt-3.5 font-serif font-semibold text-[18px] leading-tight text-ink line-clamp-4">
          {caption || 'Article'}
        </h3>
      </div>
    )
  } else {
    body = (
      <div className="flex-1 px-4 pt-4">
        <div className="mb-2.5 flex items-center gap-2.5">
          {item.authorAvatarUrl ? (
            <img
              src={item.authorAvatarUrl}
              alt=""
              referrerPolicy="no-referrer"
              loading="lazy"
              className="h-8 w-8 flex-none rounded-full bg-inset object-cover"
            />
          ) : (
            <span className="h-8 w-8 flex-none rounded-full bg-inset" />
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate font-bold text-[13.5px] text-ink">
              {item.authorName || (item.author ? `@${item.author}` : 'Saved post')}
            </div>
            {item.author && (
              <div className="truncate font-mono text-[11.5px] text-ink-3">@{item.author}</div>
            )}
          </div>
        </div>
        <p className="line-clamp-4 text-[14.5px] leading-relaxed text-ink">
          {caption || 'Saved post'}
        </p>
      </div>
    )
  }

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-card border border-hairline bg-surface shadow-m-sm">
      <a href={href} className="relative flex flex-1 flex-col">
        {body}
        {TopRight}
      </a>
      <div className="mt-auto flex items-center gap-2.5 px-3.5 py-3">
        <span className="inline-flex items-center gap-2.5">
          <span className="inline-flex h-9 w-9 flex-none items-center justify-center rounded-full border border-hairline bg-inset text-ink-2">
            <PlatformGlyph platform={item.platform} size={17} />
          </span>
          <span className="font-mono text-[12.5px] text-ink-3">{time}</span>
        </span>
        <a
          href={href}
          className="ml-auto flex-none rounded-full bg-clay-grad px-3.5 py-2 text-[13px] font-semibold text-white shadow-glow transition-opacity duration-150 hover:opacity-90"
        >
          View
        </a>
      </div>
    </article>
  )
}
