import { NextRequest, NextResponse } from 'next/server'
import { withAdmin } from '@/lib/admin/guard'
import { hidePost } from '@/lib/admin/moderation'
import { handleRouteError } from '@/lib/api/response'

/**
 * POST /api/admin/activity/hide — content-level moderation lever for the
 * public trending/pulse feed. Prefer POST /api/admin/posts from the admin
 * UI; this route stays so existing callers keep working.
 *
 * Body: `{ platform, id, hidden?, reason? }`. Writes `moderated_posts` and
 * sets `activity.hidden` on every row for that post. Never deletes bookmarks.
 */
export const POST = withAdmin(async (request: NextRequest, actor) => {
  try {
    let body: { platform?: unknown; id?: unknown; hidden?: unknown; reason?: unknown }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const platform = typeof body.platform === 'string' ? body.platform.trim() : ''
    const bookmarkId = typeof body.id === 'string' ? body.id.trim() : ''
    const hidden = typeof body.hidden === 'boolean' ? body.hidden : true
    const reason = typeof body.reason === 'string' ? body.reason : null

    if (!platform || !bookmarkId) {
      return NextResponse.json({ error: 'platform and id are required' }, { status: 400 })
    }

    const result = hidePost({
      platform,
      bookmarkId,
      hidden,
      actorUserId: actor.userId,
      reason,
    })

    return NextResponse.json({
      platform,
      id: bookmarkId,
      hidden: result.hidden,
      updated: result.updated,
    })
  } catch (error) {
    return handleRouteError(error, { endpoint: '/api/admin/activity/hide', userId: actor.userId })
  }
})
