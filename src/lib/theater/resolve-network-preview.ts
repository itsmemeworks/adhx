import type { TheaterItem } from '@/components/theater/types'
import { describeNetworkPost } from '@/lib/keep/describe'
import { keptSrc } from '@/lib/keep/src'
import { networkSourceUrl, type LinkNetwork } from '@/lib/platform/networks'
import { getSavedPreviewDisplay } from './saved-preview'
import type { SharedResolveResult } from './shared-resolve'

/** A link-network post (YouTube, Reddit, Vimeo …) as a theater item. */
export function networkTheaterItem(input: {
  platform: LinkNetwork
  id: string
  author: string
  authorName?: string | null
  text?: string | null
  category?: string | null
  photoCount?: number
  createdAt?: string | null
}): TheaterItem {
  const contentType =
    input.category === 'photo' ? 'photo' : input.category === 'text' ? 'text' : 'video'
  return {
    action: 'preview',
    platform: input.platform,
    bookmarkId: input.id,
    author: input.author,
    authorName: input.authorName ?? null,
    authorAvatarUrl: null,
    text: input.text ?? null,
    thumbnailUrl: contentType === 'text' ? null : keptSrc(input.platform, input.id, 'poster'),
    url: networkSourceUrl(input.platform, input.id, input.author) ?? '',
    createdAt: input.createdAt ?? new Date().toISOString(),
    contentType,
    ...(input.photoCount && input.photoCount > 1 ? { photoCount: input.photoCount } : {}),
  }
}

/**
 * Resolve a `/s/{network}/{id}` preview: the saved copy when anyone on this
 * ADHX has it (ADHX serves its files), else a read of the post itself. Its
 * files are only downloaded once someone saves it.
 */
export async function resolveNetworkShared(
  platform: LinkNetwork,
  id: string,
  author: string | undefined,
): Promise<SharedResolveResult> {
  const saved = getSavedPreviewDisplay(platform, id)
  if (saved) {
    return {
      ok: true,
      seoEligible: false,
      related: null,
      item: networkTheaterItem({
        platform,
        id,
        author: saved.author || author || platform,
        authorName: saved.authorName,
        text: saved.text,
        category: saved.category,
        photoCount: saved.photoCount,
      }),
    }
  }
  const described = await describeNetworkPost(platform, id, author).catch(() => null)
  if (!described) return { ok: false }
  return {
    ok: true,
    seoEligible: false,
    related: null,
    item: networkTheaterItem({
      platform,
      id,
      author: author || described.author,
      authorName: described.authorName,
      text: described.text,
      category: described.category,
      photoCount: described.photos,
      createdAt: described.createdAt,
    }),
  }
}
