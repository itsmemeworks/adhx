import { NextResponse } from 'next/server'
import { appError, withPhoneKeyOrSession } from '@/lib/api/phone-auth'
import { toPhonePost } from '@/lib/app/phone-post'
import { getAutoChannel } from '@/lib/channels/auto'
import { channelQueue, keysToHits } from '@/lib/channels/channels'
import { friendChannelKeys } from '@/lib/channels/friends'
import { groupChannelKeys } from '@/lib/channels/group'
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
): Promise<string[] | null> {
  if (kind === 'group') {
    if (!SLUG.test(slug)) return null
    return (await groupChannelKeys(slug))?.keys ?? null
  }
  if (kind === 'friend') {
    if (!USERNAME.test(slug)) return null
    return friendChannelKeys(userId, listMembers(userId), slug, { onlyNew })?.keys ?? null
  }
  if (kind === 'mine') {
    if (!SLUG.test(slug)) return null
    // Your own channel (a tag) first, then a Made for you channel.
    const username = await getUsernameForUserId(userId)
    if (username) {
      const queue = await channelQueue(username, slug, userId)
      if (queue.status === 'ok') return queue.items.map((i) => `${i.post.platform}:${i.post.id}`)
    }
    return (await getAutoChannel(userId, slug))?.keys ?? null
  }
  return null
}

/**
 * GET /api/app/channels/{group|friend|mine}/{slug}[?new=1] — a channel to
 * play on the phone: `{ items: PhonePost[] }`. `group` is a From everyone
 * slug, `friend` a member's username (`new=1`: only what's new to you),
 * `mine` one of your channels or Made for you. Phone key or signed in.
 */
export const GET = withPhoneKeyOrSession(async (request, userId, ctx: Params) => {
  const { kind, slug } = await ctx.params
  try {
    const onlyNew = new URL(request.url).searchParams.get('new') === '1'
    const keys = await keysFor(kind, decodeURIComponent(slug), userId, onlyNew)
    if (!keys) return appError(404, 'not_found', 'That channel isn’t here.')
    const items = await loadSearchItems(keysToHits(keys), userId)
    return NextResponse.json(
      { items: items.map((item) => toPhonePost(item, false)) },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    captureException(error, { endpoint: '/api/app/channels/[kind]/[slug]' })
    return appError(500, 'failed', 'That channel didn’t load just now. Try again.')
  }
})
