import { and, desc, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { bookmarkTags, tagShares } from '@/lib/db/schema'
import { getOwnerCollectionStats } from '@/lib/discovery/rank'
import { getPublicTagCollection } from '@/lib/tags/query'
import { getUserIdForUsername, getUsernameForUserId } from '@/lib/users/lookup'
import { loadSearchItems, type SearchItem } from '@/lib/semantic/items'
import type { SearchHit } from '@/lib/semantic/search'
import type { AutoChannelView } from './auto'

/**
 * Channels for the redesign. A channel IS a tag: its posts are the tagged
 * saves, its public link is `/t/{username}/{tag}` (tag_shares.is_public), and
 * Top channels is the existing collection leaderboard. Nothing here changes
 * who can see what — public reads go through `getPublicTagCollection`, the
 * same gate as the playlist page and API.
 */

const COVER_POSTS = 4
const OWNER_LIMIT = 200

export function keysToHits(keys: string[]): SearchHit[] {
  return keys.map((key) => {
    const at = key.indexOf(':')
    return {
      key,
      platform: key.slice(0, at),
      postId: key.slice(at + 1),
      score: 0,
      matched: [],
      strength: 'strong' as const,
    }
  })
}

export interface MyChannel {
  tag: string
  count: number
  isPublic: boolean
  shareUrl: string | null
  viewCount: number
  cloneCount: number
  rank: number | null
  covers: SearchItem[]
}

/** The user's own channels (tags), newest activity first, with a few cover posts each. */
export async function listMyChannels(
  userId: string,
): Promise<{ username: string | null; channels: MyChannel[] }> {
  const username = await getUsernameForUserId(userId)
  const rows = await db
    .select({
      tag: bookmarkTags.tag,
      platform: bookmarkTags.platform,
      id: bookmarkTags.bookmarkId,
      createdAt: bookmarkTags.createdAt,
    })
    .from(bookmarkTags)
    .where(eq(bookmarkTags.userId, userId))
    .orderBy(desc(sql`coalesce(${bookmarkTags.createdAt}, '')`))
  const shares = await db.select().from(tagShares).where(eq(tagShares.userId, userId))
  const stats = getOwnerCollectionStats(userId)

  const byTag = new Map<string, { count: number; keys: string[]; latest: string }>()
  for (const r of rows) {
    const entry = byTag.get(r.tag) ?? { count: 0, keys: [], latest: r.createdAt ?? '' }
    entry.count++
    if (entry.keys.length < COVER_POSTS) entry.keys.push(`${r.platform}:${r.id}`)
    byTag.set(r.tag, entry)
  }
  const coverItems = await loadSearchItems(
    keysToHits([...byTag.values()].flatMap((e) => e.keys)),
    userId,
  )
  const itemByKey = new Map(
    coverItems.map((i) => [`${i.post.platform ?? 'twitter'}:${i.post.id}`, i]),
  )

  const channels = [...byTag.entries()].map(([tag, entry]) => {
    const share = shares.find((s) => s.tag === tag)
    const isPublic = share?.isPublic ?? false
    const tagStats = isPublic ? stats.byTag[tag] : undefined
    return {
      tag,
      count: entry.count,
      isPublic,
      shareUrl: share && username ? `/t/${username}/${tag}` : null,
      viewCount: tagStats?.viewCount ?? 0,
      cloneCount: tagStats?.cloneCount ?? 0,
      rank: tagStats?.rank ?? null,
      covers: entry.keys.map((k) => itemByKey.get(k)).filter((i): i is SearchItem => !!i),
    }
  })
  return { username, channels }
}

/** Cover posts for "Made for you" channels (the most typical few of each). */
export async function autoChannelCovers(
  userId: string,
  channels: AutoChannelView[],
): Promise<Map<string, SearchItem[]>> {
  const keys = channels.flatMap((c) => c.keys.slice(0, COVER_POSTS))
  const items = await loadSearchItems(keysToHits(keys), userId)
  const byKey = new Map(items.map((i) => [`${i.post.platform ?? 'twitter'}:${i.post.id}`, i]))
  return new Map(
    channels.map((c) => [
      c.slug,
      c.keys
        .slice(0, COVER_POSTS)
        .map((k) => byKey.get(k))
        .filter((i): i is SearchItem => !!i),
    ]),
  )
}

export type ChannelQueue =
  | { status: 'not_found' | 'private' }
  | {
      status: 'ok'
      username: string
      tag: string
      count: number
      isPublic: boolean
      mine: boolean
      items: SearchItem[]
    }

/**
 * A channel's posts as theater/search items. Public channels for anyone;
 * the owner also sees their private ones. Other viewers get anonymised
 * copies (see `loadSearchItems`).
 */
export async function channelQueue(
  username: string,
  tag: string,
  viewerUserId: string | null,
): Promise<ChannelQueue> {
  const ownerId = await getUserIdForUsername(username)
  if (!ownerId) return { status: 'not_found' }
  const mine = viewerUserId === ownerId
  const [share] = await db
    .select({ isPublic: tagShares.isPublic })
    .from(tagShares)
    .where(and(eq(tagShares.userId, ownerId), eq(tagShares.tag, tag)))
    .limit(1)
  const isPublic = share?.isPublic ?? false

  let keys: string[]
  if (mine) {
    const rows = await db
      .select({ platform: bookmarkTags.platform, id: bookmarkTags.bookmarkId })
      .from(bookmarkTags)
      .where(and(eq(bookmarkTags.userId, ownerId), eq(bookmarkTags.tag, tag)))
      .orderBy(desc(sql`coalesce(${bookmarkTags.createdAt}, '')`))
      .limit(OWNER_LIMIT)
    if (rows.length === 0) return { status: 'not_found' }
    keys = rows.map((r) => `${r.platform}:${r.id}`)
  } else {
    const result = await getPublicTagCollection(username, tag)
    if (result.status !== 'ok') return { status: result.status }
    keys = result.data.items.map((i) => `${i.platform}:${i.bookmarkId}`)
  }
  const items = await loadSearchItems(keysToHits(keys), viewerUserId ?? '')
  return { status: 'ok', username, tag, count: items.length, isPublic, mine, items }
}
