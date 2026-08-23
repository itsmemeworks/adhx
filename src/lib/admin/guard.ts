import { NextRequest, NextResponse } from 'next/server'
import { getUsernameForUserId } from '@/lib/users/lookup'
import { withAuth } from '@/lib/api/with-auth'

/**
 * `ADMIN_USERNAMES` is a comma-separated list of ADHX usernames. Unset or
 * empty means nobody is a moderator — every admin route 403s. Matching is
 * case-insensitive.
 */
export function parseAdminUsernames(raw = process.env.ADMIN_USERNAMES): string[] {
  return (raw ?? '')
    .split(',')
    .map((u) => u.trim().toLowerCase())
    .filter(Boolean)
}

export function isAdminUsername(username: string | null | undefined): boolean {
  if (!username) return false
  const allowed = parseAdminUsernames()
  if (allowed.length === 0) return false
  return allowed.includes(username.toLowerCase())
}

export async function isAdminUserId(userId: string): Promise<boolean> {
  const username = await getUsernameForUserId(userId)
  return isAdminUsername(username)
}

export type AdminActor = { userId: string; username: string }

export type AdminGate = { ok: true; actor: AdminActor } | { ok: false; response: NextResponse }

export async function requireAdmin(userId: string): Promise<AdminGate> {
  const allowed = parseAdminUsernames()
  if (allowed.length === 0) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  const username = await getUsernameForUserId(userId)
  if (!username || !allowed.includes(username.toLowerCase())) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { ok: true, actor: { userId, username } }
}

/**
 * Auth + admin username gate. Use on every `/api/admin/*` route so an unset
 * `ADMIN_USERNAMES` stays a safe default (403 for everyone).
 */
export function withAdmin<C = unknown>(
  handler: (req: NextRequest, actor: AdminActor, ctx: C) => Promise<Response> | Response,
): (req?: NextRequest, ctx?: C) => Promise<Response> {
  return withAuth(async (req, userId, ctx) => {
    const gate = await requireAdmin(userId)
    if (!gate.ok) return gate.response
    return handler(req, gate.actor, ctx)
  })
}
