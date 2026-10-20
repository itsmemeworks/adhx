import { NextResponse } from 'next/server'
import { appError, withPhoneKey } from '@/lib/api/phone-auth'
import { FEED_KINDS, parseFeedTypes } from '@/lib/feed/blend'
import { readFeedTypes, writeFeedTypes } from '@/lib/feed/kinds'
import { captureException } from '@/lib/sentry'

/**
 * The phone's "What's in your feed" (the same choice as the web's
 * `/api/feed/types`): GET → `{ types }`; PUT `{ types }` (at least one of
 * video, photo, text, article; audio counts as video) → `{ types }`.
 */
export const GET = withPhoneKey(async (_request, { userId }) => {
  try {
    return NextResponse.json(
      { types: readFeedTypes(userId) },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    captureException(error, { endpoint: '/api/app/feed/types' })
    return appError(500, 'failed', 'That didn’t load just now. Try again.')
  }
})

export const PUT = withPhoneKey(async (request, { userId }) => {
  const body = (await request.json().catch(() => null)) as { types?: unknown } | null
  const types =
    Array.isArray(body?.types) && body.types.every((t) => typeof t === 'string')
      ? parseFeedTypes(body.types.join(','))
      : null
  if (!types) {
    return appError(400, 'bad_types', `Pick at least one of ${FEED_KINDS.join(', ')}.`)
  }
  try {
    return NextResponse.json(
      { types: writeFeedTypes(userId, types) },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    captureException(error, { endpoint: '/api/app/feed/types' })
    return appError(500, 'failed', 'That didn’t save just now. Try again.')
  }
})
