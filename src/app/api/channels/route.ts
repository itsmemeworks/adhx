import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/with-auth'
import { handleRouteError } from '@/lib/api/response'
import { channelsOverview } from '@/lib/channels/overview'

/**
 * GET /api/channels — everything on the Channels page, for members only:
 *
 * - `group`: From everyone. The server's visible saves grouped and named
 *   (`{ slug, name, size, members, savers, newCount, covers }`).
 * - `friends`: Your people. One channel per other member with visible saves
 *   (`{ username, name, avatarUrl, size, newCount, covers }`).
 * - `madeForYou`: the viewer's saves grouped and named (private to them).
 * - `mine`: the viewer's own channels (tags), with share state and stats.
 * - `canInvite`: whether to offer "Invite someone".
 */
export const GET = withAuth(async (_request, userId) => {
  try {
    const response = NextResponse.json(await channelsOverview(userId))
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
