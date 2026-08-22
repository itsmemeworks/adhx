import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { Metadata } from 'next'
import { fetchReelMetadata, isValidReelId } from '@/lib/media/instafix'
import { resolveInstagramVideo } from '@/lib/media/mirrors'
import { getCurrentUserId } from '@/lib/auth/session'
import { previewPath } from '@/lib/activity/record'
import { isLikelyBot } from '@/lib/activity/bot'
import { buildVideoObjectLd } from '@/lib/utils/structured-data'
import {
  buildContentTitle,
  buildSnippetDescription,
  attributionFact,
  previewPageMetadata,
} from '@/lib/utils/content-metadata'
import { RelatedSaves } from '@/components/RelatedSaves'
import { reelToTheaterItem } from '@/lib/theater/shared-seed'
import {
  recordHumanPreview,
  SharedPreviewPage,
  sharedPreviewSeed,
} from '@/lib/theater/shared-preview'
import { getSavedPreviewDisplay } from '@/lib/theater/saved-preview'
import { PUBLIC_BASE_URL } from '@/lib/routes/base-url'

interface Props {
  params: Promise<{ id: string }>
}

// This route is dynamic (reads cookies for auth), so it is never full-route
// cached. Crawl-cheapness comes instead from fetchReelMetadata()'s cached scrape
// (unstable_cache, revalidate 3600) and the DB-first skip for saved posts.

export default async function ReelPreviewPage({ params }: Props) {
  const { id } = await params

  if (!isValidReelId(id)) {
    redirect('/')
  }

  // DB-first: if anyone has saved this Reel, render from the stored row and skip
  // the Instagram scrape. The poster is served via the /api/media/instagram
  // thumbnail proxy (it re-resolves the signed CDN URL from the id), so the
  // saved row's author/name/caption is all the UI needs.
  const saved = getSavedPreviewDisplay('instagram', id)
  const userId = await getCurrentUserId()
  const meta = saved ? null : await fetchReelMetadata(id)

  const author = saved?.author || meta?.author || null
  const authorName = saved?.authorName || meta?.authorName || null
  const caption = saved?.text || meta?.caption || null
  const description = saved ? null : meta?.description || null
  // Saved reels always get the proxy poster; preview-only only when a CDN image
  // was resolved.
  const hasImage = saved ? true : !!meta?.imageUrl
  const imageUrl = hasImage
    ? `/api/media/instagram/thumbnail?id=${encodeURIComponent(id)}`
    : undefined
  const available = saved ? true : !!meta

  const ua = (await headers()).get('user-agent')
  const human = !isLikelyBot(ua)
  // Warm vxinstagram's lazy cache (Range only — don't pull the whole MP4 into
  // this RSC). The client probe then attaches <video src> once the proxy 206s.
  if (human) {
    void resolveInstagramVideo(id, { range: 'bytes=0-1' })
      .then((res) => res?.body?.cancel())
      .catch(() => {})
  }

  await recordHumanPreview(available && human, {
    platform: 'instagram',
    bookmarkId: id,
    author: author || 'instagram',
    authorName: authorName || author || null,
    text: caption || description || null,
    thumbnailUrl: imageUrl ?? null,
    url: previewPath('instagram', author || 'instagram', id),
  })

  const sharedItem = reelToTheaterItem({
    id,
    author: author || 'instagram',
    authorName: authorName || author || null,
    text: caption || description || null,
    thumbnailUrl: imageUrl ?? null,
  })
  const seed = await sharedPreviewSeed(sharedItem)

  const baseUrl = PUBLIC_BASE_URL
  const ldAuthorName = authorName || author
  const jsonLd = buildVideoObjectLd({
    name: caption || description || (authorName ? `${authorName} on Instagram` : 'Instagram Reel'),
    description: caption || description || undefined,
    thumbnailUrl: imageUrl ? `${baseUrl}${imageUrl}` : undefined,
    // Playback works again as of 2026-07-27 (the mirror's cold-cache 404 is now
    // retried rather than treated as fatal — see `@/lib/media/mirrors`), so the
    // stream URL is advertised again, matching what the TikTok page does.
    contentUrl: available
      ? `${baseUrl}/api/media/instagram/video?id=${encodeURIComponent(id)}`
      : undefined,
    author: ldAuthorName
      ? {
          name: ldAuthorName,
          url: author ? `https://www.instagram.com/${author}` : undefined,
        }
      : undefined,
  })

  return (
    <SharedPreviewPage
      jsonLd={jsonLd}
      seed={seed}
      sharedItem={sharedItem}
      authed={!!userId}
      staticPost={{
        kind: 'instagram-reel',
        authorName: authorName || author,
        handle: author,
        text: caption || description,
        sourceUrl: `https://www.instagram.com/reel/${id}/`,
        label: 'Instagram post',
        below: available ? (
          <RelatedSaves
            platform="instagram"
            bookmarkId={id}
            authorHandle={author || 'instagram'}
            contentType="video"
          />
        ) : undefined,
      }}
    />
  )
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params

  if (!isValidReelId(id)) {
    return {
      title: 'ADHX - Save now. Read never. Find always.',
    }
  }

  const baseUrl = PUBLIC_BASE_URL
  const canonicalUrl = `${baseUrl}/reels/${id}`
  const saved = getSavedPreviewDisplay('instagram', id)
  const meta = saved ? null : await fetchReelMetadata(id)

  const who = saved?.authorName || saved?.author || meta?.authorName || meta?.author
  const caption = saved?.text || meta?.caption || meta?.description || ''
  const available = Boolean(saved || meta)
  const hasImage = saved ? true : !!meta?.imageUrl

  // Content-first `<title>` + SERP description: lead with the caption itself,
  // falling back to an author-aware label when there's no caption to lead
  // with — not the old "Preview @user's reel" utility pitch.
  const pageTitle = buildContentTitle(caption || (who ? `Reel by ${who}` : 'Instagram Reel'))
  // The description continues the caption past the title rather than re-cutting
  // the same opening text, then says what the page holds and why to open it.
  const description = buildSnippetDescription({
    title: pageTitle,
    content: caption,
    facts: [attributionFact(pageTitle, who, 'Instagram'), 'Reel'].filter((fact): fact is string =>
      Boolean(fact),
    ),
    closer: 'Watch and send it — no Instagram app.',
  })
  const image = hasImage
    ? `${baseUrl}/api/media/instagram/thumbnail?id=${encodeURIComponent(id)}`
    : `${baseUrl}/og-logo.png`
  const videoUrl = available
    ? `${baseUrl}/api/media/instagram/video?id=${encodeURIComponent(id)}`
    : undefined

  return previewPageMetadata({
    title: pageTitle,
    description,
    canonicalUrl,
    image,
    videoUrl,
  })
}
