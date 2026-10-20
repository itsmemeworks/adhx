import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'

/**
 * Admins' "Pause new work" (Processing): while on, nothing new is claimed —
 * no downloads start, the Mac helper is handed no conversion or
 * understanding job, and the local understanding worker takes no job. Work
 * already running finishes. Stored in `server_settings`, so it survives a
 * restart and every process (the web server, the understanding child) sees it.
 */
export const PAUSE_KEY = 'processing.paused'

export function newWorkPaused(): boolean {
  try {
    const row = db.all<{ value: string }>(
      sql`SELECT value FROM server_settings WHERE key = ${PAUSE_KEY}`,
    )[0]
    return row?.value === '1'
  } catch {
    return false
  }
}

export function setNewWorkPaused(paused: boolean): void {
  db.run(sql`
    INSERT INTO server_settings (key, value, updated_at)
    VALUES (${PAUSE_KEY}, ${paused ? '1' : '0'}, ${new Date().toISOString()})
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
}
