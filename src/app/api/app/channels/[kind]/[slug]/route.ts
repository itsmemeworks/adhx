import { NextResponse } from 'next/server'
import { appError, withPhoneKeyOrSession } from '@/lib/api/phone-auth'
import { toPhonePost, type PhonePost } from '@/lib/app/phone-post'
import { getAutoChannel } from '@/lib/channels/auto'
import { channelQueue, keysToHits } from '@/lib/channels/channels'
import { friendChannelKeys, friendNote, type FriendNote } from '@/lib/channels/friends'
import { groupChannelKeys } from '@/lib/channels/group'
import { recordAnalytic } from '@/lib/analytics/record'
import { keptGroupChannel, type KeptChannel } from '@/lib/channels/group-keep'
import { newKeysFor } from '@/lib/feed/views'
import { listMembers } from '@/lib/people/members'
import { loadSearchItems } from '@/lib/semantic/items'
import { getUsernameForUserId } from '@/lib/users/lookup'
import { captureException } from '@/lib/sentry'

const SLUG = /^[a-z0-9-]{1,64}$/
const USERNAME = /^[A-Za-z0-9_]{1,40}$/

type Params = { params: Promise<{ kind: string; slug: string }> }

/** The posts to play, as `platform:id`, or null when there's no such channel. */
async function keysFor(
  kind: string,
  slug: string,
  userId: string,
  onlyNew: boolean,
): Promise<{ keys: string[]; friendId?: string; name?: string } | null> {
  if (kind === 'group') {
    if (!SLUG.test(slug)) return null
    const channel = await groupChannelKeys(slug)
    if (channel)
      recordAnalytic({ name: 'channel.play', surface: 'group', bookmarkId: slug, userId })
    return channel ? { keys: channel.keys, name: channel.name } : null
  }
  if (kind === 'friend') {
    if (!USERNAME.test(slug)) return null
    const found = friendChannelKeys(userId, listMembers(userId), slug, { onlyNew })
    return found ? { keys: found.keys, friendId: found.userId } : null
  }
  if (kind === 'mine') {
    if (!SLUG.test(slug)) return null
    // Your own channel (a tag) first, then a Made for you channel.
    const username = await getUsernameForUserId(userId)
    if (username) {
      const queue = await channelQueue(username, slug, userId)
      if (queue.status === 'ok') {
        return { keys: queue.items.map((i) => `${i.post.platform}:${i.post.id}`) }
      }
    }
    const auto = await getAutoChannel(userId, slug)
    return auto ? { keys: auto.keys } : null
  }
  return null
}

/**
 * GET /api/app/channels/{group|friend|mine}/{slug}[?new=1] — a channel to
 * play on the phone: `{ items: PhonePost[] }`. `group` is a From everyone
 * slug, `friend` a member's username (`new=1`: only what's new to you),
 * `mine` one of your channels or Made for you. Phone key or signed in.
 * Group and friend items also carry `isNew` (not saved or seen by you);
 * a friend channel adds `note`, their latest note on a save you may see
 * (`{ text, platform, id, savedAt }` or null); a group channel adds `kept`
 * (`{ tag, url }` once you kept it with `POST …/group/{slug}/keep`, else null).
 */
export const GET = withPhoneKeyOrSession(async (request, userId, ctx: Params) => {
  const { kind, slug } = await ctx.params
  try {
    const onlyNew = new URL(request.url).searchParams.get('new') === '1'
    const found = await keysFor(kind, decodeURIComponent(slug), userId, onlyNew)
    if (!found) return appError(404, 'not_found', 'That channel isn’t here.')
    const items = await loadSearchItems(keysToHits(found.keys), userId)
    if (kind === 'mine') {
      return NextResponse.json(
        { items: items.map((item) => toPhonePost(item, false)) },
        { headers: { 'Cache-Control': 'no-store' } },
      )
    }
    const fresh = newKeysFor(
      userId,
      items.map((i) => `${i.post.platform}:${i.post.id}`),
    )
    const body: {
      items: (PhonePost & { isNew: boolean })[]
      note?: FriendNote | null
      kept?: KeptChannel | null
    } = {
      items: items.map((item) => ({
        ...toPhonePost(item, false),
        isNew: fresh.has(`${item.post.platform}:${item.post.id}`),
      })),
    }
    if (found.friendId) body.note = await friendNote(found.friendId)
    if (kind === 'group' && found.name !== undefined) {
      body.kept = await keptGroupChannel(userId, {
        name: found.name,
        slug: decodeURIComponent(slug),
      })
    }
    return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    captureException(error, { endpoint: '/api/app/channels/[kind]/[slug]' })
    return appError(500, 'failed', 'That channel didn’t load just now. Try again.')
  }
})
