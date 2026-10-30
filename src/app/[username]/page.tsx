import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ExternalLink } from 'lucide-react'
import { getAuthorProfile, isValidHandle } from '@/lib/authors/query'
import {
  PlayLink,
  ProfileHero,
  ProfileLayout,
  ProfilePostGrid,
  SECONDARY_ACTION,
} from '@/components/next/profile/ProfileParts'
import { jsonLdScriptContent } from '@/lib/utils/structured-data'
import { appUrl } from '@/lib/routes/app-url'

/**
 * `/{username}` — public author hub. Catches X handle-name search queries
 * (Google Search Console shows impressions for e.g. "hachitune" with no page
 * to land on) and lists the author's publicly-known saved/previewed posts on
 * ADHX, each linking to its on-ADHX preview page.
 *
 * Reads the runtime SQLite DB (migrated at container startup, not present at
 * build time) — must stay dynamic, same reasoning as the preview pages.
 */
export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ username: string }>
}

async function loadProfile(usernameParam: string) {
  // Next may hand us a percent-encoded segment (e.g. a stray %40) — decode
  // before validating/querying.
  let decoded: string
  try {
    decoded = decodeURIComponent(usernameParam)
  } catch {
    return null
  }
  if (!isValidHandle(decoded)) return null
  return getAuthorProfile(decoded)
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const baseUrl = appUrl()
  const { username } = await params
  const profile = await loadProfile(username)
  if (!profile) {
    // Shows the 404: titled like it (the template adds "| ADHX").
    return { title: 'Not found', robots: { index: false } }
  }

  const displayName = profile.authorName
    ? `${profile.authorName} (@${profile.handle})`
    : `@${profile.handle}`
  const title = `@${profile.handle} — saved posts`
  const description = `${profile.totalCount} public post${profile.totalCount === 1 ? '' : 's'} by ${displayName}, saved and previewed on ADHX — X posts, videos, photos and articles.`
  const canonicalUrl = `${baseUrl}/${profile.handle}`

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
        ? [{ url: profile.avatarUrl, alt: displayName }]
        : [{ url: `${baseUrl}/og-logo.png`, width: 1200, height: 630, alt: 'ADHX' }],
    },
    twitter: {
      card: 'summary',
      title,
      description,
      images: profile.avatarUrl ? [profile.avatarUrl] : [`${baseUrl}/og-logo.png`],
    },
  }
}

export default async function AuthorHubPage({ params }: Props) {
  const baseUrl = appUrl()
  const { username } = await params
  const profile = await loadProfile(username)
  if (!profile) notFound()

  const displayName = profile.authorName || `@${profile.handle}`
  const profileUrl = `${baseUrl}/${profile.handle}`
  const xProfileUrl = `https://x.com/${profile.handle}`

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    url: profileUrl,
    mainEntity: {
      '@type': 'Person',
      name: displayName,
      alternateName: `@${profile.handle}`,
      url: xProfileUrl,
      ...(profile.avatarUrl ? { image: profile.avatarUrl } : {}),
    },
    ...(profile.items.length > 0
      ? {
          hasPart: {
            '@type': 'ItemList',
            itemListElement: profile.items.map((item, index) => ({
              '@type': 'ListItem',
              position: index + 1,
              url: `${baseUrl}${item.url}`,
              ...(item.text ? { name: item.text } : {}),
            })),
          },
        }
      : {}),
  }

  return (
    <ProfileLayout>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScriptContent(jsonLd) }}
      />
      {/* Crawlable list: the same posts as plain links, for crawlers and no-JS. */}
      <ul className="sr-only">
        {profile.items.map((item) => (
          <li key={item.bookmarkId}>
            <a href={item.url}>{item.text || `Post by @${profile.handle}`}</a>
          </li>
        ))}
      </ul>
      <ProfileHero
        avatarUrl={profile.avatarUrl}
        handle={profile.handle}
        name={displayName}
        lines={[`${profile.totalCount} public post${profile.totalCount === 1 ? '' : 's'} on ADHX`]}
        actions={
          <>
            {profile.items[0] && <PlayLink href={profile.items[0].url} label="Play the newest" />}
            <a
              href={xProfileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={SECONDARY_ACTION}
            >
              <span>View on X</span>
              <ExternalLink aria-hidden className="h-4 w-4" />
            </a>
          </>
        }
      />
      <ProfilePostGrid
        author={profile.handle}
        posts={profile.items.map((item) => ({
          key: item.bookmarkId,
          url: item.url,
          text: item.text,
          thumbnailUrl: item.thumbnailUrl,
          kind: item.contentType,
          meta:
            item.saveCount > 0
              ? `${item.saveCount} save${item.saveCount === 1 ? '' : 's'}`
              : undefined,
        }))}
      />
    </ProfileLayout>
  )
}
