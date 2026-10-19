import { NextResponse, type NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { withAuth } from '@/lib/api/with-auth'
import { handleRouteError } from '@/lib/api/response'
import { isFeedWeight } from '@/lib/feed/blend'
import { readFeedWeights, writeFeedWeight } from '@/lib/feed/blend-db'

/**
 * GET /api/feed/weights → `{ weights: { username: -1 | 1 } }`: the friends
 * you asked to see more (1) or less (-1) of in the feed.
 *
 * PUT `{ username, weight: -1 | 0 | 1 }` → `{ weights }`. 0 is back to normal.
 * Only other members; not yourself.
 */
export const GET = withAuth(async (_request, userId) => {
  try {
    return NextResponse.json({ weights: readFeedWeights(userId) })
  } catch (error) {
    return handleRouteError(error, {
      endpoint: '/api/feed/weights',
      userId,
      message: 'Failed to read feed settings',
    })
  }
})

export const PUT = withAuth(async (request: NextRequest, userId) => {
  const body = (await request.json().catch(() => null)) as {
    username?: unknown
    weight?: unknown
  } | null
  const username = typeof body?.username === 'string' ? body.username.trim() : ''
  if (!username || !isFeedWeight(body?.weight)) {
    return NextResponse.json({ error: 'Send { username, weight: -1, 0 or 1 }.' }, { status: 400 })
  }
  try {
    const [member] = db
      .select({ id: users.id, username: users.username })
      .from(users)
      .where(eq(users.username, username))
      .all()
    if (!member || member.id === userId) {
      return NextResponse.json({ error: 'No one by that name here.' }, { status: 404 })
    }
    return NextResponse.json({ weights: writeFeedWeight(userId, member.username, body.weight) })
  } catch (error) {
    return handleRouteError(error, {
      endpoint: '/api/feed/weights',
      userId,
      message: 'Failed to save feed settings',
    })
  }
})
