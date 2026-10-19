import { NextResponse } from 'next/server'
import { appError, withPhoneKey } from '@/lib/api/phone-auth'
import { LIVE_LIMIT, phoneLive } from '@/lib/app/live'
import { getMomentsSnapshot } from '@/lib/moments/engine'
import { withSnapshotPeople } from '@/lib/moments/people'
import { checkRateLimit } from '@/lib/rate-limit'
import { captureException } from '@/lib/sentry'

export const dynamic = 'force-dynamic'

/**
 * GET /api/app/live — "Right now" for the phone: what your people are saving,
 * sorted into moments as it happens. `{ label, hours, moments, forming,
 * stream, stats }`; each moment names up to 5 `savers` and its `watchers`
 * (members tuned in now, not you), covers are image addresses (paths from
 * this ADHX's root, or a full URL), posts are `PhonePost`s.
 */
export const GET = withPhoneKey(async (_request, { userId }) => {
  const limited = checkRateLimit(`app-live:${userId}`, LIVE_LIMIT)
  if (limited.limited) {
    const response = appError(429, 'busy', 'Lots of requests just now. Give it a moment.')
    response.headers.set('Retry-After', Math.ceil(limited.resetMs / 1000).toString())
    return response
  }
  try {
    const snapshot = withSnapshotPeople(await getMomentsSnapshot(), userId)
    return NextResponse.json(phoneLive(snapshot), { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    captureException(error, { endpoint: '/api/app/live' })
    return appError(500, 'failed', 'Right now didn’t load. Try again.')
  }
})
