import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, permanentRedirect } from 'next/navigation'
import { Lock, Tag as TagIcon } from 'lucide-react'
import { getPublicTagCollection, type TagCollectionResult } from '@/lib/tags/query'
import { resolveUsernameAlias } from '@/lib/users/lookup'
import { MatterLogo } from '@/components/matter'
import { ThemeToggle } from '@/components/ThemeToggle'
import { getSession } from '@/lib/auth/session'
import { truncate } from '@/lib/utils/format'
import { buildCollectionPageLd, jsonLdScriptContent } from '@/lib/utils/structured-data'
import { TheaterShell } from '@/components/theater/TheaterShell'
import { buildCollectionSeed } from '@/lib/theater/tag-seed'

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

type CollectionLoadResult =
  TagCollectionResult | { status: 'redirect'; username: string; tag: string }

/**
 * Resolves a collection by username + tag, falling back to
 * `username_aliases` when the username 404s — a curator who's since renamed
 * still resolves, via `{ status: 'redirect' }`, so the page component can
 * 308 old shared links to the current username instead of dead-ending them.
 */
async function loadCollection(
  usernameParam: string,
  tagParam: string,
): Promise<CollectionLoadResult> {
  let username: string
  let tag: string
  try {
    username = decodeURIComponent(usernameParam)
    tag = decodeURIComponent(tagParam)
  } catch {
    return { status: 'not_found' }
  }
  const result = await getPublicTagCollection(username, tag)
  if (result.status === 'not_found') {
    const alias = await resolveUsernameAlias(username)
    if (alias) return { status: 'redirect', username: alias.username, tag }
  }
  return result
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username, tag } = await params
  const result = await loadCollection(username, tag)

  if (result.status === 'redirect') {
    return {
      title: `#${tag} — ADHX`,
      description: 'A curated collection on ADHX.',
    }
  }

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
  if (result.status === 'redirect') permanentRedirect(`/t/${result.username}/${result.tag}`)
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

  // An empty collection has nothing to loop through — the theater needs at
  // least one item, so this stays the plain empty-state page instead.
  if (data.items.length === 0) {
    return (
      <div className="flex min-h-screen flex-col bg-paper">
        {signedOut && <SignedOutNav />}
        <div className="flex flex-1 items-center justify-center px-4">
          <div className="max-w-md text-center">
            <TagIcon className="mx-auto mb-4 h-12 w-12 text-ink-3" />
            <h1 className="font-serif text-2xl font-semibold text-ink">#{data.tag}</h1>
            <p className="mt-2 text-ink-2">No bookmarks with this tag yet.</p>
          </div>
        </div>
        <PoweredByFooter />
      </div>
    )
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScriptContent(jsonLd) }}
      />

      {/* Crawlable content for crawlers/no-JS clients — the interactive
          `TheaterShell` below (full-viewport, `fixed inset-0`) is what
          visitors actually see, and carries the tag/curator identity chrome
          itself, so there's no separate visual header on this route. */}
      <ul className="sr-only">
        {data.items.map((item) => (
          <li key={`${item.platform}:${item.bookmarkId}`}>
            <a href={item.url}>{item.text || `A post by @${item.author}`}</a>
          </li>
        ))}
      </ul>

      <TheaterShell
        seed={buildCollectionSeed(data.items)}
        mode="collection"
        authed={!signedOut}
        collection={{ tag: data.tag, curator: data.username, count: data.tweetCount }}
      />
    </>
  )
}
