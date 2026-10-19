import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { publicReadRateLimit } from '@/lib/rate-limit'
import { getMomentsSnapshot } from '@/lib/moments/engine'
import { captureException } from '@/lib/sentry'

/**
 * GET /api/moments — "Right now": moments (what people are saving, grouped
 * by meaning), groups still forming, the latest saves and counts. Anonymous
 * (no saver is ever named) and limited to posts allowed in Everyone search.
 * Live updates: `/api/moments/stream`.
 */
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const limited = publicReadRateLimit(request)
  if (limited) return limited
  try {
    const snapshot = await getMomentsSnapshot()
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
