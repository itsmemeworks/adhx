import { and, eq, inArray, isNotNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import { postEmbeddings } from '@/lib/db/schema'

/**
 * Posts whose picture or video was deleted upstream (404/410). The worker
 * records them as `status: 'none'` with the reason in `error` (only
 * `MediaGoneError` does that), and nothing shows them: there's nothing left
 * to play.
 */
export async function goneKeys(keys: string[]): Promise<Set<string>> {
  const gone = new Set<string>()
  const ids = [...new Set(keys.map((k) => k.slice(k.indexOf(':') + 1)))]
  for (let i = 0; i < ids.length; i += 500) {
    const rows = await db
      .selectDistinct({ platform: postEmbeddings.platform, postId: postEmbeddings.postId })
      .from(postEmbeddings)
      .where(
        and(
          inArray(postEmbeddings.postId, ids.slice(i, i + 500)),
          eq(postEmbeddings.status, 'none'),
          isNotNull(postEmbeddings.error),
        ),
      )
    for (const r of rows) gone.add(`${r.platform}:${r.postId}`)
  }
  return gone
}

/** `items` without the gone ones, order kept. */
export async function withoutGone<T extends { key: string }>(items: T[]): Promise<T[]> {
  if (items.length === 0) return items
  const gone = await goneKeys(items.map((i) => i.key))
  return gone.size ? items.filter((i) => !gone.has(i.key)) : items
}
