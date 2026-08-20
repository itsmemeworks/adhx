import { NextResponse } from 'next/server'
import { clearSessionCookie } from '@/lib/auth/session'

// POST /api/auth/logout - clears the session cookie only. Unlike the legacy
// `DELETE /api/auth/twitter` (kept for back-compat), this does NOT delete the
// user's X tokens — the account (and its X connection) outlives a plain
// sign-out now that accounts aren't 1:1 with an X login.
export async function POST() {
  const response = NextResponse.json({ ok: true })
  clearSessionCookie(response)
  return response
}
