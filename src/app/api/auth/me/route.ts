import { NextResponse } from 'next/server'
import { getCurrentUserId, renewSessionCookie } from '@/lib/auth/session'
import { getAccount } from '@/lib/auth/account'
import { isAdminUserId } from '@/lib/admin/guard'
import { pendingAdminSignInLinks, signInDelivery } from '@/lib/email/magic-link'
import { memberAvatar } from '@/lib/people/savers'
import { avatarSourceOf, readPreferences } from '@/lib/preferences/server'
import { PRIVATE_DEFAULT_KEY } from '@/lib/bookmarks/privacy'
import { noteOpen, touchLastSeen } from '@/lib/people/last-seen'
import { extra } from '@/lib/settings/extras'

const SIGNED_OUT = {
  authenticated: false,
  user: null,
  identities: { x: null, email: null },
  xConnected: false,
  isAdmin: false,
} as const

// GET /api/auth/me - the account-aware replacement for reading auth state.
// Unlike /api/auth/twitter/status, "authenticated" here means "has a valid
// session + a users row" — it does NOT require a live X connection.
export async function GET() {
  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json(SIGNED_OUT)
  }

  const account = await getAccount(userId)
  if (!account) {
    return NextResponse.json(SIGNED_OUT)
  }

  // Last seen (at most every 5 minutes) and opens, for admins. Counts only.
  touchLastSeen(userId)
  noteOpen(userId, 'web')

  const isAdmin = await isAdminUserId(userId)
  const prefs = readPreferences(userId, ['avatarSource', PRIVATE_DEFAULT_KEY])
  const response = NextResponse.json({
    authenticated: true,
    user: {
      id: account.user.id,
      username: account.user.username,
      displayName: account.user.displayName,
      // The picture to show (null: draw the face made from the username).
      avatarUrl: memberAvatar(account.user.avatarUrl, prefs.avatarSource ?? null),
      avatarSource: avatarSourceOf(account.user.avatarUrl, prefs.avatarSource ?? null),
      usernameChosen: account.user.usernameChosen,
      usernameChangeCount: account.user.usernameChangeCount,
      privateDefault: prefs[PRIVATE_DEFAULT_KEY] === 'true',
    },
    identities: account.identities,
    xConnected: account.xConnected,
    // Whoever runs this ADHX may not have set up an X app.
    xAvailable: !!extra('TWITTER_CLIENT_ID'),
    isAdmin,
    // With no email, sign-in links wait for an admin to pass on: say how many.
    ...(isAdmin && signInDelivery() === 'admin'
      ? { waitingSignIns: pendingAdminSignInLinks().length }
      : {}),
  })
  // Every page asks this, so an active session never runs out.
  await renewSessionCookie(response)
  return response
}
