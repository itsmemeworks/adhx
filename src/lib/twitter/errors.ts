import {
  GENERIC_SYNC_MESSAGE,
  RATE_LIMIT_MESSAGE,
  REAUTH_MESSAGE,
  X_DENIED_MESSAGE,
  type SyncErrorCode,
} from '@/lib/sync/messages'

export type { SyncErrorCode }

export class TwitterCallError extends Error {
  readonly code: SyncErrorCode
  readonly httpStatus?: number

  constructor(message: string, code: SyncErrorCode, httpStatus?: number) {
    super(message)
    this.name = 'TwitterCallError'
    this.code = code
    this.httpStatus = httpStatus
  }
}

/** twitter-api-v2 puts the HTTP status on `code`. */
export function httpStatusOf(err: unknown): number | undefined {
  if (typeof err !== 'object' || err === null) return undefined
  const code = (err as { code?: unknown }).code
  return typeof code === 'number' ? code : undefined
}

function isTokenRefreshError(err: unknown): err is Error & { status: number; fatal: boolean } {
  return (
    err instanceof Error &&
    err.name === 'TokenRefreshError' &&
    typeof (err as { fatal?: unknown }).fatal === 'boolean'
  )
}

/**
 * Statuses where a force-refresh + retry (and then a full reconnect) is the
 * recovery. 401/403 are the documented auth failures. X also returns 402
 * ("Payment Required") on the bookmarks endpoint when the *user* token is
 * rejected — not only when the developer app's plan lapsed — so we treat it
 * the same: refresh once, then ask the user to reconnect.
 */
export function isRefreshableAuthStatus(status: number): boolean {
  return status === 401 || status === 402 || status === 403
}

export function toTwitterCallError(err: unknown): TwitterCallError {
  if (err instanceof TwitterCallError) return err

  if (isTokenRefreshError(err)) {
    return new TwitterCallError(
      err.fatal ? REAUTH_MESSAGE : GENERIC_SYNC_MESSAGE,
      err.fatal ? 'reauth' : 'generic',
      err.status,
    )
  }

  const status = httpStatusOf(err)
  if (status === 402) return new TwitterCallError(X_DENIED_MESSAGE, 'reauth', 402)
  if (status === 401 || status === 403) {
    return new TwitterCallError(REAUTH_MESSAGE, 'reauth', status)
  }
  if (status === 429) return new TwitterCallError(RATE_LIMIT_MESSAGE, 'rate_limit', 429)

  const raw = err instanceof Error ? err.message : String(err)
  // Never leak "Request failed with code NNN" to the UI.
  if (/request failed with code\s*\d+/i.test(raw)) {
    return new TwitterCallError(GENERIC_SYNC_MESSAGE, 'generic', status)
  }
  return new TwitterCallError(raw || GENERIC_SYNC_MESSAGE, 'generic', status)
}

export function isReauthError(error: unknown): boolean {
  if (error instanceof TwitterCallError) return error.code === 'reauth'
  const message = error instanceof Error ? error.message : String(error)
  return /not authenticated|reconnect|connection expired|fresh login/i.test(message)
}
