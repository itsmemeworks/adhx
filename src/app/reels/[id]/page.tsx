import { redirect } from 'next/navigation'
import { Metadata } from 'next'
import { getInstagramMetadataStatus, isValidInstagramId } from '@/lib/media/instafix'
import { getCurrentUserId } from '@/lib/auth/session'
import {
  buildContentTitle,
  buildSnippetDescription,
  attributionFact,
  previewPageMetadata,
  unavailablePreviewMetadata,
} from '@/lib/utils/content-metadata'
import { stubInstagramPostTheaterItem, stubReelTheaterItem } from '@/lib/theater/shared-seed'
import { resolveInstagramShared } from '@/lib/theater/resolve-shared-preview'
import {
  MODERATED_PAGE_METADATA,
  SharedPreviewPage,
  sharedPreviewSeed,
} from '@/lib/theater/shared-preview'
import { readPostModeration } from '@/lib/admin/moderation'
import { getSavedPreviewDisplay } from '@/lib/theater/saved-preview'
import { PUBLIC_BASE_URL } from '@/lib/routes/base-url'

interface Props {
  params: Promise<{ id: string }>
}

export const dynamic = 'force-dynamic'

export default async function ReelPreviewPage({ params }: Props) {
  return InstagramPreviewPage({ params, pathHint: 'reel' })
}

export async function InstagramPreviewPage({
  params,
  pathHint,
}: Props & { pathHint: 'post' | 'reel' }) {
  const { id } = await params

  if (!isValidInstagramId(id)) {
    redirect('/')
  }

  const moderation = readPostModeration('instagram', id)
  const moderated = !moderation.ok || moderation.value
  const userId = moderated ? null : await getCurrentUserId()
  const stub = pathHint === 'post' ? stubInstagramPostTheaterItem(id) : stubReelTheaterItem(id)
  const seed = await sharedPreviewSeed(stub)

  return (
    <SharedPreviewPage
      seed={seed}
      sharedItem={stub}
      authed={!!userId}
      unavailable={moderated}
      sharedResolve={moderated ? undefined : resolveInstagramShared(id, pathHint)}
    />
  )
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return generateInstagramPreviewMetadata({ params }, 'reel')
}

export async function generateInstagramPreviewMetadata(
  { params }: Props,
  pathHint: 'post' | 'reel',
): Promise<Metadata> {
  const { id } = await params

  if (!isValidInstagramId(id)) {
    return {
      title: 'ADHX - Save now. Read never. Find always.',
    }
  }

  const moderation = readPostModeration('instagram', id)
  if (!moderation.ok || moderation.value) return MODERATED_PAGE_METADATA

  const baseUrl = PUBLIC_BASE_URL
  const saved = getSavedPreviewDisplay('instagram', id)
  const metadataStatus = saved ? null : await getInstagramMetadataStatus(id, pathHint)

  if (!saved && metadataStatus?.kind !== 'resolved') {
    const permanent = metadataStatus?.kind === 'permanent-miss'
    const noun = pathHint === 'post' ? 'Instagram post' : 'Instagram Reel'
    const canonicalUrl = `${baseUrl}/${pathHint === 'post' ? 'p' : 'reels'}/${id}`
    return unavailablePreviewMetadata({
      title: permanent ? `${noun} unavailable - ADHX` : `${noun} - ADHX`,
      description: permanent
        ? `This ${noun} is no longer available.`
        : `This ${noun} preview is temporarily unavailable.`,
      canonicalUrl,
    })
  }

  const meta = metadataStatus?.kind === 'resolved' ? metadataStatus.metadata : null

  const who = saved?.authorName || saved?.author || meta?.authorName || meta?.author
  const caption = saved?.text || meta?.caption || meta?.description || ''
  const available = Boolean(saved || meta)
  const contentType =
    meta?.contentType ||
    (saved?.category === 'photo' ? 'photo' : saved?.category === 'video' ? 'video' : null) ||
    (pathHint === 'post' ? 'photo' : 'video')
  const isPhoto = contentType === 'photo'
  const noun = isPhoto ? 'Instagram post' : 'Instagram Reel'
  const canonicalUrl = `${baseUrl}/${isPhoto ? 'p' : 'reels'}/${id}`
  const imageCount = saved ? saved.mediaCount : (meta?.media?.length ?? 0)
  // Saved rows can predate durable Instagram media persistence, but the
  // same-origin thumbnail route can still resolve their current image/poster.
  const hasImage = Boolean(saved) || imageCount > 0 || !!meta?.imageUrl

  const pageTitle = buildContentTitle(
    caption || (who ? `${isPhoto ? 'Post' : 'Reel'} by ${who}` : noun),
  )
  const description = buildSnippetDescription({
    title: pageTitle,
    content: caption,
    facts: [attributionFact(pageTitle, who, 'Instagram'), isPhoto ? 'Photo' : 'Reel'].filter(
      (fact): fact is string => Boolean(fact),
    ),
    closer: isPhoto
      ? 'View and send it — no Instagram app.'
      : 'Watch and send it — no Instagram app.',
  })
  const imageBase = `${baseUrl}/api/media/instagram/thumbnail?id=${encodeURIComponent(id)}`
  const image =
    hasImage && isPhoto && imageCount > 1
      ? Array.from({ length: imageCount }, (_, index) => `${imageBase}&index=${index + 1}`)
      : hasImage
        ? imageBase
        : `${baseUrl}/og-logo.png`
  const videoUrl =
    available && !isPhoto
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
