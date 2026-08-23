import { NextRequest, NextResponse } from 'next/server'
import { withAdmin } from '@/lib/admin/guard'
import { hidePlaylistEvents } from '@/lib/admin/moderation'
import { getUserIdForUsername } from '@/lib/users/lookup'
import { handleRouteError } from '@/lib/api/response'

/**
 * POST /api/admin/collections/hide — hide/unhide a playlist from leaderboards.
 * Body: `{ username, tag, hidden? }`. Never touches the curator's bookmarks.
 */
export const POST = withAdmin(async (request: NextRequest, actor) => {
  try {
    let body: { username?: unknown; tag?: unknown; hidden?: unknown }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const targetUsername = typeof body.username === 'string' ? body.username.trim() : ''
    const tag = typeof body.tag === 'string' ? body.tag.trim() : ''
    const hidden = typeof body.hidden === 'boolean' ? body.hidden : true

    if (!targetUsername || !tag) {
      return NextResponse.json({ error: 'username and tag are required' }, { status: 400 })
    }

    const ownerUserId = await getUserIdForUsername(targetUsername)
    if (!ownerUserId) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const result = hidePlaylistEvents({
      ownerUserId,
      tag,
      hidden,
      actorUserId: actor.userId,
      username: targetUsername,
    })

    return NextResponse.json({
      username: targetUsername,
      tag,
      hidden,
      updated: result.updated,
    })
  } catch (error) {
    return handleRouteError(error, {
      endpoint: '/api/admin/collections/hide',
      userId: actor.userId,
    })
  }
})
