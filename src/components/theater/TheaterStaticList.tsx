import { NETWORK_LABELS } from '@/lib/platform/networks'
import type { TheaterItem } from './types'
import { PlatformGlyph, TypeBadge } from '@/components/matter'
import { inferType } from '@/lib/trending/filter'
import { previewPath } from '@/lib/activity/preview-path'
import { buildCollectionPageLd, jsonLdScriptContent } from '@/lib/utils/structured-data'
import { appUrl } from '@/lib/routes/app-url'

/**
 * Server-rendered, crawlable content behind the signed-out `/` theater
 * (docs/specs/theater-first.md §3/§11). The theater itself is a client
 * component with no server-rendered post text, so this block carries:
 *
 *  - the landing hero copy (so the value prop stays crawlable, per §11's
 *    SEO-regression mitigation — the LandingPage copy this replaces was
 *    crawlable by nature of being real DOM content),
 *  - a real `<ol>` of the seeded items linking to their on-ADHX preview path,
 *  - `CollectionPage`/`ItemList` JSON-LD, in the same style as the /trending
 *    hubs (`TrendingStaticList`).
 *
 * Visually hidden (`sr-only`) — the live theater is what users see — but
 * present in the HTML source for crawlers and no-JS clients.
 *
 * ANONYMITY: items come from `getTheaterFeed()` / `getTrendingItems()`, the
 * audited choke point that never selects `activity.userId`. No saver
 * identity is rendered here.
 */

const PLATFORM_LABEL: Record<string, string> = NETWORK_LABELS

function itemHref(item: TheaterItem): string {
  if (item.bookmarkId) {
    return previewPath(item.platform, item.author, item.bookmarkId, item.contentType)
  }
  return item.url
}

export function TheaterStaticList({
  items,
  savedToday,
}: {
  items: TheaterItem[]
  savedToday: number
}) {
  const baseUrl = appUrl()
  const jsonLd = buildCollectionPageLd({
    name: 'ADHX — save it, lose it, find it',
    description:
      'What people here are saving right now, from X, Instagram, TikTok, YouTube and more. Save any post to your own collection and find it again later.',
    url: baseUrl,
    baseUrl,
    items: items.map((item) => ({
      url: itemHref(item),
      name: item.authorName || item.text || item.author || undefined,
    })),
  })

  return (
    <section aria-label="ADHX" className="sr-only">
      <h1>ADHX — Your friends have better taste than the algorithm.</h1>
      <p>
        ADHX keeps the posts you save from X, Instagram, TikTok, YouTube and ten more networks, with
        their videos and photos stored on this server, so they&apos;re there when you want them.
        Describe what you remember to find one again.
      </p>
      <p>
        To save a post, paste its link here, or put this ADHX&apos;s address in front of it and open
        that.
      </p>
      {savedToday > 0 && <p>{savedToday} posts saved today.</p>}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScriptContent(jsonLd) }}
      />
      {items.length > 0 && (
        <ol>
          {items.map((item) => {
            const href = itemHref(item)
            const type = inferType(item)
            const name = item.authorName || (item.author ? `@${item.author}` : 'Saved post')
            const platform = PLATFORM_LABEL[item.platform] ?? item.platform
            return (
              <li key={`${item.platform}:${item.bookmarkId ?? item.url}`}>
                <a href={href}>
                  <span>
                    <PlatformGlyph platform={item.platform} size={14} />
                    <span>{platform}</span>
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
        </ol>
      )}
    </section>
  )
}
