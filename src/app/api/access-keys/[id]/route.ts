import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/with-auth'
import { deleteAccessKey } from '@/lib/auth/access-keys'

/** DELETE /api/access-keys/:id — the key stops working straight away. */
export const DELETE = withAuth(
  async (_request: NextRequest, userId, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params
    if (!deleteAccessKey(userId, id)) {
      return NextResponse.json({ error: 'Key not found' }, { status: 404 })
    }
    return NextResponse.json({ success: true })
  },
)
