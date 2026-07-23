import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { Metadata } from 'next'
import { YouTubePreviewLanding } from '@/components/YouTubePreviewLanding'
import {
  fetchYouTubeMetadata,
  isValidVideoId,
  youtubeThumbnail,
  youtubeEmbedUrl,
} from '@/lib/media/youtube'
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
// cached. Crawl-cheapness comes instead from fetchYouTubeMetadata()'s cached
// oEmbed fetch (next.revalidate 3600) and the DB-first skip for saved posts.

/** Display fields YouTubePreviewLanding needs, sourced from a saved bookmark. */
interface SavedShort {
  author: string | null
  authorName: string | null
  title: string | null
}

/**
 * Cross-user lookup: is this Short already in someone's collection? Content is
 * identical regardless of saver (mirrors the cross-user reads in the trending
 * query / /api/activity), so a single row is enough — we render from it and skip
 * the YouTube oEmbed fetch. We never select or expose `userId`.
 */
function getSavedShort(id: string): SavedShort | null {
  const row = db
    .select({
      author: bookmarks.author,
      authorName: bookmarks.authorName,
      text: bookmarks.text,
    })
    .from(bookmarks)
    .where(and(eq(bookmarks.platform, 'youtube'), eq(bookmarks.id, id)))
    .limit(1)
    .get()
  if (!row) return null
  return { author: row.author, authorName: row.authorName, title: row.text }
}

export default async function ShortPreviewPage({ params }: Props) {
  const { id } = await params

  if (!isValidVideoId(id)) {
    redirect('/')
  }

  // DB-first: if anyone has saved this Short, render from the stored row and
  // skip the YouTube oEmbed fetch. The player is the official iframe embed
  // (resolved from the id), so the saved row's title/author is all the UI needs.
  const saved = getSavedShort(id)
  const session = await getSession()
  const meta = saved ? null : await fetchYouTubeMetadata(id)

  const author = saved?.author || meta?.author || null
  const authorName = saved?.authorName || meta?.authorName || null
  const title = saved?.title || meta?.title || null
  const available = saved ? true : !!meta
  const previewAuthor = author?.replace(/^@/, '') || authorName || 'youtube'

  if (available && !isLikelyBot((await headers()).get('user-agent'))) {
    recordActivity({
      action: 'preview',
      platform: 'youtube',
      bookmarkId: id,
      author: previewAuthor,
      authorName: authorName,
      text: title,
      thumbnailUrl: youtubeThumbnail(id),
      url: previewPath('youtube', previewAuthor, id),
    })
  }

  const ldAuthorName = authorName || author
  const jsonLd = buildVideoObjectLd({
    name: title || 'YouTube Short',
    thumbnailUrl: youtubeThumbnail(id),
    embedUrl: youtubeEmbedUrl(id),
    author: ldAuthorName ? { name: ldAuthorName } : undefined,
  })

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScriptContent(jsonLd) }}
      />
      <YouTubePreviewLanding
        videoId={id}
        title={title || undefined}
        authorName={authorName || undefined}
        author={author || undefined}
        hasVideo={available}
        isAuthenticated={!!session}
      />
      {available && (
        <RelatedSaves
          platform="youtube"
          bookmarkId={id}
          authorHandle={previewAuthor}
          contentType="video"
        />
      )}
    </>
  )
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params

  if (!isValidVideoId(id)) {
    return { title: 'ADHX — Save now. Read never. Find always.' }
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const canonicalUrl = `${baseUrl}/shorts/${id}`
  const meta = await fetchYouTubeMetadata(id)

  const who = meta?.authorName || meta?.author

  // Content-first `<title>`: the Short's own title (already content-led via
  // oEmbed) gets the brand suffix instead of the old "Preview @user's Short"
  // pitch; falls back to an author-aware label when oEmbed has no title.
  const pageTitle = buildContentTitle(
    meta?.title || (who ? `${who}'s Short on YouTube` : 'YouTube Short'),
  )
  const description = buildContentDescription(
    meta?.title
      ? `${meta.title}${who ? ` by ${who}` : ''} on YouTube.`
      : who
        ? `${who} on YouTube.`
        : 'A YouTube Short.',
  )
  const image = meta ? youtubeThumbnail(id) : `${baseUrl}/og-logo.png`

  return {
    title: pageTitle,
    description,
    openGraph: {
      type: 'video.other',
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
