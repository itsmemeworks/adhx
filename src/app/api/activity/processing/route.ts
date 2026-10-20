import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/with-auth'
import { isDoingScope, processingActivity } from '@/lib/processing/doing'

export const dynamic = 'force-dynamic'

/**
 * GET /api/activity/processing?scope=all|mine|needs → { items, summary }:
 * "What your ADHX is doing". Every post on its way, stuck or finished in the
 * last half hour that you may see (never another member's private save),
 * with who saved it, its step (1–7), percent, status
 * (`working | waiting | needs_you | ready`), a plain reason, retry info and
 * whether you may retry. `summary` counts them and adds free disk space and
 * whether the Mac helper is connected. `summary=1` returns only `summary`.
 */
export const GET = withAuth(async (request, userId) => {
  const params = new URL(request.url).searchParams
  const raw = params.get('scope')
  const view = await processingActivity(userId, isDoingScope(raw) ? raw : 'all', undefined, {
    summaryOnly: params.get('summary') === '1',
  })
  // `summary=1`: just the counts, for the header's "N on their way".
  return NextResponse.json(params.get('summary') === '1' ? { summary: view.summary } : view, {
    headers: { 'Cache-Control': 'private, no-store' },
  })
})
