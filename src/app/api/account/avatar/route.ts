import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/with-auth'
import { changeAvatar, resetAvatar, type AvatarResult } from '@/lib/avatar/handler'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store' }

function reply(result: AvatarResult): NextResponse {
  return NextResponse.json(result.body, { status: result.status, headers: NO_STORE })
}

/**
 * POST /api/account/avatar — change your picture → `{ avatarUrl, source }`.
 * The phones use the same handler (`/api/app/me/avatar`); see
 * `src/lib/avatar/handler.ts` for the bodies and errors.
 */
export const POST = withAuth(async (request: NextRequest, userId) =>
  reply(await changeAvatar(request, userId, { endpoint: '/api/account/avatar' })),
)

/** DELETE /api/account/avatar — no picture: a face made from your username. */
export const DELETE = withAuth(async (_request, userId) => reply(await resetAvatar(userId)))
