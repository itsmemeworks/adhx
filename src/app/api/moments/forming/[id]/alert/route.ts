import { NextResponse, type NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/with-auth'
import { setFormingAlert, type AlertResult } from '@/lib/moments/alert-handlers'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

function reply(result: AlertResult): NextResponse {
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

/**
 * PUT /api/moments/forming/{id}/alert — "Tell me when it's live" on a forming
 * group → `{ alert: true }` (404 `forming_gone` when it no longer exists). The
 * bell follows the group through regroups; when it goes live you get one
 * alert (`GET /api/moments/alerts`).
 */
export const PUT = withAuth(async (_request: NextRequest, userId, ctx: Ctx) =>
  reply(await setFormingAlert(userId, (await ctx.params).id, true)),
)

/** DELETE /api/moments/forming/{id}/alert → `{ alert: false }`. */
export const DELETE = withAuth(async (_request: NextRequest, userId, ctx: Ctx) =>
  reply(await setFormingAlert(userId, (await ctx.params).id, false)),
)
