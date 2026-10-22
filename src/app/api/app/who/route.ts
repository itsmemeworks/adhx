import { NextResponse } from 'next/server'
import { appError, withPhoneKey } from '@/lib/api/phone-auth'
import { onAPost } from '@/lib/people/on-a-post'
import { captureException } from '@/lib/sentry'

const PLATFORM = /^[a-z]{1,16}$/
const ID = /^[A-Za-z0-9._~:@-]{1,200}$/

/**
 * GET /api/app/who?platform=…&id= — who's on a post, for the player's face
 * row: `{ savers, reactions, watched }`. `savers` newest first (as on feed
 * items), `reactions` oldest first (as `/api/app/reactions`), `watched` newest
 * first (`[{ username, name, avatarUrl, at, isYou }]`). 404 `not_found` when
 * you can't see any save of it. Members only, `no-store`.
 */
export const GET = withPhoneKey(async (request, { userId }) => {
  const params = new URL(request.url).searchParams
  const platform = params.get('platform') ?? ''
  const id = params.get('id') ?? ''
  if (!PLATFORM.test(platform) || !ID.test(id)) {
    return appError(400, 'bad_post', 'That isn’t a post.')
  }
  try {
    const who = onAPost(userId, platform, id)
    if (!who) return appError(404, 'not_found', 'That post isn’t one you can see.')
    return NextResponse.json(who, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    captureException(error, { endpoint: '/api/app/who' })
    return appError(500, 'failed', 'Couldn’t load who’s on this one.')
  }
})
