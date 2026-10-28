import { readServerSetting, writeServerSetting } from '@/lib/settings/server'
import { cleanOrigin as clean, configuredAppUrl } from './configured-url'

export { configuredAppUrl }

/**
 * This ADHX's own address, e.g. `https://adhx.example.com`, with no trailing
 * slash. Sign-in links, invites and the same-origin checks are built on it.
 *
 * 1. `NEXT_PUBLIC_APP_URL` (or `APP_URL`), when set.
 * 2. The address the host gives the app: Render, Railway, Fly or Coolify.
 * 3. The address the owner first set ADHX up from (`/setup`), so a home
 *    server reached by IP or a name nobody typed into a config still works.
 * 4. `http://localhost:3000`.
 *
 * Environment variables are read with brackets so a prebuilt image never has
 * them compiled in.
 */

const STORED_KEY = 'app_url'

function storedAppUrl(): string | null {
  try {
    return clean(readServerSetting(STORED_KEY))
  } catch {
    return null // No database yet (a build, or before the first migration).
  }
}

export function appUrl(): string {
  return configuredAppUrl() ?? storedAppUrl() ?? 'http://localhost:3000'
}

/** Remember the owner's address when nothing else names one. True if kept. */
export function rememberAppUrl(origin: string): boolean {
  const url = clean(origin)
  if (!url || configuredAppUrl()) return false
  writeServerSetting(STORED_KEY, url)
  return true
}
