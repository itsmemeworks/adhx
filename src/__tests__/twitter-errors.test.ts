import { describe, it, expect } from 'vitest'
import {
  GENERIC_SYNC_MESSAGE,
  RATE_LIMIT_MESSAGE,
  REAUTH_MESSAGE,
  X_DENIED_MESSAGE,
} from '@/lib/sync/messages'
import {
  httpStatusOf,
  isReauthError,
  isRefreshableAuthStatus,
  toTwitterCallError,
  TwitterCallError,
} from '@/lib/twitter/errors'

function tokenRefreshError(message: string, status: number, fatal: boolean) {
  return Object.assign(new Error(message), {
    name: 'TokenRefreshError',
    status,
    fatal,
  })
}

describe('twitter error classification', () => {
  it('treats 401, 402, and 403 as refreshable auth failures', () => {
    expect(isRefreshableAuthStatus(401)).toBe(true)
    expect(isRefreshableAuthStatus(402)).toBe(true)
    expect(isRefreshableAuthStatus(403)).toBe(true)
    expect(isRefreshableAuthStatus(429)).toBe(false)
    expect(isRefreshableAuthStatus(500)).toBe(false)
  })

  it('reads twitter-api-v2 HTTP status from `code`', () => {
    expect(httpStatusOf({ code: 402, message: 'Request failed with code 402' })).toBe(402)
    expect(httpStatusOf(new Error('nope'))).toBeUndefined()
  })

  it('maps 402 to a reconnect prompt, never the raw status code', () => {
    const err = toTwitterCallError(
      Object.assign(new Error('Request failed with code 402'), { code: 402 }),
    )
    expect(err).toBeInstanceOf(TwitterCallError)
    expect(err.code).toBe('reauth')
    expect(err.message).toBe(X_DENIED_MESSAGE)
    expect(err.message).not.toMatch(/402/)
    expect(isReauthError(err)).toBe(true)
  })

  it('maps 401/403 to the expired-connection copy', () => {
    const err = toTwitterCallError(
      Object.assign(new Error('Request failed with code 401'), { code: 401 }),
    )
    expect(err.code).toBe('reauth')
    expect(err.message).toBe(REAUTH_MESSAGE)
  })

  it('maps 429 to rate-limit copy', () => {
    const err = toTwitterCallError(
      Object.assign(new Error('Request failed with code 429'), { code: 429 }),
    )
    expect(err.code).toBe('rate_limit')
    expect(err.message).toBe(RATE_LIMIT_MESSAGE)
  })

  it('maps fatal token refresh to reauth and transient refresh to generic', () => {
    const fatal = toTwitterCallError(tokenRefreshError('Token refresh failed: invalid', 400, true))
    expect(fatal.code).toBe('reauth')
    expect(fatal.message).toBe(REAUTH_MESSAGE)

    const transient = toTwitterCallError(tokenRefreshError('Token refresh failed: 503', 503, false))
    expect(transient.code).toBe('generic')
    expect(transient.message).toBe(GENERIC_SYNC_MESSAGE)
  })

  it('strips raw "Request failed with code N" from unknown statuses', () => {
    const err = toTwitterCallError(
      Object.assign(new Error('Request failed with code 418'), { code: 418 }),
    )
    expect(err.code).toBe('generic')
    expect(err.message).toBe(GENERIC_SYNC_MESSAGE)
  })
})
