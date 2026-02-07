import { MetadataRoute } from 'next'
import { db } from '@/lib/db'
import { tagShares, bookmarkTags, bookmarks, oauthTokens } from '@/lib/db/schema'
import { eq, and, inArray } from 'drizzle-orm'

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://adhx.com'

  const entries: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
  ]

  try {
    // Find all public tag shares with their usernames
    const publicShares = db
      .select({
        userId: tagShares.userId,
        tag: tagShares.tag,
        username: oauthTokens.username,
      })
      .from(tagShares)
      .innerJoin(oauthTokens, eq(tagShares.userId, oauthTokens.userId))
      .where(eq(tagShares.isPublic, true))
      .all()

    // Add tag collection pages
    for (const share of publicShares) {
      if (!share.username) continue
      entries.push({
        url: `${baseUrl}/t/${share.username}/${share.tag}`,
        changeFrequency: 'daily',
        priority: 0.7,
      })
    }

    // Collect all tweet IDs from public tags (deduplicated)
    if (publicShares.length > 0) {
      const tweetUrlSet = new Set<string>()

      for (const share of publicShares) {
        const tagged = db
          .select({ bookmarkId: bookmarkTags.bookmarkId })
          .from(bookmarkTags)
          .where(and(eq(bookmarkTags.userId, share.userId), eq(bookmarkTags.tag, share.tag)))
          .all()

        if (tagged.length === 0) continue

        const bookmarkIds = tagged.map((t) => t.bookmarkId)
        const tweetsInTag = db
          .select({ id: bookmarks.id, author: bookmarks.author })
          .from(bookmarks)
          .where(and(eq(bookmarks.userId, share.userId), inArray(bookmarks.id, bookmarkIds)))
          .all()

        for (const tweet of tweetsInTag) {
          tweetUrlSet.add(`${baseUrl}/${tweet.author}/status/${tweet.id}`)
        }
      }

      for (const url of tweetUrlSet) {
        entries.push({
          url,
          changeFrequency: 'weekly',
          priority: 0.5,
        })
      }
    }
  } catch (error) {
    // If DB query fails (e.g., during build), return just the homepage
    console.error('Sitemap: failed to query public tags:', error)
  }

  return entries
}
