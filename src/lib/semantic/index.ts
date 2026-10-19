import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { bookmarks, postEmbeddings, postExtractedText } from '@/lib/db/schema'
import { captureException } from '@/lib/sentry'
import { PRIORITY, isExtractKind, semanticEnabled, type UnderstandingKind } from './config'
import { enqueuePosts, enqueueBackfill, type PostKey } from './queue'
import { wakeJobs } from './supervisor'
import { indexSavedPosts } from './keywords'

export { getUnderstandingStatus } from './status'
export { startSemanticProcesses, embedQuery } from './supervisor'
export { PRIORITY } from './config'
export type { PostKey } from './queue'

/**
 * Tell the pipeline posts were just saved. Fire-and-forget: never throws and
 * never waits for the model. Keywords are indexed even with the model off.
 * Fresh saves are urgent; sync imports queue behind them.
 */
export function noteSaved(keys: PostKey[], priority: number = PRIORITY.urgent): void {
  if (keys.length === 0) return
  void indexSavedPosts(keys).catch((error) =>
    captureException(error, { endpoint: 'semantic.noteSaved.keywords' }),
  )
  if (!semanticEnabled()) return
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
  // Speech / text on screen: the row keeps any earlier words; it just stops counting as done.
  const failedWords = db
    .select({
      platform: postExtractedText.platform,
      postId: postExtractedText.postId,
      kind: postExtractedText.kind,
    })
    .from(postExtractedText)
    .where(eq(postExtractedText.status, 'failed'))
    .all()
    .filter((f) => savedKeys.has(`${f.platform}:${f.postId}`) && isExtractKind(f.kind))
  for (const f of failedWords) {
    db.update(postExtractedText)
      .set({ model: '' })
      .where(
        and(
          eq(postExtractedText.platform, f.platform),
          eq(postExtractedText.postId, f.postId),
          eq(postExtractedText.kind, f.kind),
        ),
      )
      .run()
    if (isExtractKind(f.kind)) await enqueuePosts([f], PRIORITY.urgent, [f.kind])
  }
  const total = mine.length + failedWords.length
  if (total) wakeJobs()
  return total
}
