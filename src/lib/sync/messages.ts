/**
 * User-facing sync error copy. Isomorphic — the server classifies Twitter
 * failures into these codes, and the client renders them without ever showing
 * a raw HTTP status ("Request failed with code 402") to a human.
 */

export type SyncErrorCode = 'reauth' | 'rate_limit' | 'generic'

export const REAUTH_MESSAGE = 'Your X connection expired. Reconnect to keep syncing bookmarks.'

/** X 402 on bookmarks — often a stale/rejected user token; reconnect is the fix. */
export const X_DENIED_MESSAGE =
  "X needs a fresh login before we can pull your bookmarks. This often happens if you haven't connected in a while."

export const RATE_LIMIT_MESSAGE = 'X is asking us to slow down. Wait a few minutes and try again.'

export const GENERIC_SYNC_MESSAGE =
  'Something went wrong pulling bookmarks from X. Try again in a moment.'

export function parseSyncErrorEvent(e: Event): { message: string; code: SyncErrorCode } {
  if (e instanceof MessageEvent && typeof e.data === 'string' && e.data.length > 0) {
    try {
      const data = JSON.parse(e.data) as { message?: unknown; code?: unknown }
      const code: SyncErrorCode =
        data.code === 'reauth' || data.code === 'rate_limit' ? data.code : 'generic'
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
