import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/with-auth'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export async function isAdminUserId(userId: string): Promise<boolean> {
  const [user] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  return user?.role === 'admin'
}

export type AdminActor = { userId: string; username: string }

export type AdminGate = { ok: true; actor: AdminActor } | { ok: false; response: NextResponse }

export async function requireAdmin(userId: string): Promise<AdminGate> {
  const [user] = await db
    .select({ username: users.username, role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  if (!user || user.role !== 'admin') {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { ok: true, actor: { userId, username: user.username } }
}

/**
 * Auth + immutable account-role gate. Use on every `/api/admin/*` route.
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
