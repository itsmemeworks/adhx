import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/with-auth'
import { isAdminUserId } from '@/lib/admin/guard'
import { checkRateLimit } from '@/lib/rate-limit'
import {
  createInvite,
  listPendingInvites,
  MAX_PENDING_INVITES,
  mayCreateInvites,
} from '@/lib/auth/invites'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store' }
const CREATE_WINDOW_MS = 60 * 60 * 1000
const CREATE_MAX = 30

/**
 * GET /api/invites — invites that still work, never their links: everyone's
 * for an admin, your own otherwise. `canInvite` says whether you may make one.
 */
export const GET = withAuth(async (_request, userId) => {
  const isAdmin = await isAdminUserId(userId)
  return NextResponse.json(
    {
      canInvite: mayCreateInvites(userId),
      invites: listPendingInvites(userId, { all: isAdmin }),
    },
    { headers: NO_STORE },
  )
})

/**
 * POST /api/invites { nameHint? } → { id, url, expiresAt }. Admins, or any
 * member with INVITES=members. The link is shown once: only its hash is kept.
 */
export const POST = withAuth(async (request: NextRequest, userId) => {
  if (!mayCreateInvites(userId)) {
    return NextResponse.json(
      { error: 'Only the admin can make invites here.' },
      { status: 403, headers: NO_STORE },
    )
  }
  const limit = checkRateLimit(`invites:create:${userId}`, {
    windowMs: CREATE_WINDOW_MS,
    max: CREATE_MAX,
  })
  if (limit.limited) {
    return NextResponse.json(
      { error: 'That’s a lot of invites. Try again in a bit.' },
      {
        status: 429,
        headers: { ...NO_STORE, 'Retry-After': Math.ceil(limit.resetMs / 1000).toString() },
      },
    )
  }
  const body = (await request.json().catch(() => ({}))) as { nameHint?: unknown }
  const created = createInvite(userId, { nameHint: body?.nameHint })
  if (!created.ok) {
    return created.reason === 'too_many'
      ? NextResponse.json(
          { error: `You have ${MAX_PENDING_INVITES} invites waiting. Revoke one first.` },
          { status: 409, headers: NO_STORE },
        )
      : NextResponse.json(
          { error: 'Only the admin can make invites here.' },
          { status: 403, headers: NO_STORE },
        )
  }
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  return NextResponse.json(
    {
      id: created.id,
      url: `${base.replace(/\/+$/, '')}/invite/${created.token}`,
      expiresAt: created.expiresAt,
    },
    { status: 201, headers: NO_STORE },
  )
})
