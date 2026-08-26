import { redirect } from 'next/navigation'
import { Metadata } from 'next'
import { getYouTubeMetadataStatus, isValidVideoId, youtubeThumbnail } from '@/lib/media/youtube'
import { getCurrentUserId } from '@/lib/auth/session'
import {
  buildContentTitle,
  buildSnippetDescription,
  attributionFact,
  previewPageMetadata,
  unavailablePreviewMetadata,
} from '@/lib/utils/content-metadata'
import { stubYouTubeTheaterItem } from '@/lib/theater/shared-seed'
import { resolveYouTubeShared } from '@/lib/theater/resolve-shared-preview'
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

export default async function ShortPreviewPage({ params }: Props) {
  const { id } = await params

  if (!isValidVideoId(id)) {
    redirect('/')
  }

  const moderation = readPostModeration('youtube', id)
  const moderated = !moderation.ok || moderation.value
  const userId = moderated ? null : await getCurrentUserId()
  const stub = stubYouTubeTheaterItem(id)
  const seed = await sharedPreviewSeed(stub)

  return (
    <SharedPreviewPage
      seed={seed}
      sharedItem={stub}
      authed={!!userId}
      unavailable={moderated}
      sharedResolve={moderated ? undefined : resolveYouTubeShared(id)}
    />
  )
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params

  if (!isValidVideoId(id)) {
    return { title: 'ADHX - Save now. Read never. Find always.' }
  }

  const moderation = readPostModeration('youtube', id)
  if (!moderation.ok || moderation.value) return MODERATED_PAGE_METADATA

  const baseUrl = PUBLIC_BASE_URL
  const canonicalUrl = `${baseUrl}/shorts/${id}`
  const saved = getSavedPreviewDisplay('youtube', id)
  const metadataStatus = saved ? null : await getYouTubeMetadataStatus(id)

  if (!saved && metadataStatus?.kind !== 'resolved') {
    const permanent = metadataStatus?.kind === 'permanent-miss'
    return unavailablePreviewMetadata({
      title: permanent ? 'YouTube Short unavailable - ADHX' : 'YouTube Short - ADHX',
      description: permanent
        ? 'This YouTube Short is no longer available.'
        : 'This YouTube Short preview is temporarily unavailable.',
      canonicalUrl,
    })
  }

  const meta = metadataStatus?.kind === 'resolved' ? metadataStatus.metadata : null

  const who = saved?.authorName || saved?.author || meta?.authorName || meta?.author
  const titleText = saved?.text || meta?.title
  const available = Boolean(saved || meta)

  const pageTitle = buildContentTitle(
    titleText || (who ? `${who}'s Short on YouTube` : 'YouTube Short'),
  )
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
