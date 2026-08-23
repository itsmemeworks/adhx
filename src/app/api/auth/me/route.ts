import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getAccount } from '@/lib/auth/account'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { isAdminUsername } from '@/lib/admin/guard'
import { isUserBanned } from '@/lib/admin/moderation'

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
  const session = await getSession()
  if (!session?.userId) {
    return NextResponse.json(SIGNED_OUT)
  }

  if (isUserBanned(session.userId)) {
    return NextResponse.json(SIGNED_OUT)
  }

  let account = await getAccount(session.userId)

  if (!account) {
    // Pre-migration session (no `users` row yet, e.g. created before this
    // feature shipped) — create one lazily from the session so old sessions
    // keep working without forcing a re-auth.
    await db
      .insert(users)
      .values({ id: session.userId, username: session.username || session.userId })
      .onConflictDoNothing()
    account = await getAccount(session.userId)
  }

  if (!account) {
    // Should be unreachable given the lazy-create above; degrade gracefully.
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
    isAdmin: isAdminUsername(account.user.username),
  })
}
