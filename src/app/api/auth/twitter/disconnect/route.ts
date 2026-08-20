import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/with-auth'
import { unlinkX } from '@/lib/auth/account'

// POST /api/auth/twitter/disconnect (authed) - removes the X identity + its
// OAuth tokens from the current account, but keeps the account itself alive.
// Refused when the account has no other way to sign back in (no email
// identity yet) — the caller should prompt to add an email first.
export const POST = withAuth(async (_req, userId) => {
  const result = await unlinkX(userId)
  if ('error' in result) {
    return NextResponse.json(
      { error: 'Add an email sign-in first so you can still get in' },
      { status: 409 },
    )
  }
  return NextResponse.json({ ok: true })
})
