import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { userIdentities } from '@/lib/db/schema'

/**
 * Who may make an account on this ADHX. A self-hosted ADHX is usually for you
 * and your friends: set `ALLOWED_EMAILS` to a comma-separated list of emails
 * and/or `@domain.example` entries. Unset (or `*`) leaves sign-up open.
 * People who already have an account can always sign in.
 */
export function signupAllowlist(): string[] | null {
  const raw = process.env['ALLOWED_EMAILS']?.trim()
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
