import { redirect } from 'next/navigation'
import { Metadata } from 'next'
import { getReelMetadataStatus, isValidReelId } from '@/lib/media/instafix'
import { getCurrentUserId } from '@/lib/auth/session'
import {
  buildContentTitle,
  buildSnippetDescription,
  attributionFact,
  previewPageMetadata,
} from '@/lib/utils/content-metadata'
import { stubReelTheaterItem } from '@/lib/theater/shared-seed'
import { resolveReelShared } from '@/lib/theater/resolve-shared-preview'
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

export default async function ReelPreviewPage({ params }: Props) {
  const { id } = await params

  if (!isValidReelId(id)) {
    redirect('/')
  }

  const moderation = readPostModeration('instagram', id)
  const moderated = !moderation.ok || moderation.value
  const userId = moderated ? null : await getCurrentUserId()
  const stub = stubReelTheaterItem(id)
  const seed = await sharedPreviewSeed(stub)

  return (
    <SharedPreviewPage
      seed={seed}
      sharedItem={stub}
      authed={!!userId}
      unavailable={moderated}
      sharedResolve={moderated ? undefined : resolveReelShared(id)}
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

  const moderation = readPostModeration('instagram', id)
  if (!moderation.ok || moderation.value) return MODERATED_PAGE_METADATA

  const baseUrl = PUBLIC_BASE_URL
  const canonicalUrl = `${baseUrl}/reels/${id}`
  const saved = getSavedPreviewDisplay('instagram', id)
  const metadataStatus = saved ? null : await getReelMetadataStatus(id)

  if (!saved && metadataStatus?.kind === 'permanent-miss') {
    return {
      title: 'Instagram Reel unavailable - ADHX',
      description: 'This Instagram Reel is no longer available.',
      robots: { index: false },
      alternates: { canonical: canonicalUrl },
    }
  }
  if (!saved && metadataStatus?.kind === 'transient-failure') {
    return {
      title: 'Instagram Reel',
      description: 'Preview this Instagram Reel on ADHX.',
      alternates: { canonical: canonicalUrl },
    }
  }

  const meta = metadataStatus?.kind === 'resolved' ? metadataStatus.metadata : null

  const who = saved?.authorName || saved?.author || meta?.authorName || meta?.author
  const caption = saved?.text || meta?.caption || meta?.description || ''
  const available = Boolean(saved || meta)
  const hasImage = saved ? true : !!meta?.imageUrl

  const pageTitle = buildContentTitle(caption || (who ? `Reel by ${who}` : 'Instagram Reel'))
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
