/**
 * User-facing sync error copy. Isomorphic — the server classifies Twitter
 * failures into these codes, and the client renders them without ever showing
 * a raw HTTP status ("Request failed with code 402") to a human.
 */

export type SyncErrorCode = 'reauth' | 'rate_limit' | 'unavailable' | 'generic'

export const REAUTH_MESSAGE = 'Your X connection expired. Reconnect to keep syncing bookmarks.'

/**
 * X 402 Payment Required on bookmarks. This is the *developer app* being out
 * of API credits (pay-per-use), not the user's login. Reconnecting loops.
 */
export const X_UNAVAILABLE_MESSAGE =
  "X isn't letting us pull bookmarks right now. Your login is fine — try again later."

export const RATE_LIMIT_MESSAGE = 'X is asking us to slow down. Wait a few minutes and try again.'

export const GENERIC_SYNC_MESSAGE =
  'Something went wrong pulling bookmarks from X. Try again in a moment.'

const KNOWN_CODES: readonly SyncErrorCode[] = ['reauth', 'rate_limit', 'unavailable']

export function parseSyncErrorEvent(e: Event): { message: string; code: SyncErrorCode } {
  if (e instanceof MessageEvent && typeof e.data === 'string' && e.data.length > 0) {
    try {
      const data = JSON.parse(e.data) as { message?: unknown; code?: unknown }
      const code: SyncErrorCode = KNOWN_CODES.includes(data.code as SyncErrorCode)
        ? (data.code as SyncErrorCode)
        : 'generic'
      const message =
        typeof data.message === 'string' && data.message.trim().length > 0
          ? data.message
          : GENERIC_SYNC_MESSAGE
      return { message, code }
    } catch {
      return { message: GENERIC_SYNC_MESSAGE, code: 'generic' }
    }
  }
  return { message: 'Connection lost. Check your network and try again.', code: 'generic' }
}
