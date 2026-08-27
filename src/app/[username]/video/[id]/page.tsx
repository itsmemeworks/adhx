import { redirect } from 'next/navigation'
import { Metadata } from 'next'
import { getTikTokMetadataStatus, isValidUsername, isValidVideoId } from '@/lib/media/tnktok'
import { getCurrentUserId } from '@/lib/auth/session'
import {
  buildContentTitle,
  buildSnippetDescription,
  attributionFact,
  previewPageMetadata,
  unavailablePreviewMetadata,
} from '@/lib/utils/content-metadata'
import { stubTikTokTheaterItem } from '@/lib/theater/shared-seed'
import { resolveTikTokShared } from '@/lib/theater/resolve-shared-preview'
import {
  MODERATED_PAGE_METADATA,
  SharedPreviewPage,
  sharedPreviewSeed,
} from '@/lib/theater/shared-preview'
import { readPostModeration } from '@/lib/admin/moderation'
import { getSavedPreviewDisplay } from '@/lib/theater/saved-preview'
import { PUBLIC_BASE_URL } from '@/lib/routes/base-url'

interface Props {
  params: Promise<{ username: string; id: string }>
}

export const dynamic = 'force-dynamic'

function normalizeHandle(raw: string): string | null {
  try {
    const decoded = decodeURIComponent(raw)
    const handle = decoded.startsWith('@') ? decoded.slice(1) : decoded
    return handle.startsWith('@') ? null : handle
  } catch {
    return null
  }
}

export default async function TikTokPreviewPage({ params }: Props) {
  const { username, id } = await params
  const handle = normalizeHandle(username)

  if (!handle || !isValidUsername(handle) || !isValidVideoId(id)) {
    redirect('/')
  }

  const moderation = readPostModeration('tiktok', id)
  const moderated = !moderation.ok || moderation.value
  const userId = moderated ? null : await getCurrentUserId()
  const stub = stubTikTokTheaterItem(handle, id)
  const seed = await sharedPreviewSeed(stub)

  return (
    <SharedPreviewPage
      seed={seed}
      sharedItem={stub}
      authed={!!userId}
      unavailable={moderated}
      sharedResolve={moderated ? undefined : resolveTikTokShared(handle, id)}
    />
  )
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username, id } = await params
  const handle = normalizeHandle(username)

  if (!handle || !isValidUsername(handle) || !isValidVideoId(id)) {
    return { title: 'ADHX - Save now. Read never. Find always.' }
  }

  const moderation = readPostModeration('tiktok', id)
  if (!moderation.ok || moderation.value) return MODERATED_PAGE_METADATA

  const baseUrl = PUBLIC_BASE_URL
  const canonicalUrl = `${baseUrl}/@${handle}/video/${id}`
  const saved = getSavedPreviewDisplay('tiktok', id)
  const metadataStatus = saved ? null : await getTikTokMetadataStatus(handle, id)

  if (!saved && metadataStatus?.kind !== 'resolved') {
    const permanent = metadataStatus?.kind === 'permanent-miss'
    return unavailablePreviewMetadata({
      title: permanent ? `@${handle} on TikTok unavailable - ADHX` : `@${handle} on TikTok`,
      description: permanent
        ? 'This TikTok video is no longer available.'
        : 'This TikTok video preview is temporarily unavailable.',
      canonicalUrl,
    })
  }

  const meta = metadataStatus?.kind === 'resolved' ? metadataStatus.metadata : null

  const who = saved?.authorName || saved?.author || meta?.authorName || meta?.author || `@${handle}`
  const caption = saved?.text || meta?.title || meta?.description || ''

  const pageTitle = buildContentTitle(caption || `${who} on TikTok`)
  const description = buildSnippetDescription({
    title: pageTitle,
    content: saved?.text || meta?.description || meta?.title || '',
    facts: [attributionFact(pageTitle, who, 'TikTok'), 'Video'].filter((fact): fact is string =>
      Boolean(fact),
    ),
    closer: 'Watch and send it — no TikTok app.',
  })
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
