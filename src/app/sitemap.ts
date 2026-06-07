import { MetadataRoute } from 'next'
import { db } from '@/lib/db'
import { tagShares, bookmarks, oauthTokens, activity } from '@/lib/db/schema'
import { eq, desc } from 'drizzle-orm'
import { previewPath } from '@/lib/activity/record'
import type { PlatformId } from '@/lib/platform/url'
import { FILTER_SLUGS } from '@/lib/trending/filter'

/**
 * Single sitemap served at /sitemap.xml (where robots.txt points).
 *
 * Rendered at request time, NOT build time: it reads the runtime SQLite DB,
 * which is only migrated at container startup, so a build-time render would hit
 * a table-less DB. force-dynamic also means new saves/previews show up without
 * waiting on a deploy.
 *
 * (A previous version sharded this via generateSitemaps(), but that serves only
 * /sitemap/<id>.xml with no /sitemap.xml index — breaking the robots-declared
 * URL. At this scale a single sitemap is well under the 50k-URL / 50MB limits;
 * the URL_CAP backstop guards against unbounded growth.)
 *
 * ANONYMITY: the activity read selects ONLY public columns — `userId` is never
 * touched here.
 */
export const dynamic = 'force-dynamic'

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://adhx.com'

/** The four content platforms whose saved/previewed posts map to preview URLs. */
const PLATFORMS: PlatformId[] = ['twitter', 'instagram', 'tiktok', 'youtube']

/** Backstop so a runaway table can't produce an oversized sitemap (limit 50k). */
const URL_CAP = 45_000

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()

  // Hubs: homepage, the cross-network /trending hub, and the per-lens hubs.
  const entries: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${baseUrl}/trending`, lastModified: now, changeFrequency: 'hourly', priority: 0.9 },
  ]
  for (const slug of FILTER_SLUGS) {
    entries.push({
      url: `${baseUrl}/trending/${slug}`,
      lastModified: now,
      changeFrequency: 'hourly',
      priority: 0.8,
    })
  }

  // Public tag-collection pages (`/t/{user}/{tag}`). Private tags are excluded.
  try {
    const publicShares = db
      .select({ tag: tagShares.tag, username: oauthTokens.username })
      .from(tagShares)
      .innerJoin(oauthTokens, eq(tagShares.userId, oauthTokens.userId))
      .where(eq(tagShares.isPublic, true))
      .all()
    for (const share of publicShares) {
      if (!share.username) continue
      entries.push({
        url: `${baseUrl}/t/${share.username}/${share.tag}`,
        changeFrequency: 'daily',
        priority: 0.7,
      })
    }
  } catch (error) {
    console.error('Sitemap: failed to query public tags:', error)
  }

  // Content previews across all platforms: every distinct saved post, plus
  // preview-only posts (surfaced via the pulse but never saved), de-duped by
  // their on-ADHX preview path.
  const seen = new Set<string>()
  for (const platform of PLATFORMS) {
    try {
      // Saved content: distinct (platform, id) across all users — one preview
      // URL per post, regardless of how many users saved it.
      const saved = db
        .selectDistinct({
          id: bookmarks.id,
          author: bookmarks.author,
          createdAt: bookmarks.createdAt,
        })
        .from(bookmarks)
        .where(eq(bookmarks.platform, platform))
        .all()
      for (const b of saved) {
        if (!b.id || !b.author) continue
        const path = previewPath(platform, b.author, b.id)
        if (seen.has(path)) continue
        seen.add(path)
        entries.push({
          url: `${baseUrl}${path}`,
          lastModified: b.createdAt ? new Date(b.createdAt) : undefined,
          changeFrequency: 'weekly',
          priority: 0.5,
        })
      }

      // Preview-only items, de-duped against the saved set by preview path.
      const previewed = db
        .selectDistinct({
          bookmarkId: activity.bookmarkId,
          author: activity.author,
          createdAt: activity.createdAt,
        })
        .from(activity)
        .where(eq(activity.platform, platform))
        .orderBy(desc(activity.createdAt))
        .all()
      for (const a of previewed) {
        if (!a.bookmarkId || !a.author) continue
        const path = previewPath(platform, a.author, a.bookmarkId)
        if (seen.has(path)) continue
        seen.add(path)
        entries.push({
          url: `${baseUrl}${path}`,
          lastModified: a.createdAt ? new Date(a.createdAt) : undefined,
          changeFrequency: 'weekly',
          priority: 0.4,
        })
      }
    } catch (error) {
      console.error(`Sitemap: failed to query ${platform} content:`, error)
    }
  }

  if (entries.length > URL_CAP) {
    console.warn(`Sitemap: ${entries.length - URL_CAP} URLs over the ${URL_CAP} cap — dropping.`)
    return entries.slice(0, URL_CAP)
  }

  return entries
}
