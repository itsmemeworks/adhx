import { NextResponse } from 'next/server'
import { appError, withPhoneKey } from '@/lib/api/phone-auth'
import { checkRateLimit } from '@/lib/rate-limit'
import {
  createInvite,
  inviteUrl,
  listPendingInvites,
  MAX_PENDING_INVITES,
  mayCreateInvites,
} from '@/lib/auth/invites'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

/**
 * GET /api/app/invites — your invite links that still work, newest first:
 * `{ canInvite, invites: [{ id, url, code, nameHint, createdAt, expiresAt, uses }] }`.
 * Only a link's hash is kept, so `url` is always null here: the link is shown
 * once, when it's made (`POST`), and `POST /api/app/invites/{id}/link` makes
 * a fresh one. `uses` is how many people joined with it: 0 for a one-person
 * invite (it lets one person in, then it's gone from this list), more for a
 * group link an admin made on the web. Your own only, admins included (the web's admin list stays on
 * the web). `canInvite` says whether you may make one.
 */
export const GET = withPhoneKey(async (_request, { userId }) => {
  const invites = listPendingInvites(userId, { all: false }).map((invite) => ({
    id: invite.id,
    url: null,
    code: invite.code,
    nameHint: invite.nameHint,
    createdAt: invite.createdAt,
    expiresAt: invite.expiresAt,
    uses: invite.uses,
  }))
  return NextResponse.json({ canInvite: mayCreateInvites(userId), invites }, { headers: NO_STORE })
})

/**
 * POST /api/app/invites `{ nameHint? }` → 201 `{ id, url, expiresAt }`: a join
 * link for one person, good for 7 days. Share `url` with the share sheet (it
 * opens the join page in their browser: they don't have the app yet).
 * Errors: `not_allowed` 403 (only admins invite here), `too_many` 409 (20
 * waiting), `busy` 429 (30 an hour, shared with the web).
 */
export const POST = withPhoneKey(async (request, { userId }) => {
  const notAllowed = () => appError(403, 'not_allowed', 'Only the admin can make invites here.')
  if (!mayCreateInvites(userId)) return notAllowed()
  const limit = checkRateLimit(`invites:create:${userId}`, { windowMs: 60 * 60 * 1000, max: 30 })
  if (limit.limited) {
    const response = appError(429, 'busy', 'That’s a lot of invites. Try again in a bit.')
    response.headers.set('Retry-After', Math.ceil(limit.resetMs / 1000).toString())
    return response
  }
  const body = (await request.json().catch(() => ({}))) as { nameHint?: unknown } | null
  const created = createInvite(userId, { nameHint: body?.nameHint })
  if (!created.ok) {
    return created.reason === 'too_many'
      ? appError(
          409,
          'too_many',
          `You have ${MAX_PENDING_INVITES} invites waiting. Revoke one first.`,
        )
      : notAllowed()
  }
  return NextResponse.json(
    { id: created.id, url: inviteUrl(created.token), expiresAt: created.expiresAt },
    { status: 201, headers: NO_STORE },
  )
})
