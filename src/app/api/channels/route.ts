import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/with-auth'
import { handleRouteError } from '@/lib/api/response'
import { getAutoChannels } from '@/lib/channels/auto'
import { autoChannelCovers, listMyChannels } from '@/lib/channels/channels'

/**
 * GET /api/channels — the signed-in user's channels (their tags, with share
 * state, stats and cover posts) and their "Made for you" channels (saves
 * grouped and named automatically; private to them).
 */
export const GET = withAuth(async (_request, userId) => {
  try {
    const [{ username, channels }, auto] = await Promise.all([
      listMyChannels(userId),
      getAutoChannels(userId),
    ])
    const covers = await autoChannelCovers(userId, auto)
    const response = NextResponse.json({
      username,
      mine: channels,
      // A "Made for you" channel that was kept now lives under the user's own.
      madeForYou: auto
        .filter((c) => !channels.some((m) => m.tag === c.slug))
        .map((c) => ({
          slug: c.slug,
          name: c.name,
          size: c.size,
          covers: covers.get(c.slug) ?? [],
        })),
    })
    response.headers.set('Cache-Control', 'no-store')
    return response
  } catch (error) {
    return handleRouteError(error, {
      endpoint: '/api/channels',
      userId,
      message: 'Failed to load channels',
    })
  }
})
