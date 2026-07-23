import { getRelatedSaves, type RelatedItem } from '@/lib/related/query'
import { PlatformGlyph, TypeBadge } from '@/components/matter'
import { AuthorAvatar } from '@/components/feed/AuthorAvatar'

/**
 * Server-rendered "related saves" footer for the public preview pages. Gives
 * the ~2,000 indexed preview pages somewhere to send crawl equity + clicks
 * instead of being sitemap-only orphans. Rendered as a sibling below the
 * (client) landing component so its links land in the crawlable HTML without
 * needing to thread data through a client component.
 *
 * Degrades to nothing (renders null) when there's no related content or the
 * lookup fails — a related-saves footer must never break the preview page.
 */
export async function RelatedSaves({
  platform,
  bookmarkId,
  authorHandle,
  contentType,
}: {
  platform: string
  bookmarkId: string
  authorHandle: string
  contentType?: RelatedItem['contentType']
}) {
  const items = await getRelatedSaves({ platform, bookmarkId, authorHandle, contentType })
  if (items.length === 0) return null

  const handle = authorHandle.replace(/^@+/, '')

  return (
    <section className="relative z-10 bg-paper">
      <div className="max-w-[1040px] mx-auto px-4 sm:px-6 lg:px-12 pb-14">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="font-serif font-semibold text-ink text-xl">More to discover</h2>
          {handle && (
            <a
              href={`/${handle}`}
              className="flex-none text-[13px] font-semibold text-clay hover:opacity-80 transition-opacity"
            >
              More from @{handle}
            </a>
          )}
        </div>
        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {items.map((item) => (
            <li key={`${item.platform}:${item.bookmarkId}`}>
              <RelatedCard item={item} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function RelatedCard({ item }: { item: RelatedItem }) {
  const caption = (item.text || '').trim()
  return (
    <a
      href={item.url}
      className="group flex h-full flex-col overflow-hidden rounded-card border border-hairline bg-surface transition-colors hover:border-clay/30"
    >
      <div className="relative aspect-[4/3] flex-none bg-inset">
        {item.thumbnailUrl ? (
          <img
            src={item.thumbnailUrl}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-ink-3">
            <PlatformGlyph platform={item.platform} size={22} />
          </div>
        )}
        {item.contentType && (
          <div className="absolute left-2 top-2">
            <TypeBadge type={item.contentType} />
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 p-2.5">
        <AuthorAvatar src={item.authorAvatarUrl ?? undefined} author={item.author} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12.5px] font-semibold text-ink">
            {item.authorName || `@${item.author}`}
          </div>
          <p className="truncate text-[11.5px] text-ink-3">{caption || 'View post'}</p>
        </div>
      </div>
    </a>
  )
}
