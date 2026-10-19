import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { getCurrentUserId, setSessionCookie } from '@/lib/auth/session'
import { readInvite, redeemInvite } from '@/lib/auth/invites'
import {
  INVITE_NAME_ERRORS,
  inviteErrorPage,
  inviteJoinPage,
  inviteProblemPage,
} from '@/lib/auth/invite-page'
import { isSameOriginPost, readSmallForm } from '@/lib/auth/form-post'
import { sanitizeUsername } from '@/lib/auth/username-rules'
import { recordAnalytic } from '@/lib/analytics/record'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ token: string }> }

async function signedInUsername(): Promise<string | null> {
  const userId = await getCurrentUserId().catch(() => null)
  if (!userId) return null
  const user = db.select({ username: users.username }).from(users).where(eq(users.id, userId)).get()
  return user?.username ?? null
}

/**
 * GET (and HEAD) /invite/<token>: who invited you, a name field and Join.
 * Script-free and read-only, so message previews can't spend the invite.
 */
export async function GET(_request: NextRequest, { params }: Context) {
  const { token } = await params
  const invite = readInvite(token)
  if (!invite.ok) return inviteProblemPage(invite.problem)
  return inviteJoinPage({
    token,
    inviter: invite.inviter,
    name: sanitizeUsername(invite.nameHint ?? ''),
    signedInAs: await signedInUsername(),
  })
}

/**
 * POST /invite/<token> (the Join form, same origin only): spend the invite on
 * a new account with the chosen name, sign this browser in and go on to
 * /invite/done (or /invite/waiting, when an admin has to let them in
 * first). A bad or taken name shows the form again, invite unspent.
 */
export async function POST(request: NextRequest, { params }: Context) {
  const { token } = await params
  if (!isSameOriginPost(request)) {
    return inviteErrorPage('Open your invite link in this browser, then press Join.', 403)
  }
  let form: URLSearchParams | null
  try {
    form = await readSmallForm(request)
  } catch {
    form = null
  }
  if (!form) return inviteErrorPage('Open your invite link again, then press Join.', 400)

  const result = redeemInvite(token, form.get('username') ?? '')
  if (!result.ok) {
    if ('problem' in result) return inviteProblemPage(result.problem)
    const invite = readInvite(token)
    if (!invite.ok) return inviteProblemPage(invite.problem)
    return inviteJoinPage({
      token,
      inviter: invite.inviter,
      name: result.username,
      error:
        result.nameError === 'taken'
          ? INVITE_NAME_ERRORS.taken(result.username)
          : INVITE_NAME_ERRORS.invalid,
      signedInAs: await signedInUsername(),
      status: result.nameError === 'taken' ? 409 : 400,
    })
  }

  recordAnalytic({ name: 'auth.complete', userId: result.userId, source: 'invite' })
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  // Joined from a member's invite with approvals on: wait for an admin.
  const next = result.approval === 'pending' ? '/invite/waiting' : '/invite/done'
  const response = NextResponse.redirect(new URL(next, base), 303)
  response.headers.set('Cache-Control', 'no-store')
  response.headers.set('Referrer-Policy', 'no-referrer')
  await setSessionCookie(response, { userId: result.userId, username: result.username })
  return response
}
