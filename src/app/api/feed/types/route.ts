import { NextResponse, type NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/with-auth'
import { handleRouteError } from '@/lib/api/response'
import { FEED_KINDS, parseFeedTypes } from '@/lib/feed/blend'
import { readFeedTypes, writeFeedTypes } from '@/lib/feed/kinds'

/**
 * "What's in your feed": GET → `{ types }` (default `['video', 'photo']`);
 * PUT `{ types: ['video', 'photo', 'text', 'article'] }` (at least one; audio
 * counts as video) → `{ types }`. Stored as `user_preferences` `feed.types`.
 */
export const GET = withAuth(async (_request, userId) => {
  try {
    return NextResponse.json({ types: readFeedTypes(userId) })
  } catch (error) {
    return handleRouteError(error, {
      endpoint: '/api/feed/types',
      userId,
      message: 'Failed to read feed settings',
    })
  }
})

export const PUT = withAuth(async (request: NextRequest, userId) => {
  const body = (await request.json().catch(() => null)) as { types?: unknown } | null
  const types = Array.isArray(body?.types)
    ? body.types.every((t) => typeof t === 'string')
      ? parseFeedTypes(body.types.join(','))
      : null
    : null
  if (!types) {
    return NextResponse.json(
      { error: `Send { types } with at least one of ${FEED_KINDS.join(', ')}.` },
      { status: 400 },
    )
  }
  try {
    return NextResponse.json({ types: writeFeedTypes(userId, types) })
  } catch (error) {
    return handleRouteError(error, {
      endpoint: '/api/feed/types',
      userId,
      message: 'Failed to save feed settings',
    })
  }
})
