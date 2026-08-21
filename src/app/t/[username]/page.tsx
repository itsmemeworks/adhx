import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, permanentRedirect } from 'next/navigation'
import { getPublicProfile, type PublicProfileResult } from '@/lib/users/profile'
import { resolveUsernameAlias } from '@/lib/users/lookup'
import { CollectionPosterCard } from '@/components/tags'
import { buildCollectionPageLd, jsonLdScriptContent } from '@/lib/utils/structured-data'

/**
 * `/t/{username}` — public curator profile page.
 *
 * Reads the runtime SQLite DB (migrated at container startup, not present at
 * build time) — must stay dynamic, same reasoning as `/trending` and
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

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://adhx.com'

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
  const title = `@${profile.username} — collections on ADHX`
  const description = collectionNames
    ? `${profile.publicTagCount} public collection${profile.publicTagCount === 1 ? '' : 's'} curated by @${profile.username}: ${collectionNames}.`
    : `Public collections curated by @${profile.username} on ADHX.`
  const canonicalUrl = `${BASE_URL}/t/${profile.username}`

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
        : [{ url: `${BASE_URL}/og-logo.png`, width: 1200, height: 630, alt: 'ADHX' }],
    },
    twitter: {
      card: 'summary',
      title,
      description,
      images: [profile.avatarUrl || `${BASE_URL}/og-logo.png`],
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
  const { username } = await params
  const result = await loadProfile(username)
  if (result.status === 'redirect') permanentRedirect(`/t/${result.username}`)
  if (result.status === 'not_found') notFound()

  const { profile } = result
  const canonicalUrl = `${BASE_URL}/t/${profile.username}`
  const memberSince = formatMemberSince(profile.memberSince)
  const monogram = profile.username.charAt(0).toUpperCase()

  const jsonLd = buildCollectionPageLd({
    name: `@${profile.username} — collections on ADHX`,
    description: `${profile.publicTagCount} public collection${profile.publicTagCount === 1 ? '' : 's'} curated by @${profile.username} on ADHX.`,
    url: canonicalUrl,
    baseUrl: BASE_URL,
    items: profile.collections.map((c) => ({ url: c.href, name: `#${c.tag}` })),
  })
  // ProfilePage doesn't have its own schema.org type distinct from generic
  // WebPage/CollectionPage semantics for this shape — reuse CollectionPage
  // (built for the /t/{username}/{tag} + /trending hubs) but tag it as a
  // ProfilePage via an explicit override so crawlers see the right entity.
  jsonLd['@type'] = 'ProfilePage'

  const stats = [
    `${profile.publicTagCount} collection${profile.publicTagCount === 1 ? '' : 's'}`,
    `${profile.postCount} post${profile.postCount === 1 ? '' : 's'} shared`,
    memberSince ? `curating since ${memberSince}` : null,
  ].filter((s): s is string => Boolean(s))

  return (
    <div className="min-h-screen" style={{ background: '#17130f' }}>
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

      <nav className="flex items-center justify-between px-5 pt-5 sm:px-11">
        <a href="/" aria-label="ADHX home" className="flex-none whitespace-nowrap">
          <img
            src="/adhx-cloud.png"
            alt=""
            aria-hidden
            style={{ height: 28 }}
            className="inline-block w-auto align-[-30%]"
          />
          <span className="ml-2 font-indie-flower leading-none text-white" style={{ fontSize: 24 }}>
            ADHX
          </span>
        </a>
        <Link
          href="/"
          className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white backdrop-blur transition-colors hover:bg-white/20"
        >
          Make your own
        </Link>
      </nav>

      <main className="mx-auto max-w-5xl px-5 pb-20 pt-10 sm:px-11">
        <header className="flex flex-col items-center gap-4 text-center">
          {profile.avatarUrl ? (
            <img
              src={profile.avatarUrl}
              alt=""
              referrerPolicy="no-referrer"
              className="h-[76px] w-[76px] rounded-full object-cover"
            />
          ) : (
            <div
              className="flex h-[76px] w-[76px] items-center justify-center rounded-full bg-clay-grad text-3xl font-semibold text-white"
              aria-hidden
            >
              {monogram}
            </div>
          )}
          <h1 className="font-serif text-[34px] font-medium text-white">@{profile.username}</h1>
          <p className="font-mono text-xs uppercase tracking-wide text-white/50">
            {stats.join(' · ')}
          </p>
        </header>

        <div className="mt-12 grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
          {profile.collections.map((c) => (
            <CollectionPosterCard
              key={c.tag}
              tag={c.tag}
              count={c.count}
              tiles={c.tiles}
              href={c.href}
            />
          ))}
        </div>
      </main>

      <footer className="flex flex-col items-center gap-4 px-5 py-14 text-center">
        <p className="text-sm text-white/40">Save now. Read never. Find always.</p>
        <Link
          href="/"
          className="inline-flex items-center rounded-full bg-clay-grad px-5 py-2.5 text-sm font-semibold text-white shadow-glow transition-opacity hover:opacity-90"
        >
          Start your collection
        </Link>
      </footer>
    </div>
  )
}
