import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { Metadata } from 'next'
import { InstagramPreviewLanding } from '@/components/InstagramPreviewLanding'
import { fetchReelMetadata, isValidReelId } from '@/lib/media/instafix'
import { getSession } from '@/lib/auth/session'
import { recordActivity, previewPath } from '@/lib/activity/record'
import { isLikelyBot } from '@/lib/activity/bot'
import { buildVideoObjectLd, jsonLdScriptContent } from '@/lib/utils/structured-data'
import { buildContentTitle, buildContentDescription } from '@/lib/utils/content-metadata'
import { RelatedSaves } from '@/components/RelatedSaves'
import { db } from '@/lib/db'
import { bookmarks } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'

interface Props {
  params: Promise<{ id: string }>
}

// This route is dynamic (reads cookies for auth), so it is never full-route
// cached. Crawl-cheapness comes instead from fetchReelMetadata()'s cached scrape
// (unstable_cache, revalidate 3600) and the DB-first skip for saved posts.

/** Display fields InstagramPreviewLanding needs, sourced from a saved bookmark. */
interface SavedReel {
  author: string | null
  authorName: string | null
  caption: string | null
}

/**
 * Cross-user lookup: is this Reel already in someone's collection? Content is
 * identical regardless of saver (mirrors the cross-user reads in the trending
 * query / /api/activity), so a single row is enough — we render from it and skip
 * the Instagram scrape. We never select or expose `userId`.
 */
function getSavedReel(id: string): SavedReel | null {
  const row = db
    .select({
      author: bookmarks.author,
      authorName: bookmarks.authorName,
      text: bookmarks.text,
    })
    .from(bookmarks)
    .where(and(eq(bookmarks.platform, 'instagram'), eq(bookmarks.id, id)))
    .limit(1)
    .get()
  if (!row) return null
  return { author: row.author, authorName: row.authorName, caption: row.text }
}

export default async function ReelPreviewPage({ params }: Props) {
  const { id } = await params

  if (!isValidReelId(id)) {
    redirect('/')
  }

  // DB-first: if anyone has saved this Reel, render from the stored row and skip
  // the Instagram scrape. The poster is served via the /api/media/instagram
  // thumbnail proxy (it re-resolves the signed CDN URL from the id), so the
  // saved row's author/name/caption is all the UI needs.
  const saved = getSavedReel(id)
  const session = await getSession()
  const meta = saved ? null : await fetchReelMetadata(id)

  const author = saved?.author || meta?.author || null
  const authorName = saved?.authorName || meta?.authorName || null
  const caption = saved?.caption || meta?.caption || null
  const description = saved ? null : meta?.description || null
  // Saved reels always get the proxy poster; preview-only only when a CDN image
  // was resolved.
  const hasImage = saved ? true : !!meta?.imageUrl
  const imageUrl = hasImage
    ? `/api/media/instagram/thumbnail?id=${encodeURIComponent(id)}`
    : undefined
  const available = saved ? true : !!meta

  if (available && !isLikelyBot((await headers()).get('user-agent'))) {
    recordActivity({
      action: 'preview',
      platform: 'instagram',
      bookmarkId: id,
      author: author || 'instagram',
      authorName: authorName || author || null,
      text: caption || description || null,
      thumbnailUrl: imageUrl ?? null,
      url: previewPath('instagram', author || 'instagram', id),
    })
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const ldAuthorName = authorName || author
  const jsonLd = buildVideoObjectLd({
    name: caption || description || (authorName ? `${authorName} on Instagram` : 'Instagram Reel'),
    description: caption || description || undefined,
    thumbnailUrl: imageUrl ? `${baseUrl}${imageUrl}` : undefined,
    // No contentUrl: Instagram playback is degraded (mirrors dead — poster +
    // caption only), so we don't advertise a non-working media URL.
    author: ldAuthorName
      ? {
          name: ldAuthorName,
          url: author ? `https://www.instagram.com/${author}` : undefined,
        }
      : undefined,
  })

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScriptContent(jsonLd) }}
      />
      <InstagramPreviewLanding
        reelId={id}
        caption={caption || undefined}
        description={description || undefined}
        // Served via the proxy (re-resolves the signed CDN URL fresh).
        imageUrl={imageUrl}
        author={author || undefined}
        authorName={authorName || undefined}
        isAuthenticated={!!session}
      />
      {available && (
        <RelatedSaves
          platform="instagram"
          bookmarkId={id}
          authorHandle={author || 'instagram'}
          contentType="video"
        />
      )}
    </>
  )
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params

  if (!isValidReelId(id)) {
    return {
      title: 'ADHX — Save now. Read never. Find always.',
    }
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const canonicalUrl = `${baseUrl}/reels/${id}`
  const meta = await fetchReelMetadata(id)

  const who = meta?.authorName || meta?.author
  const caption = meta?.caption || meta?.description || ''

  // Content-first `<title>` + SERP description: lead with the caption itself,
  // falling back to an author-aware label when there's no caption to lead
  // with — not the old "Preview @user's reel" utility pitch.
  const pageTitle = buildContentTitle(caption || (who ? `Reel by ${who}` : 'Instagram Reel'))
  const description = buildContentDescription(
    caption || (who ? `${who} on Instagram.` : 'An Instagram Reel.'),
  )
  const image = meta?.imageUrl
    ? `${baseUrl}/api/media/instagram/thumbnail?id=${encodeURIComponent(id)}`
    : `${baseUrl}/og-logo.png`

  return {
    title: pageTitle,
    description,
    openGraph: {
      type: 'article',
      title: pageTitle,
      description,
      siteName: 'ADHX',
      url: canonicalUrl,
      images: [{ url: image, alt: pageTitle }],
    },
    twitter: {
      card: 'summary_large_image',
      title: pageTitle,
      description,
      images: [image],
    },
    alternates: {
      canonical: canonicalUrl,
    },
  }
}
