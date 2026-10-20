import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/with-auth'
import { requireAdmin } from '@/lib/admin/guard'
import { listJoinRequests } from '@/lib/auth/approval'

export const dynamic = 'force-dynamic'

/** GET /api/people/requests (admins) → { requests }: people waiting to be let in, oldest first. */
export const GET = withAuth(async (_request, userId) => {
  const gate = await requireAdmin(userId)
  if (!gate.ok) return gate.response
  return NextResponse.json(
    { requests: listJoinRequests() },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
})
