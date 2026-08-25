import { redirect } from 'next/navigation'
import { Metadata } from 'next'
import { fetchTikTokMetadata, isValidUsername, isValidVideoId } from '@/lib/media/tnktok'
import { getCurrentUserId } from '@/lib/auth/session'
import {
  buildContentTitle,
  buildSnippetDescription,
  attributionFact,
  previewPageMetadata,
} from '@/lib/utils/content-metadata'
import { stubTikTokTheaterItem } from '@/lib/theater/shared-seed'
import { resolveTikTokShared } from '@/lib/theater/resolve-shared-preview'
import {
  MODERATED_PAGE_METADATA,
  SharedPreviewPage,
  sharedPreviewSeed,
} from '@/lib/theater/shared-preview'
import { isPostModerated } from '@/lib/admin/moderation'
import { getSavedPreviewDisplay } from '@/lib/theater/saved-preview'
import { PUBLIC_BASE_URL } from '@/lib/routes/base-url'

interface Props {
  params: Promise<{ username: string; id: string }>
}

function normalizeHandle(raw: string): string {
  const decoded = decodeURIComponent(raw)
  return decoded.startsWith('@') ? decoded.slice(1) : decoded
}

export default async function TikTokPreviewPage({ params }: Props) {
  const { username, id } = await params
  const handle = normalizeHandle(username)

  if (!isValidUsername(handle) || !isValidVideoId(id)) {
    redirect('/')
  }

  const userId = await getCurrentUserId()
  const stub = stubTikTokTheaterItem(handle, id)
  const seed = await sharedPreviewSeed(stub)
  const moderated = isPostModerated('tiktok', id)

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
