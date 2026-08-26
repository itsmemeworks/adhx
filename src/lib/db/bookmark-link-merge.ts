import { sql, type SQLWrapper } from 'drizzle-orm'
import { db } from '@/lib/db'
import { bookmarkLinks, type NewBookmarkLink } from './schema'

const MERGED_FIELDS = [
  'originalUrl',
  'linkType',
  'domain',
  'contentJson',
  'previewTitle',
  'previewDescription',
  'previewImageUrl',
] as const satisfies ReadonlyArray<keyof NewBookmarkLink>

function richestValue(
  current: string | null | undefined,
  candidate: string | null | undefined,
): string | null | undefined {
  if (candidate == null) return current
  if (current == null) return candidate
  if (candidate.length !== current.length) {
    return candidate.length > current.length ? candidate : current
  }
  return candidate < current ? candidate : current
}

/**
 * Consolidate rows before insert using the bookmark_links unique identity.
 * Metadata is merged independently by field, so a sparse duplicate cannot
 * erase richer article or preview data from another source.
 */
export function mergeBookmarkLinks(rows: NewBookmarkLink[]): NewBookmarkLink[] {
  const merged = new Map<string, NewBookmarkLink>()

  for (const row of rows) {
    const platform = row.platform ?? 'twitter'
    const key = JSON.stringify([row.userId, platform, row.bookmarkId, row.expandedUrl])
    const existing = merged.get(key)

    if (!existing) {
      merged.set(key, { ...row, platform })
      continue
    }

    const next = { ...existing }
    for (const field of MERGED_FIELDS) {
      next[field] = richestValue(existing[field], row[field])
    }
    merged.set(key, next)
  }

  return [...merged.values()]
}

function richestConflictValue(column: SQLWrapper, excludedColumnName: string) {
  const excluded = sql.raw(`excluded.${excludedColumnName}`)
  return sql<string | null>`CASE
    WHEN ${excluded} IS NULL THEN ${column}
    WHEN ${column} IS NULL THEN ${excluded}
    WHEN length(${excluded}) > length(${column}) THEN ${excluded}
    WHEN length(${excluded}) = length(${column})
      AND (${excluded} COLLATE BINARY) < (${column} COLLATE BINARY)
      THEN ${excluded}
    ELSE ${column}
  END`
}

/**
 * Insert or field-wise merge rows at the database uniqueness boundary.
 * Existing non-null metadata survives sparse conflicts, while richer incoming
 * values fill gaps or deterministically replace shorter values.
 */
export function upsertBookmarkLinks(rows: NewBookmarkLink[]): void {
  for (const row of mergeBookmarkLinks(rows)) {
    db.insert(bookmarkLinks)
      .values(row)
      .onConflictDoUpdate({
        target: [
          bookmarkLinks.userId,
          bookmarkLinks.platform,
          bookmarkLinks.bookmarkId,
          bookmarkLinks.expandedUrl,
        ],
        set: {
          originalUrl: richestConflictValue(bookmarkLinks.originalUrl, 'original_url'),
          linkType: richestConflictValue(bookmarkLinks.linkType, 'link_type'),
          domain: richestConflictValue(bookmarkLinks.domain, 'domain'),
          contentJson: richestConflictValue(bookmarkLinks.contentJson, 'content_json'),
          previewTitle: richestConflictValue(bookmarkLinks.previewTitle, 'preview_title'),
          previewDescription: richestConflictValue(
            bookmarkLinks.previewDescription,
            'preview_description',
          ),
          previewImageUrl: richestConflictValue(bookmarkLinks.previewImageUrl, 'preview_image_url'),
        },
      })
      .run()
  }
}
