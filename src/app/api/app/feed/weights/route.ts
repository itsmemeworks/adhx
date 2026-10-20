import { NextResponse } from 'next/server'
import { appError, withPhoneKey } from '@/lib/api/phone-auth'
import { isFeedWeight } from '@/lib/feed/blend'
import { readFeedWeights, setFeedWeightFor } from '@/lib/feed/blend-db'
import { captureException } from '@/lib/sentry'

/**
 * The phone's "Show less / Show more from …" (the same choice as the web's
 * `/api/feed/weights`): GET → `{ weights: { username: -1 | 1 } }`;
 * PUT `{ username, weight: -1 | 0 | 1 }` → `{ weights }` (0 is back to
 * normal). Only other members, never yourself.
 */
export const GET = withPhoneKey(async (_request, { userId }) => {
  try {
    return NextResponse.json(
      { weights: readFeedWeights(userId) },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    captureException(error, { endpoint: '/api/app/feed/weights' })
    return appError(500, 'failed', 'That didn’t load just now. Try again.')
  }
})

export const PUT = withPhoneKey(async (request, { userId }) => {
  const body = (await request.json().catch(() => null)) as {
    username?: unknown
    weight?: unknown
  } | null
  const username = typeof body?.username === 'string' ? body.username.trim() : ''
  if (!username || !isFeedWeight(body?.weight)) {
    return appError(400, 'bad_weight', 'Send { username, weight: -1, 0 or 1 }.')
  }
  try {
    const weights = setFeedWeightFor(userId, username, body.weight)
    if (!weights) return appError(404, 'no_member', 'No one by that name here.')
    return NextResponse.json({ weights }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    captureException(error, { endpoint: '/api/app/feed/weights' })
    return appError(500, 'failed', 'That didn’t save just now. Try again.')
  }
})
