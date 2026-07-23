import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ExternalLink, FileText, Lock, Play, Tag as TagIcon } from 'lucide-react'
import { getPublicTagCollection, type TagItem, type TagCollectionResult } from '@/lib/tags/query'
import { MatterLogo, PlatformGlyph, TypeBadge } from '@/components/matter'
import { ThemeToggle } from '@/components/ThemeToggle'
import { getSession } from '@/lib/auth/session'
import { formatRelativeTime, truncate } from '@/lib/utils/format'
import { buildCollectionPageLd, jsonLdScriptContent } from '@/lib/utils/structured-data'
import AddToCollectionButton from './TagCollectionClient'

/**
 * `/t/{username}/{tag}` — public shared-tag collection page.
 *
 * Historically this page only fetched metadata server-side and left every
 * item to a client-side `useEffect` fetch — invisible to crawlers and a
 * flash-of-nothing for visitors. It also linked every card straight to
 * x.com, leaking the click off-site. This rewrite server-renders the real
 * item grid (mirrors the `/trending` + `/{username}` hubs), links each card
 * to its on-ADHX preview path, and enforces the exact same public/private
 * gate as the JSON API (`getPublicTagCollection` — see that module for the
 * privacy invariant).
 *
 * Reads the runtime SQLite DB (migrated at container startup, not present at
 * build time) — must stay dynamic, same reasoning as /trending and /{username}.
 */
export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ username: string; tag: string }>
}

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://adhx.com'

function toAbsolute(url: string): string {
  if (/^https?:\/\//.test(url)) return url
  return `${BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`
}

async function loadCollection(
  usernameParam: string,
  tagParam: string,
): Promise<TagCollectionResult> {
  let username: string
  let tag: string
  try {
    username = decodeURIComponent(usernameParam)
    tag = decodeURIComponent(tagParam)
  } catch {
    return { status: 'not_found' }
  }
  return getPublicTagCollection(username, tag)
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username, tag } = await params
  const result = await loadCollection(username, tag)

  if (result.status === 'private') {
    return {
      title: `#${tag} — ADHX`,
      description: 'This collection is private.',
      robots: { index: false, follow: false },
    }
  }

  if (result.status === 'not_found') {
    return {
      title: `#${tag} — ADHX`,
      description: 'A curated collection on ADHX.',
    }
  }

  const { data } = result
  const previewTexts = data.items
    .map((t) => t.text)
    .filter((t): t is string => Boolean(t))
    .slice(0, 2)
    .join(' · ')

  const title = `#${data.tag} — @${data.username}'s collection on ADHX`
  const description = previewTexts
    ? `${data.tweetCount} bookmark${data.tweetCount === 1 ? '' : 's'} curated by @${data.username}. ${truncate(previewTexts, 200)}`
    : `${data.tweetCount} bookmark${data.tweetCount === 1 ? '' : 's'} curated by @${data.username}.`
  const canonicalUrl = `${BASE_URL}/t/${data.username}/${data.tag}`
  const ogImage = data.items.find((i) => i.thumbnailUrl)?.thumbnailUrl

  return {
    title,
    description,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      type: 'article',
      title,
      description,
      siteName: 'ADHX',
      url: canonicalUrl,
      images: ogImage
        ? [{ url: toAbsolute(ogImage), alt: `#${data.tag} collection by @${data.username}` }]
        : [{ url: `${BASE_URL}/og-logo.png`, width: 1200, height: 630, alt: 'ADHX' }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage ? toAbsolute(ogImage) : `${BASE_URL}/og-logo.png`],
    },
  }
}

function TagItemCard({ item }: { item: TagItem }) {
  const type = item.contentType
  const hasThumb = Boolean(item.thumbnailUrl)
  const isMedia = type === 'video' || type === 'photo'
  const isArticle = type === 'article'

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-card border border-hairline bg-surface shadow-m-sm transition-colors hover:border-clay/40">
      <a href={item.url} className="flex flex-1 flex-col">
        {(isMedia || (isArticle && hasThumb)) && (
          <div className="relative flex min-h-[160px] flex-1">
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
            <div
              className="absolute inset-0"
              style={{ background: 'linear-gradient(transparent 42%, rgba(11,11,17,.84))' }}
              aria-hidden
            />
            <div className="absolute left-2.5 top-2.5 flex items-center gap-1.5">
              <TypeBadge type={type} />
            </div>
            {item.extraMediaCount > 0 && (
              <div className="absolute right-2.5 top-2.5 rounded-full bg-black/50 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur-sm">
                +{item.extraMediaCount}
              </div>
            )}
            {type === 'video' && (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-md">
                  <Play size={16} fill="currentColor" />
                </span>
              </div>
            )}
            {item.text && (
              <p className="absolute inset-x-0 bottom-0 line-clamp-2 px-3.5 pb-3 pt-8 text-[13px] font-medium leading-snug text-white [text-shadow:0_1px_3px_rgba(0,0,0,.55)]">
                {item.text}
              </p>
            )}
          </div>
        )}

        {isArticle && !hasThumb && (
          <div className="relative flex min-h-[160px] flex-1 flex-col overflow-hidden bg-gradient-to-br from-clay/[0.14] to-surface p-4">
            <FileText
              className="absolute -bottom-[22px] -right-5 h-[110px] w-[110px] text-clay/[0.13]"
              aria-hidden
            />
            <TypeBadge type="article" />
            <h3 className="relative mt-3 line-clamp-4 font-serif text-[16px] font-semibold leading-tight text-ink">
              {item.text || 'Article'}
            </h3>
          </div>
        )}

        {!isMedia && !isArticle && (
          <div className="flex-1 p-4">
            <TypeBadge type={type} />
            <p className="mt-2.5 line-clamp-4 text-[14px] leading-relaxed text-ink">
              {item.text || `A post by @${item.author}`}
            </p>
          </div>
        )}
      </a>

      <div className="mt-auto flex items-center gap-2 border-t border-hairline px-3.5 py-2.5">
        <PlatformGlyph platform={item.platform} size={13} className="text-ink-3" />
        <span className="truncate text-[12px] font-medium text-ink-2">@{item.author}</span>
        {item.createdAt && (
          <span className="font-mono text-[11.5px] text-ink-3" suppressHydrationWarning>
            &middot; {formatRelativeTime(item.createdAt)}
          </span>
        )}
        {item.externalUrl && (
          <a
            href={item.externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="View on the original platform"
            title="View on the original platform"
            className="ml-auto flex-none text-ink-3 opacity-0 transition-opacity hover:text-clay group-hover:opacity-100"
          >
            <ExternalLink size={13} />
          </a>
        )}
      </div>
    </div>
  )
}

