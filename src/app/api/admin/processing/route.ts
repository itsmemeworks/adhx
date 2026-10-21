import { NextRequest, NextResponse } from 'next/server'
import { withAdmin } from '@/lib/admin/guard'
import { linkOnly, retryAllFailed, retryOne, setPaused } from '@/lib/admin/boards/processing'
import { handleRouteError } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store' }

/**
 * POST /api/admin/processing (admins), audited:
 * - `{ action: 'pause' }` / `{ action: 'resume' }`: Pause new work → `{ paused }`
 * - `{ action: 'retry_failed' }`: retry everything that failed → `{ retried }`
 * - `{ action: 'retry', platform, id }`: retry one post → `{ retried }`
 * - `{ action: 'link_only', platform, id }`: stop trying, keep the link → `{ done }`
 */
export const POST = withAdmin(async (request: NextRequest, actor) => {
  const body = (await request.json().catch(() => null)) as {
    action?: unknown
    platform?: unknown
    id?: unknown
  } | null
  const action = body?.action
  const platform = typeof body?.platform === 'string' ? body.platform.trim() : ''
  const id = typeof body?.id === 'string' ? body.id.trim() : ''
  try {
    if (action === 'pause' || action === 'resume') {
      return NextResponse.json(
        { paused: setPaused(actor.userId, action === 'pause') },
        { headers: NO_STORE },
      )
    }
    if (action === 'retry_failed') {
      return NextResponse.json(
        { retried: await retryAllFailed(actor.userId) },
        { headers: NO_STORE },
      )
    }
    if ((action === 'retry' || action === 'link_only') && platform && id) {
      if (action === 'retry') {
        return NextResponse.json(
          { retried: await retryOne(actor.userId, platform, id) },
          { headers: NO_STORE },
        )
      }
      return NextResponse.json(
        { done: linkOnly(actor.userId, platform, id) },
        { headers: NO_STORE },
      )
    }
    return NextResponse.json(
      { error: 'action is pause, resume, retry_failed, or retry / link_only with platform and id' },
      { status: 400, headers: NO_STORE },
    )
  } catch (error) {
    return handleRouteError(error, { endpoint: '/api/admin/processing', userId: actor.userId })
  }
})
