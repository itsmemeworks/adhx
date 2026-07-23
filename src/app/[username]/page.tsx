import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ExternalLink, FileText, Play } from 'lucide-react'
import { getAuthorProfile, isValidHandle, type AuthorItem } from '@/lib/authors/query'
import { MatterLogo, PlatformGlyph, TypeBadge } from '@/components/matter'
import { ThemeToggle } from '@/components/ThemeToggle'
import { getSession } from '@/lib/auth/session'
import { formatRelativeTime } from '@/lib/utils/format'
import { jsonLdScriptContent } from '@/lib/utils/structured-data'

/**
 * `/{username}` — public author hub. Catches X handle-name search queries
 * (Google Search Console shows impressions for e.g. "hachitune" with no page
 * to land on) and lists the author's publicly-known saved/previewed posts on
 * ADHX, each linking to its on-ADHX preview page.
 *
 * Reads the runtime SQLite DB (migrated at container startup, not present at
 * build time) — must stay dynamic, same reasoning as /trending.
 */
export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ username: string }>
}

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://adhx.com'

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
  const { username } = await params
  const profile = await loadProfile(username)
  if (!profile) {
    return {
      title: 'ADHX - Save now. Read never. Find always.',
      description: 'For people who bookmark everything and read nothing.',
    }
  }

  const displayName = profile.authorName
    ? `${profile.authorName} (@${profile.handle})`
    : `@${profile.handle}`
  const title = `@${profile.handle} — saved posts`
  const description = `${profile.totalCount} public post${profile.totalCount === 1 ? '' : 's'} by ${displayName}, saved and previewed on ADHX — X posts, videos, photos and articles.`
  const canonicalUrl = `${BASE_URL}/${profile.handle}`

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
        : [{ url: `${BASE_URL}/og-logo.png`, width: 1200, height: 630, alt: 'ADHX' }],
    },
    twitter: {
      card: 'summary',
      title,
      description,
      images: profile.avatarUrl ? [profile.avatarUrl] : [`${BASE_URL}/og-logo.png`],
    },
  }
}

function AuthorItemCard({ item, handle }: { item: AuthorItem; handle: string }) {
  const type = item.contentType
  const hasThumb = Boolean(item.thumbnailUrl)
  const isMedia = type === 'video' || type === 'photo'
  const isArticle = type === 'article'

  return (
    <a
      href={item.url}
      className="group flex flex-col overflow-hidden rounded-card border border-hairline bg-surface shadow-m-sm transition-colors hover:border-clay/40"
    >
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
          <div className="absolute left-2.5 top-2.5">
            <TypeBadge type={type} />
          </div>
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
            {item.text || `A post by @${handle}`}
          </p>
        </div>
      )}

      <div className="mt-auto flex items-center gap-2 border-t border-hairline px-3.5 py-2.5">
        <PlatformGlyph platform="twitter" size={13} className="text-ink-3" />
        <span className="font-mono text-[11.5px] text-ink-3" suppressHydrationWarning>
          {formatRelativeTime(item.createdAt)}
        </span>
        {item.saveCount > 0 && (
          <span className="font-mono text-[11.5px] text-ink-3">
            &middot; {item.saveCount} save{item.saveCount === 1 ? '' : 's'}
          </span>
        )}
        <span className="ml-auto inline-flex items-center gap-1 text-[12px] font-semibold text-clay opacity-0 transition-opacity group-hover:opacity-100">
          Preview <ExternalLink size={12} />
        </span>
      </div>
    </a>
  )
}

export default async function AuthorHubPage({ params }: Props) {
  const { username } = await params
  const [profile, session] = await Promise.all([loadProfile(username), getSession()])
  if (!profile) notFound()
  const signedOut = !session

  const displayName = profile.authorName || `@${profile.handle}`
  const profileUrl = `${BASE_URL}/${profile.handle}`
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
              url: `${BASE_URL}${item.url}`,
              ...(item.text ? { name: item.text } : {}),
            })),
          },
        }
      : {}),
  }

  return (
    <div className="min-h-screen bg-paper">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScriptContent(jsonLd) }}
      />

      {/* Wayfinding for visitors arriving from search — the global Header
          (AppShell) renders nothing for signed-out users, so this page supplies
          its own way back to ADHX plus the theme toggle here, matching the
          signed-out branch of DiscoverFeed (/trending). Signed-in visitors
          already have the global Header, so we skip this to avoid a double nav. */}
      {signedOut && (
        <>
          <ThemeToggle className="fixed right-3 top-3 z-50 border border-hairline bg-surface/70 shadow-m-sm backdrop-blur" />
          <nav className="px-5 pt-5 sm:px-11">
            <Link href="/" aria-label="ADHX home" className="inline-flex hover:opacity-80">
              <MatterLogo size={18} />
            </Link>
          </nav>
        </>
      )}

      <header className="border-b border-hairline px-5 py-10 sm:px-11">
        <div className="mx-auto flex max-w-5xl items-center gap-4">
          {profile.avatarUrl ? (
            <img
              src={profile.avatarUrl}
              alt=""
              referrerPolicy="no-referrer"
              className="h-16 w-16 flex-none rounded-full border border-hairline object-cover"
            />
          ) : (
            <div className="flex h-16 w-16 flex-none items-center justify-center rounded-full border border-hairline bg-inset text-ink-3">
              <PlatformGlyph platform="twitter" size={24} />
            </div>
          )}
          <div className="min-w-0">
            <h1 className="truncate font-serif text-2xl font-semibold text-ink">{displayName}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-2">
              <span>@{profile.handle}</span>
              <span>&middot;</span>
              <span>
                {profile.totalCount} public post{profile.totalCount === 1 ? '' : 's'} on ADHX
              </span>
              <a
                href={xProfileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-clay hover:opacity-80"
              >
                View on X <ExternalLink size={12} />
              </a>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-8 sm:px-11">
        {/* Crawlable list — same content as the visual grid below, present so a
            no-JS client / crawler with a stricter reader sees plain text links. */}
        <ul className="sr-only">
          {profile.items.map((item) => (
            <li key={item.bookmarkId}>
              <a href={item.url}>{item.text || `Post by @${profile.handle}`}</a>
            </li>
          ))}
        </ul>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {profile.items.map((item) => (
            <AuthorItemCard key={item.bookmarkId} item={item} handle={profile.handle} />
          ))}
        </div>
      </main>
    </div>
  )
}
