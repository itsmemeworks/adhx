import { MetadataRoute } from 'next'
import { db } from '@/lib/db'
import { tagShares, bookmarks, oauthTokens, activity } from '@/lib/db/schema'
import { eq, desc } from 'drizzle-orm'
import { previewPath } from '@/lib/activity/record'
import type { PlatformId } from '@/lib/platform/url'
import { FILTER_SLUGS } from '@/lib/trending/filter'

/**
 * Sharded sitemap index. Next re-runs each shard's DB query hourly (rather than
 * baking URLs at build time, which only refreshed on deploy).
 */
export const revalidate = 3600

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://adhx.com'

/** The four content platforms, each gets its own preview-URL shard. */
const PLATFORMS: PlatformId[] = ['twitter', 'instagram', 'tiktok', 'youtube']

/**
 * Per-shard URL cap. Sitemaps allow 50k URLs / 50MB; we stay well under both.
 * Anything beyond the cap is dropped (and the count logged) so a runaway table
 * can't produce an oversized sitemap.
 */
const SHARD_CAP = 45_000

/**
 * One shard per platform plus a `hubs` shard (homepage + /trending hubs + all
 * public tag-collection pages). Keeps each file under the 50k-URL limit and
 * lets Next emit a sitemap index automatically.
 */
export async function generateSitemaps(): Promise<{ id: string }[]> {
  return [{ id: 'hubs' }, ...PLATFORMS.map((p) => ({ id: p }))]
}

/**
 * Hubs shard: homepage, the cross-network /trending hub + per-platform trending
 * hubs, and every public tag-collection page (`/t/{user}/{tag}`).
 */
function hubsSitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  const entries: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${baseUrl}/trending`, lastModified: now, changeFrequency: 'hourly', priority: 0.9 },
  ]

  // Per-lens trending hubs (videos / photos / text / articles / just-saved).
  for (const slug of FILTER_SLUGS) {
    entries.push({
      url: `${baseUrl}/trending/${slug}`,
      lastModified: now,
      changeFrequency: 'hourly',
      priority: 0.8,
    })
  }

  try {
    const publicShares = db
      .select({
        tag: tagShares.tag,
        username: oauthTokens.username,
      })
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
    // If DB query fails (e.g. during build), fall back to the static hubs above.
    console.error('Sitemap[hubs]: failed to query public tags:', error)
  }

  return entries
}

/**
 * Per-platform shard: every saved-content preview for the platform (distinct
 * by `(platform, id)`), plus any preview-only items from the activity pulse
 * that were never saved. URLs are built with the shared `previewPath()` so they
 * match the on-ADHX preview routes exactly.
 *
 * ANONYMITY: the activity read selects ONLY public columns — `userId` is never
 * touched here.
 */
function platformSitemap(platform: PlatformId): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = []

  try {
    // Saved content: distinct (platform, id) across all users. The same id can
    // be saved by many users; we want one preview URL per post.
    const saved = db
      .selectDistinct({
        id: bookmarks.id,
        author: bookmarks.author,
        createdAt: bookmarks.createdAt,
      })
      .from(bookmarks)
      .where(eq(bookmarks.platform, platform))
      .all()

    const seen = new Set<string>()
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

    // Preview-only items: surfaced via the pulse but never saved. De-duped
    // against the saved set above by their preview path.
    const previewed = db
      .selectDistinct({
        bookmarkId: activity.bookmarkId,
        author: activity.author,
        url: activity.url,
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
    console.error(`Sitemap[${platform}]: failed to query content:`, error)
    return []
  }

  if (entries.length > SHARD_CAP) {
    const dropped = entries.length - SHARD_CAP
    console.warn(`Sitemap[${platform}]: ${dropped} URLs over the ${SHARD_CAP} cap — dropping.`)
    return entries.slice(0, SHARD_CAP)
  }

  return entries
}

export default function sitemap({ id }: { id: string }): MetadataRoute.Sitemap {
  if (id === 'hubs') return hubsSitemap()
  if ((PLATFORMS as string[]).includes(id)) return platformSitemap(id as PlatformId)
  // Unknown shard id — degrade to homepage-only rather than throwing.
  return [{ url: baseUrl, lastModified: new Date(), changeFrequency: 'daily', priority: 1 }]
}
