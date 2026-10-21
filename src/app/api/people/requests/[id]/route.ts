import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/with-auth'
import { answerJoinRequest } from '@/lib/people/view'

export const dynamic = 'force-dynamic'

/**
 * POST /api/people/requests/[id] { decision: 'approve' | 'not_now' | 'decline' }
 * (admins) → { approval }. `id` is the invite the person joined with.
 */
export const POST = withAuth(
  async (request: NextRequest, userId, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params
    const body = await request.json().catch(() => null)
    const result = await answerJoinRequest(userId, id, body)
    return NextResponse.json(result.body, {
      status: result.status,
      headers: { 'Cache-Control': 'private, no-store' },
    })
  },
)
