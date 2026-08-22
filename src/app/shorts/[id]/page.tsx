import { redirect } from 'next/navigation'
import { Metadata } from 'next'
import {
  fetchYouTubeMetadata,
  isValidVideoId,
  youtubeThumbnail,
  youtubeEmbedUrl,
} from '@/lib/media/youtube'
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
import { youtubeToTheaterItem } from '@/lib/theater/shared-seed'
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
// cached. Crawl-cheapness comes instead from fetchYouTubeMetadata()'s cached
// oEmbed fetch (next.revalidate 3600) and the DB-first skip for saved posts.

export default async function ShortPreviewPage({ params }: Props) {
  const { id } = await params

  if (!isValidVideoId(id)) {
    redirect('/')
  }

  // DB-first: if anyone has saved this Short, render from the stored row and
  // skip the YouTube oEmbed fetch. The player is the official iframe embed
  // (resolved from the id), so the saved row's title/author is all the UI needs.
  const saved = getSavedPreviewDisplay('youtube', id)
  const userId = await getCurrentUserId()
  const meta = saved ? null : await fetchYouTubeMetadata(id)

  const author = saved?.author || meta?.author || null
  const authorName = saved?.authorName || meta?.authorName || null
  const title = saved?.text || meta?.title || null
  const available = saved ? true : !!meta
  const previewAuthor = author?.replace(/^@/, '') || authorName || 'youtube'

  await recordHumanPreview(available, {
    platform: 'youtube',
    bookmarkId: id,
    author: previewAuthor,
    authorName: authorName,
    text: title,
    thumbnailUrl: youtubeThumbnail(id),
    url: previewPath('youtube', previewAuthor, id),
  })

  const sharedItem = youtubeToTheaterItem({
    id,
    author: previewAuthor,
    authorName,
    text: title,
  })
  const seed = await sharedPreviewSeed(sharedItem)

  const ldAuthorName = authorName || author
  const jsonLd = buildVideoObjectLd({
    name: title || 'YouTube Short',
    thumbnailUrl: youtubeThumbnail(id),
    embedUrl: youtubeEmbedUrl(id),
    author: ldAuthorName ? { name: ldAuthorName } : undefined,
  })

  return (
    <SharedPreviewPage
      jsonLd={jsonLd}
      seed={seed}
      sharedItem={sharedItem}
      authed={!!userId}
      staticPost={{
        kind: 'youtube-short',
        authorName,
        handle: author,
        text: title,
        sourceUrl: `https://www.youtube.com/shorts/${id}`,
        label: 'YouTube Short',
        below: available ? (
          <RelatedSaves
            platform="youtube"
            bookmarkId={id}
            authorHandle={previewAuthor}
            contentType="video"
          />
        ) : undefined,
      }}
    />
  )
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params

  if (!isValidVideoId(id)) {
    return { title: 'ADHX - Save now. Read never. Find always.' }
  }

  const baseUrl = PUBLIC_BASE_URL
  const canonicalUrl = `${baseUrl}/shorts/${id}`
  const saved = getSavedPreviewDisplay('youtube', id)
  const meta = saved ? null : await fetchYouTubeMetadata(id)

  const who = saved?.authorName || saved?.author || meta?.authorName || meta?.author
  const titleText = saved?.text || meta?.title
  const available = Boolean(saved || meta)

  // Content-first `<title>`: the Short's own title (already content-led via
  // oEmbed) gets the brand suffix instead of the old "Preview @user's Short"
  // pitch; falls back to an author-aware label when oEmbed has no title.
  const pageTitle = buildContentTitle(
    titleText || (who ? `${who}'s Short on YouTube` : 'YouTube Short'),
  )
  // oEmbed gives a title and no body, so there's usually no content left to
  // continue past the title — the trail carries the description on its own.
  const description = buildSnippetDescription({
    title: pageTitle,
    content: titleText || '',
    facts: [attributionFact(pageTitle, who, 'YouTube'), 'Short'].filter((fact): fact is string =>
      Boolean(fact),
    ),
    closer: 'Watch it here — no YouTube app needed.',
  })
  const image = available ? youtubeThumbnail(id) : `${baseUrl}/og-logo.png`

  return previewPageMetadata({
    title: pageTitle,
    description,
    canonicalUrl,
    image,
    ogType: 'video.other',
  })
}
