import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, permanentRedirect } from 'next/navigation'
import { getPublicProfile, type PublicProfileResult } from '@/lib/users/profile'
import { resolveUsernameAlias } from '@/lib/users/lookup'
import { getCurrentUserId } from '@/lib/auth/session'
import { buildCollectionPageLd, jsonLdScriptContent } from '@/lib/utils/structured-data'
import { Play } from 'lucide-react'
import { ChannelCover } from '@/components/next/channels/ChannelParts'
import { channelTitle } from '@/components/next/channels/title'
import { channelPlayHref } from '@/components/next/theater/queue'
import {
  ProfileHero,
  ProfileLayout,
  SECONDARY_ACTION,
} from '@/components/next/profile/ProfileParts'
import { appUrl } from '@/lib/routes/app-url'

/**
 * `/t/{username}` — public curator profile page.
 *
 * Reads the runtime SQLite DB (migrated at container startup, not present at
 * build time) — must stay dynamic, same reasoning as
 * `/t/{username}/{tag}`.
 *
 * Coexists with `/t/{username}/{tag}` — Next.js routing picks whichever
 * route has the matching segment count, so this only ever matches the
 * one-segment `/t/{username}` path.
 */
export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ username: string }>
}

type ProfileLoadResult = PublicProfileResult | { status: 'redirect'; username: string }

/**
 * Resolves a profile by username, falling back to `username_aliases` when
 * the direct lookup 404s — a curator who's since renamed still resolves,
 * via `{ status: 'redirect' }`, so the page component can 308 old shared
 * links to the current username instead of dead-ending them.
 */
async function loadProfile(usernameParam: string): Promise<ProfileLoadResult> {
  let username: string
  try {
    username = decodeURIComponent(usernameParam)
  } catch {
    return { status: 'not_found' }
  }
  const result = await getPublicProfile(username)
  if (result.status === 'not_found') {
    const alias = await resolveUsernameAlias(username)
    if (alias) return { status: 'redirect', username: alias.username }
  }
  return result
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const baseUrl = appUrl()
  const { username } = await params
  const result = await loadProfile(username)

  if (result.status === 'not_found' || result.status === 'redirect') {
    return {
      title: `@${username} — ADHX`,
      description: 'A curator on ADHX.',
    }
  }

  const { profile } = result
  const collectionNames = profile.collections.map((c) => `#${c.tag}`).join(', ')
  const title = `@${profile.username} — channels on ADHX`
  const description = collectionNames
    ? `${profile.publicTagCount} public channel${profile.publicTagCount === 1 ? '' : 's'} by @${profile.username}: ${collectionNames}.`
    : `Public channels by @${profile.username} on ADHX.`
  const canonicalUrl = `${baseUrl}/t/${profile.username}`

  return {
    title,
    description,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      type: 'profile',
      title,
      description,
      siteName: 'ADHX',
      url: canonicalUrl,
      images: profile.avatarUrl
        ? [{ url: profile.avatarUrl, alt: `@${profile.username} on ADHX` }]
        : [{ url: `${baseUrl}/og-logo.png`, width: 1200, height: 630, alt: 'ADHX' }],
    },
    twitter: {
      card: 'summary',
      title,
      description,
      images: [profile.avatarUrl || `${baseUrl}/og-logo.png`],
    },
  }
}