/** Quiet footer badge shown on every branch of this page (public, private, empty). */
function PoweredByFooter() {
  return (
    <footer className="border-t border-hairline px-5 py-8 text-center sm:px-11">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-ink-3 transition-colors hover:text-clay"
      >
        Made with <MatterLogo size={13} /> ↗
      </Link>
    </footer>
  )
}

function SignedOutNav() {
  return (
    <>
      <ThemeToggle className="fixed right-3 top-3 z-50 border border-hairline bg-surface/70 shadow-m-sm backdrop-blur" />
      <nav className="px-5 pt-5 sm:px-11">
        <Link href="/" aria-label="ADHX home" className="inline-flex hover:opacity-80">
          <MatterLogo size={18} />
        </Link>
      </nav>
    </>
  )
}

export default async function SharedTagPage({ params }: Props) {
  const { username, tag } = await params
  const [result, session] = await Promise.all([loadCollection(username, tag), getSession()])
  if (result.status === 'not_found') notFound()

  const signedOut = !session

  if (result.status === 'private') {
    return (
      <div className="flex min-h-screen flex-col bg-paper">
        {signedOut && <SignedOutNav />}
        <div className="flex flex-1 items-center justify-center px-4">
          <div className="max-w-md text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-hairline bg-inset">
              <Lock className="h-8 w-8 text-ink-3" />
            </div>
            <h1 className="font-serif text-2xl font-semibold text-ink">Private collection</h1>
            <p className="mt-2 text-ink-2">This tag isn&apos;t publicly shared.</p>
            <Link
              href="/"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-clay-grad px-4 py-2 text-sm font-semibold text-white shadow-glow transition-opacity hover:opacity-90"
            >
              Go to ADHX
            </Link>
          </div>
        </div>
        <PoweredByFooter />
      </div>
    )
  }

  const { data } = result
  const canonicalUrl = `${BASE_URL}/t/${data.username}/${data.tag}`

  const jsonLd = buildCollectionPageLd({
    name: `#${data.tag} — @${data.username}'s collection on ADHX`,
    description: `${data.tweetCount} bookmark${data.tweetCount === 1 ? '' : 's'} curated by @${data.username} on ADHX.`,
    url: canonicalUrl,
    baseUrl: BASE_URL,
    items: data.items.map((item) => ({
      url: item.url,
      name: item.text || `A post by @${item.author}`,
    })),
  })

  return (
    <div className="min-h-screen bg-paper">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScriptContent(jsonLd) }}
      />

      {signedOut && <SignedOutNav />}

      <header className="border-b border-hairline px-5 py-10 sm:px-11">
        <div className="mx-auto flex max-w-5xl items-center gap-4">
          <div className="flex h-14 w-14 flex-none items-center justify-center rounded-full border border-hairline bg-clay/10 text-clay">
            <TagIcon size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-serif text-2xl font-semibold text-ink">#{data.tag}</h1>
            <p className="mt-1 text-sm text-ink-2">
              by @{data.username} &middot; {data.tweetCount} bookmark
              {data.tweetCount === 1 ? '' : 's'}
            </p>
          </div>
          <AddToCollectionButton username={data.username} tag={data.tag} />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-8 sm:px-11">
        {data.items.length === 0 ? (
          <div className="py-16 text-center">
            <TagIcon className="mx-auto mb-4 h-12 w-12 text-ink-3" />
            <p className="text-ink-2">No bookmarks with this tag yet.</p>
          </div>
        ) : (
          <>
            {/* Crawlable list — same content as the visual grid below, present so a
                no-JS client / crawler with a stricter reader sees plain text links. */}
            <ul className="sr-only">
              {data.items.map((item) => (
                <li key={`${item.platform}:${item.bookmarkId}`}>
                  <a href={item.url}>{item.text || `A post by @${item.author}`}</a>
                </li>
              ))}
            </ul>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {data.items.map((item) => (
                <TagItemCard key={`${item.platform}:${item.bookmarkId}`} item={item} />
              ))}
            </div>
          </>
        )}
      </main>

      <PoweredByFooter />
    </div>
  )
}
