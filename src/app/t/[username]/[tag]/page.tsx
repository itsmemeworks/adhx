import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, permanentRedirect } from 'next/navigation'
import { Lock } from 'lucide-react'
import { headers } from 'next/headers'
import { getPublicTagCollection, type TagCollectionResult } from '@/lib/tags/query'
import { getUserIdForUsername, resolveUsernameAlias } from '@/lib/users/lookup'
import { getCurrentUserId } from '@/lib/auth/session'
import { truncate } from '@/lib/utils/format'
import { buildCollectionPageLd, jsonLdScriptContent } from '@/lib/utils/structured-data'
import { recordCollectionEvent } from '@/lib/discovery/record'
import { isLikelyBot } from '@/lib/activity/bot'
import { recordAnalytic } from '@/lib/analytics/record'
import { PUBLIC_BASE_URL } from '@/lib/routes/base-url'
import { ChannelPage } from '@/components/next/channels/ChannelPage'

/**
 * `/t/{username}/{tag}` — a channel's page (a channel IS one shared tag).
 * Renders `ChannelPage`, plus crawlable links and JSON-LD for search engines.
 * Visibility is the same public/private gate as the JSON API
 * (`getPublicTagCollection` — see that module for the privacy invariant);
 * the owner still sees a private channel. Renamed curators 308 to their
 * current username.
 *
 * Reads the runtime SQLite DB (migrated at container startup, not present at
 * build time) — must stay dynamic.
 */
export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ username: string; tag: string }>
}

const BASE_URL = PUBLIC_BASE_URL

function playlistSocialCardUrl(username: string, tag: string): string {
  return `${BASE_URL}/api/og/playlist/${encodeURIComponent(username)}/${encodeURIComponent(tag)}`
}

const ANONYMOUS_PLAYLIST_CARD_URL = `${playlistSocialCardUrl('brand', 'card')}?generic=1`

type CollectionLoadResult =
  TagCollectionResult | { status: 'redirect'; username: string; tag: string }

