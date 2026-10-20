import type { NextRequest } from 'next/server'
import { publicReadRateLimit } from '@/lib/rate-limit'
import { getCurrentUserId } from '@/lib/auth/session'
import { momentStreamResponse } from '@/lib/moments/stream'

/**
 * GET /api/moments/stream[?watch=slug] — live "Right now" events
 * (Server-Sent Events): `save` (a save landed in a moment or a forming
 * group), `formed` (a new moment), `snapshot` (after a regroup), `stats`,
 * `watching`. `watch` counts this viewer as watching that moment.
 *
 * Signed out, every event is anonymous (counts only). A signed-in member
 * watching a moment is counted by name too, and gets names: moments carry
 * `savers` and `watchers`, `watching` carries `watchers`, `save` carries
 * `saver`, plus that moment's `reaction` events.
 */
export const dynamic = 'force-dynamic'

const SLUG = /^[a-z0-9-]{1,64}$/

export async function GET(request: NextRequest) {
  const limited = publicReadRateLimit(request)
  if (limited) return limited
  const raw = request.nextUrl.searchParams.get('watch')
  const watch = raw && SLUG.test(raw) ? raw : undefined
  const viewerId = (await getCurrentUserId()) ?? ''
  return momentStreamResponse({ request, watch, viewerId })
}
