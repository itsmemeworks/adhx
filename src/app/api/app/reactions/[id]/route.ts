import { NextResponse } from 'next/server'
import { withPhoneKey } from '@/lib/api/phone-auth'
import { removeReaction } from '@/lib/reactions/handlers'

export const dynamic = 'force-dynamic'

/** DELETE /api/app/reactions/{id} — remove your own reaction → `{ ok: true }` (404 `not_found` otherwise). */
export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  return withPhoneKey((_req, { userId }) => {
    const result = removeReaction(userId, id)
    return NextResponse.json(result.body, {
      status: result.status,
      headers: { 'Cache-Control': 'no-store' },
    })
  })(request)
}