/** "August 2026" from an ISO timestamp. Falls back to null for an unparseable/missing date. */
function formatMemberSince(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

export default async function CuratorProfilePage({ params }: Props) {
  const baseUrl = appUrl()
  const { username } = await params
  const [result, viewerId] = await Promise.all([loadProfile(username), getCurrentUserId()])
  if (result.status === 'redirect') permanentRedirect(`/t/${result.username}`)
  if (result.status === 'not_found') notFound()

  const { profile } = result
  const canonicalUrl = `${baseUrl}/t/${profile.username}`
  const memberSince = formatMemberSince(profile.memberSince)
  // Three states for both the top-right pill and the footer pitch block
  // (owner review: "why am I seeing Make your own as an authenticated
  // user?"): signed out gets the sign-up CTAs; the profile's own owner gets
  // a "Manage playlists" shortcut instead and no footer pitch; a visitor
  // signed in as someone ELSE gets no substitute CTA at all.
  const isSignedOut = viewerId == null
  const isOwnProfile = viewerId != null && viewerId === profile.userId

  const jsonLd = buildCollectionPageLd({
    name: `@${profile.username} — channels on ADHX`,
    description: `${profile.publicTagCount} public channel${profile.publicTagCount === 1 ? '' : 's'} by @${profile.username} on ADHX.`,
    url: canonicalUrl,
    baseUrl,
    items: profile.collections.map((c) => ({ url: c.href, name: `#${c.tag}` })),
  })
  // ProfilePage doesn't have its own schema.org type distinct from generic
  // WebPage/CollectionPage semantics for this shape — reuse CollectionPage
  // (built for the /t/{username}/{tag} + /trending hubs) but tag it as a
  // ProfilePage via an explicit override so crawlers see the right entity.
  jsonLd['@type'] = 'ProfilePage'

  const stats = [
    `${profile.publicTagCount} public channel${profile.publicTagCount === 1 ? '' : 's'}`,
    `${profile.postCount} post${profile.postCount === 1 ? '' : 's'}`,
    memberSince ? `since ${memberSince}` : null,
    profile.stats.viewCount > 0 ? `${profile.stats.viewCount} views this week` : null,
  ].filter((s): s is string => Boolean(s))

  return (
    <ProfileLayout>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScriptContent(jsonLd) }}
      />
      {/* Crawlable content for crawlers/no-JS clients. */}
      <ul className="sr-only">
        {profile.collections.map((c) => (
          <li key={c.tag}>
            <a href={c.href}>#{c.tag}</a>
          </li>
        ))}
      </ul>
      <ProfileHero
        avatarUrl={profile.avatarUrl}
        handle={profile.username}
        name={profile.displayName || `@${profile.username}`}
        lines={stats}
        actions={
          isOwnProfile ? (
            <Link href="/channels" className={SECONDARY_ACTION}>
              Your channels
            </Link>
          ) : isSignedOut ? (
            <Link href="/start" className={SECONDARY_ACTION}>
              Make your own
            </Link>
          ) : undefined
        }
      />
      <section aria-labelledby="nx-curator-channels" className="flex flex-col gap-4">
        <h2
          id="nx-curator-channels"
          className="m-0 font-nx-serif text-[28px] font-normal md:text-[34px]"
        >
          Channels
        </h2>
        <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 xl:grid-cols-3">
          {profile.collections.map((c) => (
            <li key={c.tag} className="flex min-w-0 flex-col gap-2.5">
              <Link href={c.href} aria-label={`${channelTitle(c.tag)}, ${c.count} posts`}>
                <ChannelCover
                  tiles={c.tiles.map((t) => ({ img: t.thumbnailUrl ?? null, text: t.text ?? '' }))}
                  label={channelTitle(c.tag)}
                  className="aspect-[5/4] w-full"
                />
              </Link>
              <span className="flex items-center gap-3">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[17px] font-bold">{channelTitle(c.tag)}</span>
                  <span className="text-[13px] text-nx-ink/55">
                    {`${c.count} post${c.count === 1 ? '' : 's'}${c.stats?.viewCount ? ` · ${c.stats.viewCount} views this week` : ''}`}
                  </span>
                </span>
                <Link
                  href={channelPlayHref(profile.username, c.tag)}
                  aria-label={`Play ${channelTitle(c.tag)}`}
                  className="flex h-11 items-center gap-1.5 rounded-full bg-nx-accent px-4 text-sm font-extrabold text-black"
                >
                  <Play aria-hidden className="h-3.5 w-3.5" fill="currentColor" strokeWidth={0} />
                  <span>Play</span>
                </Link>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </ProfileLayout>
  )
}
