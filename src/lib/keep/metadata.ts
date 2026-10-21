import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { bookmarkMedia, bookmarks } from '@/lib/db/schema'
import type { KeptFile } from './store'
import { keptSrc } from './src'

type MediaFile = Pick<KeptFile, 'slot' | 'width' | 'height' | 'durationMs'>

/** Called in recordKept's transaction: playback must describe the files we kept. */
export function reconcileKeptMedia(
  platform: string,
  postId: string,
  files: MediaFile[],
  userId?: string,
): void {
  const media = files.filter((f) => f.slot !== 'poster')
  if (!media.length) return
  // Shared public media changes for every saver; private tags/archive/summary stay put.
  const savers = db
    .select({ userId: bookmarks.userId, category: bookmarks.category, url: bookmarks.tweetUrl })
    .from(bookmarks)
    .where(
      and(
        eq(bookmarks.platform, platform),
        eq(bookmarks.id, postId),
        userId ? eq(bookmarks.userId, userId) : undefined,
      ),
    )
    .all()
  for (const saver of savers) {
    const owned = and(
      eq(bookmarkMedia.userId, saver.userId),
      eq(bookmarkMedia.platform, platform),
      eq(bookmarkMedia.bookmarkId, postId),
    )
    const previous = db.select().from(bookmarkMedia).where(owned).all()
    previous.sort(
      (a, b) => Number(a.id.match(/_(\d+)$/)?.[1] ?? 0) - Number(b.id.match(/_(\d+)$/)?.[1] ?? 0),
    )
    const category = media.some((f) => /^(video|audio)-/.test(f.slot)) ? 'video' : 'photo'
    db.update(bookmarks)
      .set({ category: saver.category === 'article' ? 'article' : category })
      .where(
        and(
          eq(bookmarks.userId, saver.userId),
          eq(bookmarks.platform, platform),
          eq(bookmarks.id, postId),
        ),
      )
      .run()
    db.delete(bookmarkMedia).where(owned).run()
    db.insert(bookmarkMedia)
      .values(
        media.map((file, index) => {
          const photo = file.slot.startsWith('photo-')
          const ordinal = Number(file.slot.split('-')[1]) - 1
          const prior = previous.filter((m) => (m.mediaType === 'photo') === photo)[ordinal]
          return {
            id: `${postId}_kept_${index}`,
            userId: saver.userId,
            platform,
            bookmarkId: postId,
            mediaType: photo ? 'photo' : 'video',
            originalUrl: prior?.originalUrl || saver.url,
            previewUrl: keptSrc(platform, postId, photo ? file.slot : 'poster'),
            width: file.width,
            height: file.height,
            durationMs: file.durationMs,
            altText: prior?.altText ?? null,
          }
        }),
      )
      .run()
  }
}
