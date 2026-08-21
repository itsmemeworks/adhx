import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { activity } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { withAuth } from '@/lib/api/with-auth'
import { getUsernameForUserId } from '@/lib/users/lookup'
import { handleRouteError } from '@/lib/api/response'

/**
 * POST /api/admin/activity/hide — content-level moderation lever for the
 * public trending/pulse feed (see CLAUDE.md "Trending & Activity Pulse").
 *
 * Body: `{ platform, id, hidden? }` — `hidden` is a boolean, defaults to
 * `true`. Sets `activity.hidden` on EVERY row for the given `(platform,
 * bookmarkId)` — a single post can have many events (preview/save/read/
 * share) — so hiding a post removes it uniformly from every public read
 * path built on `getTrendingItems()` (src/lib/trending/query.ts): /trending,
 * /api/activity, /api/trending, the theater, author hubs, related saves, and
 * the sitemap/archive.
 *
 * This is deliberately NOT a delete: `activity` is an append-only event log
 * (see CLAUDE.md), and hiding is a public-visibility flag, not data removal.
 * It also never touches `bookmarks` — a user's own saved copy of the post is
 * completely unaffected.
 *
 * Auth: requires a signed-in session (`getCurrentUserId()`) AND the
 * account's username to appear in the comma-separated `ADMIN_USERNAMES` env
 * var. Unset/empty means the endpoint always 403s — a safe default with no
 * moderators configured. `ADMIN_USERNAMES` must be set on Fly for this
 * endpoint to work in any deployed environment.
 *
 * The response never includes `userId` — only the moderation outcome.
 */
export const POST = withAuth(async (request: NextRequest, userId: string) => {
  try {
    const adminUsernames = (process.env.ADMIN_USERNAMES ?? '')
      .split(',')
      .map((u) => u.trim().toLowerCase())
      .filter(Boolean)

    if (adminUsernames.length === 0) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const username = await getUsernameForUserId(userId)
    if (!username || !adminUsernames.includes(username.toLowerCase())) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    let body: { platform?: unknown; id?: unknown; hidden?: unknown }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const platform = typeof body.platform === 'string' ? body.platform.trim() : ''
    const bookmarkId = typeof body.id === 'string' ? body.id.trim() : ''
    const hidden = typeof body.hidden === 'boolean' ? body.hidden : true

    if (!platform || !bookmarkId) {
      return NextResponse.json({ error: 'platform and id are required' }, { status: 400 })
    }

    const result = db
      .update(activity)
      .set({ hidden: hidden ? 1 : 0 })
      .where(and(eq(activity.platform, platform), eq(activity.bookmarkId, bookmarkId)))
      .run()

    return NextResponse.json({
      platform,
      id: bookmarkId,
      hidden,
      updated: result.changes ?? 0,
    })
  } catch (error) {
    return handleRouteError(error, { endpoint: '/api/admin/activity/hide', userId })
  }
})
