import { and, eq, isNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import { bookmarks, userBans } from '@/lib/db/schema'
import { readPostModeration } from '@/lib/admin/moderation'
import type { NetworkPostDescription } from './describe'
import { keptFilesFor } from './store'

/** Only public post fields, never another saver's tags, summary or save time. */
export function retainedDescription(
  platform: string,
  postId: string,
): NetworkPostDescription | null {
  const moderation = readPostModeration(platform, postId)
  if (!moderation.ok || moderation.value) return null
  const files = keptFilesFor(platform, postId)
  if (!files.some((f) => f.slot !== 'poster')) return null
  const [post] = db
    .select({
      author: bookmarks.author,
      authorName: bookmarks.authorName,
      text: bookmarks.text,
      createdAt: bookmarks.createdAt,
    })
    .from(bookmarks)
    .leftJoin(userBans, eq(userBans.userId, bookmarks.userId))
    .where(and(eq(bookmarks.platform, platform), eq(bookmarks.id, postId), isNull(userBans.userId)))
    .limit(1)
    .all()
  if (!post) return null
  const videos = files.filter((f) => /^(video|audio)-/.test(f.slot))
  const photos = files.filter((f) => f.slot.startsWith('photo-'))
  return {
    ...post,
    category: videos.length ? 'video' : 'photo',
    videos: videos.length,
    photos: photos.length,
    durationMs: videos[0]?.durationMs ?? null,
    audioOnly: videos.length > 0 && videos.every((f) => f.slot.startsWith('audio-')),
  }
}
