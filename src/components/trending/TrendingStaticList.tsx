import type { TrendingItem } from '@/lib/trending/query'
import { PlatformGlyph, TypeBadge, type ContentType } from '@/components/matter'
import { previewPath } from '@/lib/activity/record'

/**
 * Shared server-rendered markup for the /trending hubs. Extracted from the
 * /trending route so both /trending and /trending/[platform] import it from a
 * stable component module rather than reaching into a sibling route's page.tsx.
 *
 * Renders ONLY public fields + previewPath links — no saver identity. See the
 * anonymity invariant in @/lib/trending/query.
 */

const PLATFORM_LABEL: Record<string, string> = {
  twitter: 'X',
  tiktok: 'TikTok',
  instagram: 'Instagram',
  youtube: 'YouTube',
}

/** Map an item to its on-ADHX preview path (keeps clicks on-site). */
export function itemHref(item: TrendingItem): string {
  if (item.bookmarkId) return previewPath(item.platform, item.author, item.bookmarkId)
  return item.url
}

/**
 * Server-rendered, crawlable list of trending items. Visually hidden (the live
 * <DiscoverFeed> grid is what users see) but present in the HTML source with
 * full text + links so search engines and no-JS clients get real content.
 *
 * Reused by both /trending and /trending/[platform].
 */
export function TrendingStaticList({ items, heading }: { items: TrendingItem[]; heading: string }) {
  if (items.length === 0) return null
  return (
    <section aria-label={heading} className="sr-only">
      <h2>{heading}</h2>
      <ul>
        {items.map((item) => {
          const href = itemHref(item)
          const type = (item.contentType ?? 'text') as ContentType
          const name = item.authorName || (item.author ? `@${item.author}` : 'Saved post')
          const platform = PLATFORM_LABEL[item.platform] ?? item.platform
          return (
            <li key={`${item.platform}:${item.bookmarkId ?? item.url}`}>
              <a href={href}>
                <span>
                  <PlatformGlyph platform={item.platform} size={14} />
                  {platform}
                </span>
                <TypeBadge type={type} />
                <span>{name}</span>
                {item.text ? <p>{item.text}</p> : null}
                {item.thumbnailUrl ? (
                  <img src={item.thumbnailUrl} alt="" referrerPolicy="no-referrer" />
                ) : null}
                {item.saveCount ? <span>{item.saveCount} saves</span> : null}
              </a>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
