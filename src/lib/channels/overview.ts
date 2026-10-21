import { listMembers } from '@/lib/people/members'
import type { Saver } from '@/lib/people/types'
import { loadSearchItems, type SearchItem } from '@/lib/semantic/items'
import type { FeedItemResponse } from '@/lib/feed/build-item'
import { mayCreateInvites } from '@/lib/auth/invites'
import { getAutoChannels, type AutoChannelDeps } from './auto'
import { autoChannelCovers, keysToHits, listMyChannels, type MyChannel } from './channels'
import { friendChannels } from './friends'
import { groupChannelsFor } from './group'

/**
 * Everything on the Channels page for one signed-in member, shared by the
 * web (`GET /api/channels`) and the phone (`GET /api/app/channels`):
 * From everyone (group channels), Your people (one per friend), Made for
 * you and the member's own channels.
 */

const COVER_POSTS = 4

export interface GroupChannelCard {
  slug: string
  name: string
  size: number
  /** How many members saved into it. */
  members: number
  /** Up to three of them, most posts first. */
  savers: Saver[]
  newCount: number
  covers: SearchItem[]
}

export interface FriendChannelCard {
  username: string
  name: string | null
  avatarUrl: string | null
  size: number
  newCount: number
  covers: SearchItem[]
}

export interface MadeForYouCard {
  slug: string
  name: string
  size: number
  covers: SearchItem[]
}

export interface ChannelsOverview {
  username: string | null
  group: GroupChannelCard[]
  friends: FriendChannelCard[]
  madeForYou: MadeForYouCard[]
  mine: MyChannel[]
  /** Whether this member may make invite links (the "Invite someone" card). */
  canInvite: boolean
}

async function coversFor(
  viewerId: string,
  lists: Map<string, string[]>,
): Promise<Map<string, SearchItem[]>> {
  const keys = [...new Set([...lists.values()].flat())]
  const items = await loadSearchItems(keysToHits(keys), viewerId, { savers: false })
  const byKey = new Map(items.map((i) => [`${i.post.platform ?? 'twitter'}:${i.post.id}`, i]))
  return new Map(
    [...lists.entries()].map(([id, list]) => [
      id,
      list.map((k) => byKey.get(k)).filter((i): i is SearchItem => !!i),
    ]),
  )
}

export async function channelsOverview(
  viewerId: string,
  deps: AutoChannelDeps = {},
): Promise<ChannelsOverview> {
  const members = listMembers(viewerId)
  const [{ username, channels }, auto, group] = await Promise.all([
    listMyChannels(viewerId),
    getAutoChannels(viewerId, deps),
    groupChannelsFor(viewerId, members, deps),
  ])
  const friends = friendChannels(viewerId, members)
  const [autoCovers, groupCovers, friendCovers] = await Promise.all([
    autoChannelCovers(viewerId, auto),
    coversFor(
      viewerId,
      new Map(
        group.map((c) => [
          c.slug,
          (c.coverKeys ?? c.keys).filter((key) => c.keys.includes(key)).slice(0, COVER_POSTS),
        ]),
      ),
    ),
    coversFor(viewerId, new Map(friends.map((f) => [f.username, f.coverKeys]))),
  ])
  return {
    username,
    group: group.map((c) => ({
      slug: c.slug,
      name: c.name,
      size: c.size,
      members: c.members,
      savers: c.savers,
      newCount: c.newCount,
      covers: groupCovers.get(c.slug) ?? [],
    })),
    friends: friends.map((f) => ({
      username: f.username,
      name: f.name,
      avatarUrl: f.avatarUrl,
      size: f.size,
      newCount: f.newCount,
      covers: friendCovers.get(f.username) ?? [],
    })),
    // A "Made for you" channel that was kept now lives under the user's own.
    madeForYou: auto
      .filter((c) => !channels.some((m) => m.tag === c.slug))
      .map((c) => ({
        slug: c.slug,
        name: c.name,
        size: c.size,
        covers: autoCovers.get(c.slug) ?? [],
      })),
    mine: channels,
    canInvite: mayCreateInvites(viewerId),
  }
}

/** An image to show for a post on a cover, as an absolute path (or full URL). */
export function coverUrl(post: FeedItemResponse): string | null {
  const isArticle = post.category === 'article' || post.isXArticle
  const media = post.media?.[0]
  const src =
    (isArticle ? post.articlePreview?.imageUrl : null) ||
    media?.thumbnailUrl ||
    (media && media.mediaType === 'photo' ? media.url : null) ||
    post.articlePreview?.imageUrl ||
    null
  if (!src) return null
  return /^(https?:)?\//.test(src) ? src : `/${src}`
}

export function coverUrls(covers: SearchItem[]): string[] {
  return covers.map((c) => coverUrl(c.post)).filter((u): u is string => !!u)
}
