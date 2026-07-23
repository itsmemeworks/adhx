import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { Metadata } from 'next'
import { TikTokPreviewLanding } from '@/components/TikTokPreviewLanding'
import { fetchTikTokMetadata, isValidUsername, isValidVideoId } from '@/lib/media/tnktok'
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
  params: Promise<{ username: string; id: string }>
}

// This route is dynamic (reads cookies for auth), so it is never full-route
// cached. Crawl-cheapness comes instead from fetchTikTokMetadata()'s cached
// mirror scrape (unstable_cache, revalidate 3600) and the DB-first skip for
// saved posts.

/** Display fields TikTokPreviewLanding needs, sourced from a saved bookmark. */
interface SavedTikTok {
  author: string | null
  authorName: string | null
  description: string | null
}

/**
 * Cross-user lookup: is this TikTok already in someone's collection? Content is
 * identical regardless of saver (mirrors the cross-user reads in the trending
 * query / /api/activity), so a single row is enough — we render from it and skip
 * the external mirror fetch. We never select or expose `userId`.
 */
function getSavedTikTok(id: string): SavedTikTok | null {
  const row = db
    .select({
      author: bookmarks.author,
      authorName: bookmarks.authorName,
      text: bookmarks.text,
    })
    .from(bookmarks)
    .where(and(eq(bookmarks.platform, 'tiktok'), eq(bookmarks.id, id)))
    .limit(1)
    .get()
  if (!row) return null
  return { author: row.author, authorName: row.authorName, description: row.text }
}

function normalizeHandle(raw: string): string {
  // Next.js passes the dynamic segment URL-encoded, so `@user` arrives as `%40user`.
  const decoded = decodeURIComponent(raw)
  return decoded.startsWith('@') ? decoded.slice(1) : decoded
}

export default async function TikTokPreviewPage({ params }: Props) {
  const { username, id } = await params
  const handle = normalizeHandle(username)

  if (!isValidUsername(handle) || !isValidVideoId(id)) {
    redirect('/')
  }

  // DB-first: if anyone has saved this TikTok, render from the stored row and
  // skip the external mirror fetch entirely. The video itself plays via the
  // /api/media/tiktok proxy (resolved from handle+id), so the saved row's
  // author/name/description is all the UI needs.
  const saved = getSavedTikTok(id)
  const session = await getSession()
  const meta = saved ? null : await fetchTikTokMetadata(handle, id)

  const author = saved?.author || meta?.author || null
  const authorName = saved?.authorName || meta?.authorName || null
  const description = saved?.description || meta?.description || null
  const hasVideo = saved ? true : !!meta?.videoUrl
  const available = saved ? true : !!meta

  if (available && !isLikelyBot((await headers()).get('user-agent'))) {
    recordActivity({
      action: 'preview',
      platform: 'tiktok',
      bookmarkId: id,
      author: author || handle,
      authorName: authorName,
      text: description || meta?.title || null,
      thumbnailUrl: null, // tnktok exposes no poster; card falls back to the glyph
      url: previewPath('tiktok', author || handle, id),
    })
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const jsonLd = buildVideoObjectLd({
    name: meta?.title || description || `@${handle} on TikTok`,
    description: description || undefined,
    thumbnailUrl: `${baseUrl}/api/media/tiktok/thumbnail?username=${encodeURIComponent(handle)}&id=${encodeURIComponent(id)}`,
    contentUrl: hasVideo
      ? `${baseUrl}/api/media/tiktok/video?username=${encodeURIComponent(handle)}&id=${encodeURIComponent(id)}`
      : undefined,
    author: {
      name: authorName || author || `@${handle}`,
      url: `https://www.tiktok.com/@${handle}`,
    },
  })

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScriptContent(jsonLd) }}
      />
      <TikTokPreviewLanding
        username={handle}
        videoId={id}
        authorName={authorName || undefined}
        author={author || undefined}
        description={description || undefined}
        hasVideo={hasVideo}
        isAuthenticated={!!session}
      />
      {available && (
        <RelatedSaves
          platform="tiktok"
          bookmarkId={id}
          authorHandle={author || handle}
          contentType="video"
        />
      )}
    </>
  )
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username, id } = await params
  const handle = normalizeHandle(username)

  if (!isValidUsername(handle) || !isValidVideoId(id)) {
    return { title: 'ADHX — Save now. Read never. Find always.' }
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const canonicalUrl = `${baseUrl}/@${handle}/video/${id}`
  const meta = await fetchTikTokMetadata(handle, id)

  const who = meta?.authorName || meta?.author || `@${handle}`

  // Content-first `<title>` + SERP description: lead with the TikTok's own
  // caption/title, not the old "Preview @user's TikTok" utility pitch.
  const pageTitle = buildContentTitle(meta?.title || meta?.description || `${who} on TikTok`)
  const description = buildContentDescription(
    meta?.description || meta?.title || `A TikTok by @${handle}.`,
  )
  // Poster via the thumbnail proxy so the card unfurls with an image.
  const image = `${baseUrl}/api/media/tiktok/thumbnail?username=${encodeURIComponent(handle)}&id=${encodeURIComponent(id)}`

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
