import type { SharedStaticPost } from '@/components/theater/SharedPostStatic'
import type { TheaterItem } from '@/components/theater/types'
import type { ContentType } from '@/components/matter'

export type SharedRelatedRef = {
  platform: string
  bookmarkId: string
  authorHandle: string
  contentType?: ContentType
}

/**
 * Client-serializable result of a shared-preview upstream fetch.
 * No React nodes — RelatedSaves is rendered by the server SEO sibling.
 */
export type SharedResolveResult =
  | {
      ok: true
      item: TheaterItem
      jsonLd: unknown
      staticPost: SharedStaticPost
      related: SharedRelatedRef | null
    }
  | { ok: false }
