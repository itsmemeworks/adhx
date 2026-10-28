import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { demoMode } from './mode'

let visitor: { username: string; id: string } | null = null

/**
 * The account every demo visitor is (`DEMO_USER`, default `sam`), or null
 * outside demo mode. The world is reseeded at each start, so the lookup is
 * cached per process.
 */
export function demoVisitorId(): string | null {
  if (!demoMode()) return null
  const username = process.env['DEMO_USER'] || 'sam'
  if (visitor?.username !== username) {
    const row = db.select({ id: users.id }).from(users).where(eq(users.username, username)).get()
    if (!row) return null
    visitor = { username, id: row.id }
  }
  return visitor.id
}
