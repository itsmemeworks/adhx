import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/with-auth'
import { createLoginToken, hasRecentLoginToken } from '@/lib/auth/account'
import { sendMagicLinkEmail } from '@/lib/email/magic-link'
import { isValidEmail } from '@/lib/utils/email'
import { db } from '@/lib/db'
import { userIdentities } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'

// POST /api/auth/email/change (authed) - request confirmation for a new
// email on the current account. Unlike /request, this is authenticated so
// it's fine to reveal when the address is already taken by another account.
export const POST = withAuth(async (req: NextRequest, userId: string) => {
  let body: { email?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 })
  }

  const [existing] = await db
    .select({ userId: userIdentities.userId })
    .from(userIdentities)
    .where(and(eq(userIdentities.provider, 'email'), eq(userIdentities.providerId, email)))
    .limit(1)

  if (existing && existing.userId !== userId) {
    return NextResponse.json({ error: 'That email is already on another account' }, { status: 409 })
  }

  if (await hasRecentLoginToken(email)) {
    return NextResponse.json(
      { error: 'Please wait a minute before requesting another link' },
      { status: 429 },
    )
  }

  const token = await createLoginToken({ email, intent: 'change', userId })
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const url = new URL('/api/auth/email/callback', base)
  url.searchParams.set('token', token)

  const result = await sendMagicLinkEmail({ email, url: url.toString(), intent: 'change' })
  if (!result.ok) {
    return NextResponse.json(
      { error: 'Could not send confirmation email. Try again shortly.' },
      { status: 503 },
    )
  }

  return NextResponse.json({ ok: true })
})
