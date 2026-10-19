import { and, count, desc, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { archivedPosts, bookmarks, phoneSaveQueue } from '@/lib/db/schema'
import { previewPath, sourceUrl } from '@/lib/activity/preview-path'
import { keysToHits } from '@/lib/channels/channels'
import { loadSearchItems, type SearchItem } from '@/lib/semantic/items'
import type { FeedItemResponse } from '@/lib/feed/build-item'
import type { Saver } from '@/lib/people/types'
import { keepEnabled } from '@/lib/keep/config'
import { keepCutoff } from '@/lib/keep/worker'

/**
 * A saved post as the phone apps play it (`/api/app/saves`, `/api/app/search`).
 * Media addresses are relative: the apps resolve them against their ADHX. They
 * are the same `/api/files/…` addresses the web plays (the kept file, or the
 * network's proxy until it's downloaded), so they stream with byte ranges.
 */
export interface PhonePost {
  platform: string
  id: string
  /** What to show: a video (or sound) to play, photos to swipe, or words to read. */
  kind: 'video' | 'audio' | 'photo' | 'article' | 'text'
  author: { handle: string; name: string | null; avatarUrl: string | null }
  text: string
  postedAt: string | null
  savedAt: string | null
  /** The post on its own network. */
  sourceUrl: string | null
  /** The post on this ADHX (relative). */
  openPath: string
  media: PhoneMedia[]
  article: { title: string | null; description: string | null; url: string } | null
  /** Why a search found it. Only on search results. */
  match?: { strength: SearchItem['strength']; on: SearchItem['matched'] }
  /** Its picture or video isn't understood yet, so it matched on words. */
  learning?: boolean
  /** Members who saved it, newest first; your own save shows with `isYou`. */
  savers: Saver[]
  /** Your save is just for you: no one else sees, counts or is told about it. */
  isPrivate: boolean
}

export interface PhoneMedia {
  kind: 'video' | 'photo'
  url: string
  posterUrl: string | null
  width: number | null
  height: number | null
  durationMs: number | null
}

const isVideo = (type: string) => type === 'video' || type === 'animated_gif'

function kindOf(post: FeedItemResponse): PhonePost['kind'] {
  if (post.category === 'article' || post.isXArticle) return 'article'
  const media = post.media ?? []
  if (media.some((m) => isVideo(m.mediaType))) {
    // A sound-only post plays its sound in the video slot.
    return post.platform === 'soundcloud' ? 'audio' : 'video'
  }
  return media.length ? 'photo' : 'text'
}

export function toPhonePost(
  { post, matched, strength, learning }: SearchItem,
  search: boolean,
): PhonePost {
  return {
    platform: post.platform,
    id: post.id,
    kind: kindOf(post),
    author: {
      handle: post.author,
      name: post.authorName,
      avatarUrl: post.authorProfileImageUrl,
    },
    text: post.text ?? '',
    postedAt: post.createdAt,
    savedAt: post.processedAt || null,
    sourceUrl:
      sourceUrl(post.platform, post.author, post.id, post.category) ?? post.tweetUrl ?? null,
    openPath: previewPath(post.platform, post.author, post.id, post.category),
    media: (post.media ?? []).map((m) => ({
      kind: isVideo(m.mediaType) ? 'video' : 'photo',
      url: m.url,
      posterUrl: m.thumbnailUrl || null,
      width: m.width,
      height: m.height,
      durationMs: m.durationMs,
    })),
    article: post.articlePreview
      ? {
          title: post.articlePreview.title,
          description: post.articlePreview.description,
          url: post.articlePreview.url,
        }
      : null,
    ...(search ? { match: { strength, on: matched } } : {}),
    ...(learning ? { learning: true } : {}),
    savers: post.savers ?? [],
    isPrivate: post.isPrivate ?? false,
  }
}

/**
 * Your saves, newest first, without the ones you've archived (like My saves
 * on the web). Posts gone from their network are left out.
 */
export async function listSaves(
  userId: string,
  offset: number,
  limit: number,
): Promise<{
  items: PhonePost[]
  total: number
  nextOffset: number | null
  /** Saves not shown yet: still being downloaded. */
  preparing: number
}> {
  const notArchived = sql`(${bookmarks.id}, ${bookmarks.platform}) NOT IN (
    SELECT ${archivedPosts.bookmarkId}, ${archivedPosts.platform}
    FROM ${archivedPosts} WHERE ${archivedPosts.userId} = ${userId}
  )`
  // A post joins the phone's feed once it's ready: its copy is kept (or
  // can't be, or isn't needed). Until then it would only show a spinner.
  const cutoff = keepCutoff()
  const preparingJob = sql`EXISTS (
    SELECT 1 FROM keep_jobs j
    WHERE j.platform = ${bookmarks.platform} AND j.post_id = ${bookmarks.id}
      AND (j.status = 'converting' OR (${keepEnabled() ? 1 : 0} = 1 AND j.status IN ('pending', 'running', 'failed')
      AND (${cutoff} IS NULL OR EXISTS (
        SELECT 1 FROM bookmarks b
        WHERE b.platform = j.platform AND b.id = j.post_id AND b.processed_at >= ${cutoff}
      ))))
  )`
  const mine = and(eq(bookmarks.userId, userId), notArchived)
  const where = and(mine, sql`NOT ${preparingJob}`)
  const [[{ n }], [{ waiting }], [{ queued }], rows] = await Promise.all([
    db.select({ n: count() }).from(bookmarks).where(where),
    db.select({ waiting: count() }).from(bookmarks).where(and(mine, preparingJob)),
    db
      .select({ queued: count() })
      .from(phoneSaveQueue)
      .where(
        and(
          eq(phoneSaveQueue.userId, userId),
          sql`${phoneSaveQueue.status} IN ('waiting', 'working')`,
        ),
      ),
    db
      .select({ platform: bookmarks.platform, id: bookmarks.id })
      .from(bookmarks)
      .where(where)
      .orderBy(desc(bookmarks.processedAt), desc(bookmarks.id))
      .limit(limit)
      .offset(offset),
  ])
  const items = await loadSearchItems(keysToHits(rows.map((r) => `${r.platform}:${r.id}`)), userId)
  const next = offset + rows.length
  return {
    items: items.map((item) => toPhonePost(item, false)),
    total: n,
    nextOffset: next < n ? next : null,
    preparing: waiting + queued,
  }
}

/** One of your saves, archived or not; null when it isn't yours or is gone. */
export async function savedPhonePost(
  userId: string,
  platform: string,
  id: string,
): Promise<PhonePost | null> {
  const [item] = await loadSearchItems(keysToHits([`${platform}:${id}`]), userId)
  return item?.saved ? toPhonePost(item, false) : null
}
