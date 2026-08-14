import {
  GENERIC_SYNC_MESSAGE,
  RATE_LIMIT_MESSAGE,
  REAUTH_MESSAGE,
  X_UNAVAILABLE_MESSAGE,
  type SyncErrorCode,
} from '@/lib/sync/messages'

export type { SyncErrorCode }

export class TwitterCallError extends Error {
  readonly code: SyncErrorCode
  readonly httpStatus?: number
  readonly twitterBody?: unknown

  constructor(message: string, code: SyncErrorCode, httpStatus?: number, twitterBody?: unknown) {
    super(message)
    this.name = 'TwitterCallError'
    this.code = code
    this.httpStatus = httpStatus
    this.twitterBody = twitterBody
  }
}

/** twitter-api-v2 puts the HTTP status on `code`. */
export function httpStatusOf(err: unknown): number | undefined {
  if (typeof err !== 'object' || err === null) return undefined
  const code = (err as { code?: unknown }).code
  return typeof code === 'number' ? code : undefined
}

/** Response body from twitter-api-v2's ApiResponseError, when present. */
export function twitterErrorBody(err: unknown): unknown {
  if (typeof err !== 'object' || err === null || !('data' in err)) return undefined
  return (err as { data: unknown }).data
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
 * recovery. 401/403 are the documented auth failures. 402 is *not* — X uses
 * it for "developer account has no credits", and reconnecting the user loops.
 */
export function isRefreshableAuthStatus(status: number): boolean {
  return status === 401 || status === 403
}

export function toTwitterCallError(err: unknown): TwitterCallError {
  if (err instanceof TwitterCallError) return err

  const body = twitterErrorBody(err)

  if (isTokenRefreshError(err)) {
    return new TwitterCallError(
      err.fatal ? REAUTH_MESSAGE : GENERIC_SYNC_MESSAGE,
      err.fatal ? 'reauth' : 'generic',
      err.status,
      body,
    )
  }

  const status = httpStatusOf(err)
  if (status === 402) {
    return new TwitterCallError(X_UNAVAILABLE_MESSAGE, 'unavailable', 402, body)
  }
  if (status === 401 || status === 403) {
    return new TwitterCallError(REAUTH_MESSAGE, 'reauth', status, body)
  }
  if (status === 429) return new TwitterCallError(RATE_LIMIT_MESSAGE, 'rate_limit', 429, body)

  const raw = err instanceof Error ? err.message : String(err)
  // Never leak "Request failed with code NNN" to the UI.
  if (/request failed with code\s*\d+/i.test(raw)) {
    return new TwitterCallError(GENERIC_SYNC_MESSAGE, 'generic', status, body)
  }
  return new TwitterCallError(raw || GENERIC_SYNC_MESSAGE, 'generic', status, body)
}

export function isReauthError(error: unknown): boolean {
  if (error instanceof TwitterCallError) return error.code === 'reauth'
  const message = error instanceof Error ? error.message : String(error)
  return /not authenticated|reconnect|connection expired/i.test(message)
}
