import { db } from '@/lib/db'
import { activity } from '@/lib/db/schema'
import { and, desc, eq } from 'drizzle-orm'
import { getTrendingItems } from '@/lib/trending/query'
import { previewPath } from '@/lib/activity/preview-path'

/**
 * "Related saves" for a preview page footer — up to 6 other public posts to
 * keep the ~2,000 indexed preview pages from being sitemap-only orphans.
 *
 * ANONYMITY: mirrors the invariant in `src/lib/trending/query.ts` — this reads
 * ONLY public `activity` columns and NEVER selects/exposes `userId`. It also
 * reuses `getTrendingItems()` (the audited choke point) for its second pass
 * rather than querying `activity` directly for that part.
 */

type ContentType = 'video' | 'photo' | 'text' | 'quote' | 'article'
const CONTENT_TYPES = new Set<string>(['video', 'photo', 'text', 'quote', 'article'])
function asContentType(v: string | null | undefined): ContentType | undefined {
  return v && CONTENT_TYPES.has(v) ? (v as ContentType) : undefined
}

export interface RelatedItem {
  platform: string
  bookmarkId: string
  author: string
  authorName?: string | null
  authorAvatarUrl?: string | null
  text?: string | null
  thumbnailUrl?: string | null
  contentType?: ContentType
  url: string
}

export interface RelatedSavesInput {
  platform: string
  bookmarkId: string
  /** The current post's author handle (no leading `@`), used for the "same author" pass. */
  authorHandle: string
  /** The current post's type, when known — preferred for the "same type" fill pass. */
  contentType?: ContentType
}

const RELATED_LIMIT = 6
const AUTHOR_FETCH = 30
const TRENDING_FETCH = 40

/**
 * Up to 6 related items: other recent activity by the same author first, then
 * recent trending items (same content type preferred) to fill any remaining
 * slots — deduped and excluding the current post itself. Public-safe only.
 * Degrades to an empty array on any failure; never throws (a related-saves
 * footer must never break the preview page it's attached to).
 */
export async function getRelatedSaves(input: RelatedSavesInput): Promise<RelatedItem[]> {
  try {
    const handle = input.authorHandle.replace(/^@+/, '')
    const selfKey = `${input.platform}:${input.bookmarkId}`
    const seen = new Set<string>([selfKey])
    const results: RelatedItem[] = []

    // 1. Other recent activity by the same author, same platform.
    // ANONYMITY CHOKE POINT: only public columns, no `userId`.
    const authorRows = db
      .select({
        platform: activity.platform,
        bookmarkId: activity.bookmarkId,
        author: activity.author,
        authorName: activity.authorName,
        authorAvatarUrl: activity.authorAvatarUrl,
        text: activity.text,
        thumbnailUrl: activity.thumbnailUrl,
        contentType: activity.contentType,
        url: activity.url,
      })
      .from(activity)
      .where(and(eq(activity.platform, input.platform), eq(activity.author, handle)))
      .orderBy(desc(activity.createdAt))
      .limit(AUTHOR_FETCH)
      .all()

    for (const row of authorRows) {
      if (!row.bookmarkId) continue
      const key = `${row.platform}:${row.bookmarkId}`
      if (seen.has(key)) continue
      seen.add(key)
      results.push({
        platform: row.platform,
        bookmarkId: row.bookmarkId,
        author: row.author,
        authorName: row.authorName,
        authorAvatarUrl: row.authorAvatarUrl,
        text: row.text,
        thumbnailUrl: row.thumbnailUrl,
        contentType: asContentType(row.contentType),
        url: row.url || previewPath(row.platform, row.author, row.bookmarkId),
      })
      if (results.length >= RELATED_LIMIT) break
    }

    // 2. Fill remaining slots with recent trending items — same content type
    // preferred (when known), then anything else recent.
    if (results.length < RELATED_LIMIT) {
      const { items } = await getTrendingItems({ limit: TRENDING_FETCH })
      const sameType = input.contentType
        ? items.filter((i) => i.contentType === input.contentType)
        : []
      const rest = items.filter((i) => !sameType.includes(i))

      for (const item of [...sameType, ...rest]) {
        if (!item.bookmarkId) continue
        const key = `${item.platform}:${item.bookmarkId}`
        if (seen.has(key)) continue
        seen.add(key)
        results.push({
          platform: item.platform,
          bookmarkId: item.bookmarkId,
          author: item.author,
          authorName: item.authorName,
          authorAvatarUrl: item.authorAvatarUrl,
          text: item.text,
          thumbnailUrl: item.thumbnailUrl,
          contentType: item.contentType,
          url: item.url,
        })
        if (results.length >= RELATED_LIMIT) break
      }
    }

    return results.slice(0, RELATED_LIMIT)
  } catch {
    // A related-saves failure must never break the preview page it decorates.
    return []
  }
}
