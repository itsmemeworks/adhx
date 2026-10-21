import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { serverSettings } from '@/lib/db/schema'

/**
 * Server-wide settings an admin changes at runtime (`server_settings`).
 * Environment variables only give the first default: once a setting has been
 * saved here, the stored value wins.
 */

export function readServerSetting(key: string): string | null {
  const row = db
    .select({ value: serverSettings.value })
    .from(serverSettings)
    .where(eq(serverSettings.key, key))
    .get()
  return row?.value ?? null
}

export function writeServerSetting(key: string, value: string): void {
  const updatedAt = new Date().toISOString()
  db.insert(serverSettings)
    .values({ key, value, updatedAt })
    .onConflictDoUpdate({ target: serverSettings.key, set: { value, updatedAt } })
    .run()
}
