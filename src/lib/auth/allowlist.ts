import { and, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { userIdentities, users } from '@/lib/db/schema'
import { setting } from '@/lib/settings/value'

/**
 * Who may make an account by email on this ADHX. People join by invite link
 * (no email needed), so unset (or `none`) lets nobody new in by email:
 * invite-only. `ALLOWED_EMAILS` opens it to a comma-separated list of emails
 * and/or `@domain.example` entries, or `*` to anyone. People who already have
 * an account can always sign in. Admin → System can change it too (the saved
 * value wins). Servers that were open before this default existed were saved
 * as `*` when they upgraded.
 *
 * Null means anyone; an empty list means invite-only.
 */
export function signupAllowlist(): string[] | null {
  const raw = setting('ALLOWED_EMAILS')
  if (raw === '*') return null
  if (!raw || raw.toLowerCase() === 'none') return []
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
