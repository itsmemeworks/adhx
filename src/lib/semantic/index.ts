import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { bookmarks, postEmbeddings } from '@/lib/db/schema'
import { captureException } from '@/lib/sentry'
import { PRIORITY, semanticEnabled, type UnderstandingKind } from './config'
import { enqueuePosts, enqueueBackfill, type PostKey } from './queue'
import { wakeJobs } from './supervisor'

export { getUnderstandingStatus } from './status'
export { startSemanticProcesses, embedQuery } from './supervisor'
export { PRIORITY } from './config'
export type { PostKey } from './queue'

/**
 * Tell the pipeline posts were just saved. Fire-and-forget: never throws and
 * never slows the save itself. Fresh saves are urgent; sync imports queue
 * behind them.
 */
export function noteSaved(keys: PostKey[], priority: number = PRIORITY.urgent): void {
  if (!semanticEnabled() || keys.length === 0) return
  void enqueuePosts(keys, priority)
    .then(() => wakeJobs())
    .catch((error) => captureException(error, { endpoint: 'semantic.noteSaved' }))
}

const lastBackfill = new Map<string, number>()
const BACKFILL_EVERY_MS = 60_000

/** Lazily queue anything of this user's that was never understood (throttled). */
export async function ensureUserBackfill(userId: string): Promise<void> {
  if (!semanticEnabled()) return
  const last = lastBackfill.get(userId) ?? 0
  if (Date.now() - last < BACKFILL_EVERY_MS) return
  lastBackfill.set(userId, Date.now())
  await enqueueBackfill(userId)
  wakeJobs()
}

/** Only keys this user has actually saved. */
export async function ownedKeys(userId: string, keys: PostKey[]): Promise<PostKey[]> {
  if (keys.length === 0) return []
  const rows = await db
    .select({ platform: bookmarks.platform, postId: bookmarks.id })
    .from(bookmarks)
    .where(
      and(
        eq(bookmarks.userId, userId),
        inArray(
          bookmarks.id,
          keys.map((k) => k.postId),
        ),
      ),
    )
  const wanted = new Set(keys.map((k) => `${k.platform || 'twitter'}:${k.postId}`))
  return rows.filter((r) => wanted.has(`${r.platform}:${r.postId}`))
}

/** Move these saves to the front of the line (e.g. what's about to play). */
export async function prioritize(userId: string, keys: PostKey[]): Promise<number> {
  const owned = await ownedKeys(userId, keys)
  if (owned.length === 0) return 0
  await enqueuePosts(owned, PRIORITY.urgent)
  wakeJobs()
  return owned.length
}

/** Give failed items of this user's another go. */
export async function retryFailed(userId: string): Promise<number> {
  const saved = await db
    .select({ platform: bookmarks.platform, postId: bookmarks.id })
    .from(bookmarks)
    .where(eq(bookmarks.userId, userId))
  const savedKeys = new Set(saved.map((s) => `${s.platform}:${s.postId}`))
  const failed = await db
    .select({
      platform: postEmbeddings.platform,
      postId: postEmbeddings.postId,
      kind: postEmbeddings.kind,
    })
    .from(postEmbeddings)
    .where(eq(postEmbeddings.status, 'failed'))
  const mine = failed.filter((f) => savedKeys.has(`${f.platform}:${f.postId}`))
  for (const f of mine) {
    await db
      .delete(postEmbeddings)
      .where(
        and(
          eq(postEmbeddings.platform, f.platform),
          eq(postEmbeddings.postId, f.postId),
          eq(postEmbeddings.kind, f.kind),
        ),
      )
    await enqueuePosts([f], PRIORITY.urgent, [f.kind as UnderstandingKind])
  }
  if (mine.length) wakeJobs()
  return mine.length
}
