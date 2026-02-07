import { Metadata } from 'next'
import { db } from '@/lib/db'
import { tagShares, bookmarkTags, bookmarks, bookmarkMedia, oauthTokens } from '@/lib/db/schema'
import { eq, and, inArray, desc } from 'drizzle-orm'
import { truncate } from '@/lib/utils/format'
import { resolveMediaUrl } from '@/lib/media/fxembed'
import TagCollectionClient from './TagCollectionClient'

interface Props {
  params: Promise<{ username: string; tag: string }>
}

/**
 * Fetch lightweight metadata for a shared tag collection.
 * Returns null if tag doesn't exist or isn't public.
 */
async function getTagMetadata(username: string, tagName: string) {
  try {
    const [user] = await db
      .select({ userId: oauthTokens.userId })
      .from(oauthTokens)
      .where(eq(oauthTokens.username, username))
      .limit(1)

    if (!user) return null

    const [share] = await db
      .select()
      .from(tagShares)
      .where(and(eq(tagShares.userId, user.userId), eq(tagShares.tag, tagName)))
      .limit(1)

    if (!share?.isPublic) return null

    // Get bookmark IDs for this tag
    const taggedBookmarkIds = await db
      .select({ bookmarkId: bookmarkTags.bookmarkId })
      .from(bookmarkTags)
      .where(and(eq(bookmarkTags.userId, user.userId), eq(bookmarkTags.tag, tagName)))

    const bookmarkIds = taggedBookmarkIds.map((t) => t.bookmarkId)
    if (bookmarkIds.length === 0) return { tweetCount: 0, description: '', ogImage: null }

    // Get first few tweets for description text
    const topTweets = await db
      .select({ id: bookmarks.id, text: bookmarks.text, author: bookmarks.author })
      .from(bookmarks)
      .where(and(eq(bookmarks.userId, user.userId), inArray(bookmarks.id, bookmarkIds)))
      .orderBy(desc(bookmarks.processedAt))
      .limit(3)

    // Find the first tweet with media for og:image
    const firstMedia = await db
      .select({
        bookmarkId: bookmarkMedia.bookmarkId,
        mediaType: bookmarkMedia.mediaType,
        previewUrl: bookmarkMedia.previewUrl,
      })
      .from(bookmarkMedia)
      .where(and(eq(bookmarkMedia.userId, user.userId), inArray(bookmarkMedia.bookmarkId, bookmarkIds)))
      .limit(1)

    let ogImage: string | null = null
    if (firstMedia.length > 0) {
      const media = firstMedia[0]
      const mediaBookmark = topTweets.find((t) => t.id === media.bookmarkId) || topTweets[0]
      if (mediaBookmark) {
        ogImage = resolveMediaUrl({
          tweetId: media.bookmarkId,
          author: mediaBookmark.author,
          mediaType: media.mediaType as 'photo' | 'video' | 'animated_gif',
          mediaIndex: 1,
        })
      }
    }

    // Build description from first tweet texts
    const previewTexts = topTweets
      .map((t) => t.text)
      .filter(Boolean)
      .slice(0, 2)
      .join(' · ')

    const description = previewTexts
      ? `${bookmarkIds.length} bookmarks curated by @${username}. ${truncate(previewTexts, 200)}`
      : `${bookmarkIds.length} bookmarks curated by @${username}.`

    return { tweetCount: bookmarkIds.length, description, ogImage }
  } catch {
    return null
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username, tag } = await params
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  const meta = await getTagMetadata(username, tag)

  if (!meta) {
    return {
      title: `#${tag} — ADHX`,
      description: 'A curated collection on ADHX.',
    }
  }

  const title = `#${tag} — @${username}'s collection on ADHX`
  const canonicalUrl = `${baseUrl}/t/${username}/${tag}`

  return {
    title,
    description: meta.description,
    openGraph: {
      type: 'article',
      title,
      description: meta.description,
      siteName: 'ADHX',
      url: canonicalUrl,
      images: meta.ogImage
        ? [{ url: meta.ogImage, alt: `#${tag} collection by @${username}` }]
        : [{ url: `${baseUrl}/og-logo.png`, width: 1200, height: 630, alt: 'ADHX' }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: meta.description,
      images: meta.ogImage ? [meta.ogImage] : [`${baseUrl}/og-logo.png`],
    },
  }
}

export default async function SharedTagPage({ params }: Props) {
  const { username, tag } = await params
  return <TagCollectionClient username={username} tag={tag} />
}
