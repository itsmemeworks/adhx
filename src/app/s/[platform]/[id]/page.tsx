import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { readPostModeration } from '@/lib/admin/moderation'
import { getSavedPreviewDisplay } from '@/lib/theater/saved-preview'
import { networkTheaterItem, resolveNetworkShared } from '@/lib/theater/resolve-network-preview'
import { MODERATED_PAGE_METADATA, SharedPreviewPage } from '@/lib/theater/shared-preview'
import { isLinkNetwork, networkLabel, networkSourceUrl } from '@/lib/platform/networks'

interface Props {
  params: Promise<{ platform: string; id: string }>
  searchParams: Promise<{ by?: string }>
}

export const dynamic = 'force-dynamic'

const ID = /^[A-Za-z0-9._~-]{1,120}$/
const BY = /^[A-Za-z0-9._:-]{1,253}$/

/** A post from YouTube, Reddit, Vimeo, SoundCloud and the other link networks. */
export default async function NetworkPreviewPage({ params, searchParams }: Props) {
  const { platform, id: rawId } = await params
  const id = decodeURIComponent(rawId)
  if (!isLinkNetwork(platform) || !ID.test(id)) redirect('/')
  const { by } = await searchParams
  const author = by && BY.test(by) ? by : undefined

  const moderation = readPostModeration(platform, id)
  const moderated = !moderation.ok || moderation.value
  const stub = networkTheaterItem({ platform, id, author: author || platform })
  return (
    <SharedPreviewPage
      sharedItem={stub}
      unavailable={moderated}
      sharedResolve={moderated ? undefined : resolveNetworkShared(platform, id, author)}
    />
  )
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { platform, id: rawId } = await params
  const id = decodeURIComponent(rawId)
  if (!isLinkNetwork(platform) || !ID.test(id)) return { title: 'ADHX' }
  const moderation = readPostModeration(platform, id)
  if (!moderation.ok || moderation.value) return MODERATED_PAGE_METADATA
  const { by } = await searchParams
  const saved = getSavedPreviewDisplay(platform, id)
  const label = networkLabel(platform)
  const who = saved?.authorName || saved?.author || (by && BY.test(by) ? by : null)
  const firstLine = saved?.text?.split('\n')[0]?.slice(0, 90)
  return {
    title: `${firstLine || (who ? `${label} post by ${who}` : `${label} post`)}`,
    description: saved?.text?.slice(0, 160) || `A ${label} post, kept on ADHX.`,
    alternates: { canonical: networkSourceUrl(platform, id, who) ?? undefined },
    robots: { index: false },
  }
}
