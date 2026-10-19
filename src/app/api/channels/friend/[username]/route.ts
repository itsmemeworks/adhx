import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/with-auth'
import { handleRouteError } from '@/lib/api/response'
import { friendChannelKeys } from '@/lib/channels/friends'
import { keysToHits } from '@/lib/channels/channels'
import { listMembers } from '@/lib/people/members'
import { loadSearchItems } from '@/lib/semantic/items'

const USERNAME = /^[A-Za-z0-9_]{1,40}$/

/**
 * GET /api/channels/friend/{username}[?new=1] — one friend's channel as a
 * play queue: their saves other members may see (never their private ones),
 * newest first; `new=1` keeps only the ones you haven't saved or seen.
 * `friend` is their card (`{ username, name, avatarUrl, size, newCount }`).
 * Members only; your own username is not a friend channel (404).
 */
export const GET = withAuth(
  async (request: NextRequest, userId, { params }: { params: Promise<{ username: string }> }) => {
    const { username } = await params
    if (!USERNAME.test(username)) {
      return NextResponse.json({ error: 'Invalid channel' }, { status: 400 })
    }
    try {
      const onlyNew = request?.nextUrl?.searchParams.get('new') === '1'
      const found = friendChannelKeys(userId, listMembers(userId), username, { onlyNew })
      if (!found) return NextResponse.json({ error: 'Channel not found' }, { status: 404 })
      const items = await loadSearchItems(keysToHits(found.keys), userId)
      const { coverKeys: _covers, ...friend } = found.friend
      const response = NextResponse.json({
        name: `${friend.name?.trim() || friend.username}’s saves`,
        friend,
        items,
        total: items.length,
        understood: true,
        close: true,
        refined: false,
        nextOffset: null,
      })
      response.headers.set('Cache-Control', 'no-store')
      return response
    } catch (error) {
      return handleRouteError(error, {
        endpoint: '/api/channels/friend',
        userId,
        message: 'Failed to load channel',
      })
    }
  },
)
