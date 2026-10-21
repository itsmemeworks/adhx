import { NextResponse } from 'next/server'
import { appError, withPhoneKey } from '@/lib/api/phone-auth'
import { keepStatus, savedPost } from '@/lib/app/phone-app'

/**
 * GET /api/app/status?platform=…&id=… — how the kept copy of one of your saved
 * posts is coming along: waiting, keeping (with a percent when the download
 * reports one), kept, retrying, unavailable, or off.
 */
export const GET = withPhoneKey(async (request, { userId }) => {
  const params = new URL(request.url).searchParams
  const platform = params.get('platform') ?? ''
  const id = params.get('id') ?? ''
  if (!platform || !id || !savedPost(userId, platform, id)) {
    return appError(404, 'not_saved', 'That post isn’t in your saves.')
  }
  return NextResponse.json(keepStatus(platform, id), {
    headers: { 'Cache-Control': 'no-store' },
  })
})