/**
 * Resolves a playlist by username + tag, falling back to
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
  const noun = 'channel'

  if (result.status === 'redirect') {
    const redirectCardUrl = playlistSocialCardUrl(result.username, result.tag)
    return {
      title: `#${tag} — ADHX`,
      description: `A curated ${noun} on ADHX.`,
      openGraph: {
        images: [{ url: redirectCardUrl, width: 1200, height: 630, alt: `ADHX ${noun}` }],
      },
      twitter: { card: 'summary_large_image', images: [redirectCardUrl] },
    }
  }

  if (result.status === 'private') {
    return {
      title: `Private ${noun} — ADHX`,
      description: `This ${noun} is private.`,
      robots: { index: false, follow: false },
      openGraph: {
        images: [{ url: ANONYMOUS_PLAYLIST_CARD_URL, width: 1200, height: 630, alt: 'ADHX' }],
      },
      twitter: { card: 'summary_large_image', images: [ANONYMOUS_PLAYLIST_CARD_URL] },
    }
  }

  if (result.status === 'not_found') {
    return {
      title: `ADHX ${noun}`,
      description: 'Your friends have better taste than the algorithm.',
      openGraph: {
        images: [{ url: ANONYMOUS_PLAYLIST_CARD_URL, width: 1200, height: 630, alt: 'ADHX' }],
      },
      twitter: { card: 'summary_large_image', images: [ANONYMOUS_PLAYLIST_CARD_URL] },
    }
  }

  const { data } = result
  const previewTexts = data.items
    .map((t) => t.text)
    .filter((t): t is string => Boolean(t))
    .slice(0, 2)
    .join(' · ')

  const title = `#${data.tag} — @${data.username}'s ${noun} on ADHX`
  const description = previewTexts
    ? `${data.tweetCount} bookmark${data.tweetCount === 1 ? '' : 's'} curated by @${data.username}. ${truncate(previewTexts, 200)}`
    : `${data.tweetCount} bookmark${data.tweetCount === 1 ? '' : 's'} curated by @${data.username}.`
  const canonicalUrl = `${BASE_URL}/t/${data.username}/${data.tag}`
  const socialCardUrl = playlistSocialCardUrl(data.username, data.tag)

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
      images: [
        {
          url: socialCardUrl,
          width: 1200,
          height: 630,
          alt: `#${data.tag} ${noun} by @${data.username}`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [socialCardUrl],
    },
  }
}

export default async function SharedTagPage({ params }: Props) {
  const { username, tag } = await params
  const [result, viewerUserId] = await Promise.all([
    loadCollection(username, tag),
    getCurrentUserId(),
  ])
  if (result.status === 'redirect') permanentRedirect(`/t/${result.username}/${result.tag}`)
  if (result.status === 'not_found') notFound()

  if (result.status === 'private') {
    // The owner still sees their private channel here; everyone else is told it's private.
    let decoded: { username: string; tag: string } | null = null
    try {
      decoded = { username: decodeURIComponent(username), tag: decodeURIComponent(tag) }
    } catch {
      decoded = null
    }
    const ownerId = decoded && viewerUserId ? await getUserIdForUsername(decoded.username) : null
    if (decoded && viewerUserId && ownerId === viewerUserId) {
      return <ChannelPage username={decoded.username} tag={decoded.tag} count={0} mine signedIn />
    }
    return <PrivateChannel />
  }

  const { data } = result

  // Discovery leaderboard signal (docs/specs/discovery-leaderboards.md §4) —
  // record a human view of this public channel. Bot/crawler UAs are
  // skipped (same isLikelyBot() gate the pulse uses) so OG-unfurl requests
  // never inflate the leaderboard. Fire-and-forget; never affects rendering —
  // the try/catch also covers headers() outside a request scope (direct
  // renders in tests).
  const ownerId = await getUserIdForUsername(data.username)
  try {
    const ua = (await headers()).get('user-agent')
    if (!isLikelyBot(ua) && ownerId) {
      recordCollectionEvent({
        action: 'view',
        ownerUserId: ownerId,
        tag: data.tag,
        viewerId: viewerUserId,
      })
      recordAnalytic({
        name: 'theater.open',
        userId: viewerUserId,
        tag: data.tag,
        surface: 'playlist',
      })
    }
  } catch {
    // Stats must never break the page.
  }

  const jsonLd = buildCollectionPageLd({
    name: `#${data.tag} — @${data.username}'s channel on ADHX`,
    description: `${data.tweetCount} bookmark${data.tweetCount === 1 ? '' : 's'} curated by @${data.username} on ADHX.`,
    url: `${BASE_URL}/t/${data.username}/${data.tag}`,
    baseUrl: BASE_URL,
    items: data.items.map((item) => ({
      url: item.url,
      name: item.text || `A post by @${item.author}`,
    })),
  })

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScriptContent(jsonLd) }}
      />
      {/* Crawlable links for crawlers and no-JS clients; the channel page loads its posts itself. */}
      <ul className="sr-only">
        {data.items.map((item) => (
          <li key={`${item.platform}:${item.bookmarkId}`}>
            <a href={item.url}>{item.text || `A post by @${item.author}`}</a>
          </li>
        ))}
      </ul>
      <ChannelPage
        username={data.username}
        tag={data.tag}
        count={data.tweetCount}
        mine={!!viewerUserId && ownerId === viewerUserId}
        signedIn={!!viewerUserId}
      />
    </>
  )
}

function PrivateChannel() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-black px-6 text-center font-nx-sans text-white">
      <Lock aria-hidden className="h-8 w-8 text-white/50" />
      <h1 className="m-0 font-nx-serif text-[36px] font-normal leading-none">Private channel</h1>
      <p className="m-0 text-white/65">Only the person who made it can see this one.</p>
      <Link href="/" className="rounded-full bg-nx-accent px-5 py-3 text-sm font-bold text-black">
        Go to ADHX
      </Link>
    </main>
  )
}
