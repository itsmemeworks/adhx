import { and, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { userIdentities, users } from '@/lib/db/schema'
import { setting } from '@/lib/settings/value'

/**
 * Who may make an account on this ADHX. A self-hosted ADHX is usually for you
 * and your friends: set `ALLOWED_EMAILS` to a comma-separated list of emails
 * and/or `@domain.example` entries. Unset (or `*`) leaves sign-up open.
 * People who already have an account can always sign in. Admin → System can
 * change it too (the saved list wins).
 */
export function signupAllowlist(): string[] | null {
  const raw = setting('ALLOWED_EMAILS')
  if (!raw || raw === '*') return null
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

export function emailOnAllowlist(email: string, list: string[]): boolean {
  const e = email.toLowerCase()
  return list.some((entry) => (entry.startsWith('@') ? e.endsWith(entry) : e === entry))
}

/** May this email sign in (or sign up) here? */
export function mayUseEmail(email: string): boolean {
  const list = signupAllowlist()
  if (!list || emailOnAllowlist(email, list)) return true
  return hasEmailAccount(email)
}

/**
 * With links handed over by an admin (no email service), only people the
 * owner expects get one: invited emails, existing accounts, and, before
 * anyone is an admin, the owner's own first sign-in.
 */
export function mayGetHeldLink(email: string): boolean {
  const list = signupAllowlist()
  if (list && emailOnAllowlist(email, list)) return true
  if (hasEmailAccount(email)) return true
  return !hasAdmin()
}

export function hasAdmin(): boolean {
  const [admin] = db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, 'admin'))
    .limit(1)
    .all()
  return !!admin
}

/** A brand-new ADHX: nobody has an account yet, so it opens on `/setup`. */
export function isFreshInstall(): boolean {
  return db.select({ id: users.id }).from(users).limit(1).all().length === 0
}

/**
 * With links handed over by an admin, nobody can see the admin page until
 * there is one, so a link opened before then was read from the server log:
 * whoever opens it runs this ADHX. Make them the admin, unless someone beat
 * them to it. True when they became it.
 */
export function claimOwnership(userId: string): boolean {
  const result = db.run(
    sql`UPDATE users SET role = 'admin' WHERE id = ${userId} AND NOT EXISTS (SELECT 1 FROM users WHERE role = 'admin')`,
  )
  return result.changes === 1
}

function hasEmailAccount(email: string): boolean {
  const [existing] = db
    .select({ userId: userIdentities.userId })
    .from(userIdentities)
    .where(
      and(eq(userIdentities.provider, 'email'), eq(userIdentities.providerId, email.toLowerCase())),
    )
    .limit(1)
    .all()
  return !!existing
}
