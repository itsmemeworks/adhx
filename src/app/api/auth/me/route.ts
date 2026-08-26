import { NextResponse } from 'next/server'
import { getCurrentUserId } from '@/lib/auth/session'
import { getAccount } from '@/lib/auth/account'
import { isAdminUserId } from '@/lib/admin/guard'

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

  return NextResponse.json({
    authenticated: true,
    user: {
      id: account.user.id,
      username: account.user.username,
      displayName: account.user.displayName,
      avatarUrl: account.user.avatarUrl,
      usernameChosen: account.user.usernameChosen,
      usernameChangeCount: account.user.usernameChangeCount,
    },
    identities: account.identities,
    xConnected: account.xConnected,
    isAdmin: await isAdminUserId(userId),
  })
}
