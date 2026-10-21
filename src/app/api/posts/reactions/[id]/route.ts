import { NextResponse, type NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/with-auth'
import { removeReaction } from '@/lib/reactions/handlers'

export const dynamic = 'force-dynamic'

/** DELETE /api/posts/reactions/{id} — remove your own reaction → `{ ok: true }` (404 otherwise). */
export const DELETE = withAuth(
  async (_request: NextRequest, userId, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params
    const result = removeReaction(userId, id)
    return NextResponse.json(result.body, {
      status: result.status,
      headers: { 'Cache-Control': 'no-store' },
    })
  },
)
