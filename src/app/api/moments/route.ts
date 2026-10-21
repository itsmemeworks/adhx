import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { publicReadRateLimit } from '@/lib/rate-limit'
import { getMomentsSnapshot } from '@/lib/moments/engine'
import { withSnapshotPeople } from '@/lib/moments/people'
import { getCurrentUserId } from '@/lib/auth/session'
import { captureException } from '@/lib/sentry'

/**
 * GET /api/moments — "Right now": moments (what people are saving, grouped
 * by meaning), groups still forming, the latest saves and counts. Limited to
 * posts allowed in Everyone search. Signed out it is anonymous (no saver is
 * ever named); a signed-in member also gets each moment's `savers` (up to 5)
 * and `watchers` (members tuned in now).
 * Live updates: `/api/moments/stream`.
 */
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const limited = publicReadRateLimit(request)
  if (limited) return limited
  try {
    const viewerId = (await getCurrentUserId()) ?? ''
    const snapshot = withSnapshotPeople(await getMomentsSnapshot(), viewerId)
    return NextResponse.json(snapshot, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    captureException(error, { endpoint: '/api/moments' })
    return NextResponse.json(
      {
        label: 'Right now',
        hours: 24,
        moments: [],
        forming: [],
        stream: [],
        stats: { today: 0, lastHour: 0 },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
