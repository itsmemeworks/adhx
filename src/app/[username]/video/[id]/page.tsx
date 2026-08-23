import { redirect } from 'next/navigation'
import { Metadata } from 'next'
import { fetchTikTokMetadata, isValidUsername, isValidVideoId } from '@/lib/media/tnktok'
import { getCurrentUserId } from '@/lib/auth/session'
import { previewPath } from '@/lib/activity/record'
import { buildVideoObjectLd } from '@/lib/utils/structured-data'
import {
  buildContentTitle,
  buildSnippetDescription,
  attributionFact,
  previewPageMetadata,
} from '@/lib/utils/content-metadata'
import { RelatedSaves } from '@/components/RelatedSaves'
import { tiktokToTheaterItem } from '@/lib/theater/shared-seed'
import {
  MODERATED_PAGE_METADATA,
  recordHumanPreview,
  SharedPreviewPage,
  sharedPreviewSeed,
} from '@/lib/theater/shared-preview'
import { isPostModerated } from '@/lib/admin/moderation'
import { getSavedPreviewDisplay } from '@/lib/theater/saved-preview'
import { PUBLIC_BASE_URL } from '@/lib/routes/base-url'

interface Props {
  params: Promise<{ username: string; id: string }>
}

// This route is dynamic (reads cookies for auth), so it is never full-route
// cached. Crawl-cheapness comes instead from fetchTikTokMetadata()'s cached
// mirror scrape (unstable_cache, revalidate 3600) and the DB-first skip for
// saved posts.

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
  const saved = getSavedPreviewDisplay('tiktok', id)
  const userId = await getCurrentUserId()
  const meta = saved ? null : await fetchTikTokMetadata(handle, id)

  const author = saved?.author || meta?.author || null
  const authorName = saved?.authorName || meta?.authorName || null
  const description = saved?.text || meta?.description || null
  const hasVideo = saved ? true : !!meta?.videoUrl
  const moderated = isPostModerated('tiktok', id)
  const available = moderated ? false : saved ? true : !!meta

  await recordHumanPreview(available, {
    platform: 'tiktok',
    bookmarkId: id,
    author: author || handle,
    authorName: authorName,
    text: description || meta?.title || null,
    thumbnailUrl: null,
    url: previewPath('tiktok', author || handle, id),
  })

  const sharedItem = tiktokToTheaterItem({
    id,
    handle,
    author,
    authorName,
    text: description || meta?.title || null,
  })
  const seed = await sharedPreviewSeed(sharedItem)

  const baseUrl = PUBLIC_BASE_URL
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
    <SharedPreviewPage
      jsonLd={jsonLd}
      seed={seed}
      sharedItem={sharedItem}
      authed={!!userId}
      unavailable={moderated}
      staticPost={{
        kind: 'tiktok-video',
        authorName,
        handle: `@${handle}`,
        text: description,
        sourceUrl: `https://www.tiktok.com/@${handle}/video/${id}`,
        label: 'TikTok video',
        below: available ? (
          <RelatedSaves
            platform="tiktok"
            bookmarkId={id}
            authorHandle={author || handle}
            contentType="video"
          />
        ) : undefined,
      }}
    />
  )
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username, id } = await params
  const handle = normalizeHandle(username)

  if (!isValidUsername(handle) || !isValidVideoId(id)) {
    return { title: 'ADHX - Save now. Read never. Find always.' }
  }

  if (isPostModerated('tiktok', id)) return MODERATED_PAGE_METADATA

  const baseUrl = PUBLIC_BASE_URL
  const canonicalUrl = `${baseUrl}/@${handle}/video/${id}`
  const saved = getSavedPreviewDisplay('tiktok', id)
  const meta = saved ? null : await fetchTikTokMetadata(handle, id)

  const who = saved?.authorName || saved?.author || meta?.authorName || meta?.author || `@${handle}`
  const caption = saved?.text || meta?.title || meta?.description || ''

  // Content-first `<title>` + SERP description: lead with the TikTok's own
  // caption/title, not the old "Preview @user's TikTok" utility pitch.
  const pageTitle = buildContentTitle(caption || `${who} on TikTok`)
  // The description continues the caption past the title rather than re-cutting
  // the same opening text, then says what the page holds and why to open it.
  const description = buildSnippetDescription({
    title: pageTitle,
    content: saved?.text || meta?.description || meta?.title || '',
    facts: [attributionFact(pageTitle, who, 'TikTok'), 'Video'].filter((fact): fact is string =>
      Boolean(fact),
    ),
    closer: 'Watch and send it — no TikTok app.',
  })
  // Poster via the thumbnail proxy so the card unfurls with an image.
  const image = `${baseUrl}/api/media/tiktok/thumbnail?username=${encodeURIComponent(handle)}&id=${encodeURIComponent(id)}`
  const videoUrl =
    saved || meta?.videoUrl
      ? `${baseUrl}/api/media/tiktok/video?username=${encodeURIComponent(handle)}&id=${encodeURIComponent(id)}`
      : undefined

  return previewPageMetadata({
    title: pageTitle,
    description,
    canonicalUrl,
    image,
    videoUrl,
  })
}
