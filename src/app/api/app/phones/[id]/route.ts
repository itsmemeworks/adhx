import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/with-auth'
import { deleteAccessKey } from '@/lib/auth/access-keys'

/** DELETE /api/app/phones/:id — the phone stops being able to save straight away. */
export const DELETE = withAuth(
  async (_request: NextRequest, userId, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params
    if (!deleteAccessKey(userId, id, 'phone')) {
      return NextResponse.json({ error: 'Phone not found' }, { status: 404 })
    }
    return NextResponse.json({ success: true })
  },
)
