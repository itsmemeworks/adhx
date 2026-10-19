import { NextResponse } from 'next/server'
import { appError, withPhoneKey } from '@/lib/api/phone-auth'
import { setSavePrivate } from '@/lib/bookmarks/privacy'

/**
 * POST /api/app/private { platform, id, private } → { private }
 *
 * The phone's "Just for me" switch. A private save is still yours to search
 * and play, but no one else sees it, counts it or is told you saved it.
 */
export const POST = withPhoneKey(async (request, { userId }) => {
  const body = (await request.json().catch(() => null)) as {
    platform?: unknown
    id?: unknown
    private?: unknown
  } | null
  const platform = typeof body?.platform === 'string' ? body.platform : ''
  const id = typeof body?.id === 'string' ? body.id : ''
  if (!platform || !id || typeof body?.private !== 'boolean') {
    return appError(
      400,
      'bad_request',
      'Send the post’s platform and id, and whether it’s private.',
    )
  }
  const next = setSavePrivate(userId, platform, id, body.private)
  if (next === null) return appError(404, 'not_saved', 'That post isn’t in your saves.')
  return NextResponse.json({ private: next }, { headers: { 'Cache-Control': 'no-store' } })
})
