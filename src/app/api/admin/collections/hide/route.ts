import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { collectionEvents } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { withAuth } from '@/lib/api/with-auth'
import { getUserIdForUsername, getUsernameForUserId } from '@/lib/users/lookup'
import { handleRouteError } from '@/lib/api/response'

/**
 * POST /api/admin/collections/hide — content-level moderation lever for the
 * Discovery leaderboards (docs/specs/discovery-leaderboards.md §8), mirroring
 * `POST /api/admin/activity/hide` for the post-level pulse.
 *
 * Body: `{ username, tag, hidden? }` — `username` resolves to the collection
 * owner's userId; `hidden` is a boolean, defaults to `true`. Sets
 * `collection_events.hidden` on EVERY row for the given `(ownerUserId, tag)`
 * — a collection can have many view/clone events — so hiding it removes it
 * uniformly from every leaderboard read path built on
 * `getCollectionLeaderboard()` (src/lib/discovery/rank.ts).
 *
 * This is deliberately NOT a delete: `collection_events` is an append-only
 * event log (see CLAUDE.md / the schema comment), and hiding is a public-
 * visibility flag, not data removal. It also never touches `bookmarks` or
 * `tag_shares` — the curator's own collection is completely unaffected.
 *
 * Auth: requires a signed-in session (`getCurrentUserId()`) AND the
 * account's username to appear in the comma-separated `ADMIN_USERNAMES` env
 * var. Unset/empty means the endpoint always 403s — a safe default with no
 * moderators configured. `ADMIN_USERNAMES` must be set on Fly for this
 * endpoint to work in any deployed environment.
 *
 * The response never includes `viewerId` or `ownerUserId` — only the
 * moderation outcome.
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

    const result = db
      .update(collectionEvents)
      .set({ hidden: hidden ? 1 : 0 })
      .where(and(eq(collectionEvents.ownerUserId, ownerUserId), eq(collectionEvents.tag, tag)))
      .run()

    return NextResponse.json({
      username: targetUsername,
      tag,
      hidden,
      updated: result.changes ?? 0,
    })
  } catch (error) {
    return handleRouteError(error, { endpoint: '/api/admin/collections/hide', userId })
  }
})
