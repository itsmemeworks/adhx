import { NextResponse } from 'next/server'
import { appError, withPhoneKey } from '@/lib/api/phone-auth'
import { keepGroupChannel, leaveGroupChannel } from '@/lib/channels/group-keep'
import { captureException } from '@/lib/sentry'

const SLUG = /^[a-z0-9-]{1,64}$/

/**
 * POST /api/app/channels/group/{slug}/keep — "Keep this channel" from the
 * phone → `{ tag, url, added }` (same rules as the web). Only `group`
 * channels can be kept this way; anything else is 404 `not_found`.
 */
export const POST = withPhoneKey(async (request, { userId }) => {
  const parts = new URL(request.url).pathname.split('/')
  const kind = parts[parts.length - 3]
  const slug = decodeURIComponent(parts[parts.length - 2] ?? '')
  if (kind !== 'group' || !SLUG.test(slug)) {
    return appError(404, 'not_found', 'That channel isn’t here.')
  }
  try {
    const kept = await keepGroupChannel(userId, slug)
    if (!kept) return appError(404, 'not_found', 'That channel isn’t here.')
    return NextResponse.json(kept, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    captureException(error, { endpoint: '/api/app/channels/group/keep' })
    return appError(500, 'failed', 'That didn’t keep just now. Try again.')
  }
})

/**
 * DELETE /api/app/channels/group/{slug}/keep — leave a kept channel (the
 * player's keep toggle) → `{ removed }`: your channel named after it goes,
 * with the saves keeping it added that aren't in another channel of yours.
 */
export const DELETE = withPhoneKey(async (request, { userId }) => {
  const parts = new URL(request.url).pathname.split('/')
  const kind = parts[parts.length - 3]
  const slug = decodeURIComponent(parts[parts.length - 2] ?? '')
  if (kind !== 'group' || !SLUG.test(slug)) {
    return appError(404, 'not_found', 'That channel isn’t here.')
  }
  try {
    const left = await leaveGroupChannel(userId, slug)
    if (!left) return appError(404, 'not_found', 'That channel isn’t here.')
    return NextResponse.json(left, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    captureException(error, { endpoint: '/api/app/channels/group/keep', method: 'DELETE' })
    return appError(500, 'failed', 'That didn’t leave just now. Try again.')
  }
})
