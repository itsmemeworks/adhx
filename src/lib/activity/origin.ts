import type { NextRequest } from 'next/server'
import { appUrl } from '@/lib/routes/app-url'

/**
 * Same-origin gate for unauthenticated pulse writes.
 *
 * Display text is already server-sourced; this stops other sites from
 * driving `/api/activity/share` and `/api/activity/preview` in a visitor's
 * browser. Missing Origin is allowed (curl, tests, older clients) — the
 * dedicated activity rate limit is the backstop for those.
 */
export function isAllowedActivityOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return true

  const allowed = new Set<string>()
  allowed.add(appUrl())
  try {
    allowed.add(new URL(request.url).origin)
  } catch {
    // Ignore unparseable request URLs.
  }
  return allowed.has(origin)
}
