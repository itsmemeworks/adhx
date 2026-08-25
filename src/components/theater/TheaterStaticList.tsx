import type { TheaterItem } from './types'
import { PlatformGlyph, TypeBadge } from '@/components/matter'
import { inferType } from '@/lib/trending/filter'
import { previewPath } from '@/lib/activity/preview-path'
import { buildCollectionPageLd, jsonLdScriptContent } from '@/lib/utils/structured-data'
import { PUBLIC_BASE_URL } from '@/lib/routes/base-url'

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

const PLATFORM_LABEL: Record<string, string> = {
  twitter: 'X',
  tiktok: 'TikTok',
  instagram: 'Instagram',
  youtube: 'YouTube',
}

const BASE_URL = PUBLIC_BASE_URL

function itemHref(item: TheaterItem): string {
  if (item.bookmarkId) return previewPath(item.platform, item.author, item.bookmarkId)
  return item.url
}

export function TheaterStaticList({
  items,
  savedToday,
}: {
  items: TheaterItem[]
  savedToday: number
}) {
  const jsonLd = buildCollectionPageLd({
    name: 'ADHX — save now, read never, find always',
    description:
      'A live theater of what people are watching and sending across X, TikTok, Instagram and YouTube right now — save any post to your own collection in one tap and find it again later.',
    url: BASE_URL,
    baseUrl: BASE_URL,
    items: items.map((item) => ({
      url: itemHref(item),
      name: item.authorName || item.text || item.author || undefined,
    })),
  })

  return (
    <section aria-label="ADHX" className="sr-only">
      <h1>ADHX — Save now. Read never. Find always.</h1>
      <p>
        ADHX is a bookmark manager for X (Twitter), Instagram Reels, TikTok videos, and YouTube
        Shorts. Watch what the community is saving and sending right now, then save anything you
        like straight to your own collection so it&apos;s there when you actually want it — no more
        scrolling back through your feed trying to find that one post.
      </p>
      <p>
        No app needed to preview a post first: replace the host in any link with adhx.com — for
        example x.com/username/status/12345 becomes adhx.com/username/status/12345 — for an instant
        preview you can save or send on from there.
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
