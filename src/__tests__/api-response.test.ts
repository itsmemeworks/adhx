import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ok, fail, handleRouteError } from '@/lib/api/response'

/**
 * `src/lib/api/response.ts` — shared success/error response helpers used
 * across API routes, plus the standardized `handleRouteError` catch-block
 * handler that logs, reports to Sentry, and returns a JSON error response.
 */

vi.mock('@/lib/sentry', () => ({
  captureException: vi.fn(),
}))

describe('ok', () => {
  it('returns a 200 JSON response by default', async () => {
    const res = ok({ hello: 'world' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ hello: 'world' })
  })

  it('honors a custom status/init', async () => {
    const res = ok({ created: true }, { status: 201 })
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ created: true })
  })
})

describe('fail', () => {
  it('returns the message and status as a JSON error body', async () => {
    const res = fail('Not found', 404)
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Not found' })
  })

  it('merges extra fields alongside error', async () => {
    const res = fail('Rate limited', 429, { cooldownRemaining: 42 })
    expect(res.status).toBe(429)
    expect(await res.json()).toEqual({ error: 'Rate limited', cooldownRemaining: 42 })
  })
})

describe('handleRouteError', () => {
  let captureException: ReturnType<typeof vi.fn>
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(async () => {
    const sentry = await import('@/lib/sentry')
    captureException = sentry.captureException as unknown as ReturnType<typeof vi.fn>
    captureException.mockClear()
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  it('defaults to a 500 "Internal server error" response', async () => {
    const res = handleRouteError(new Error('db exploded'), { endpoint: '/api/test' })
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Internal server error' })
  })

  it('honors a custom message/status', async () => {
    const res = handleRouteError(new Error('oops'), {
      endpoint: '/api/test',
      message: 'Something specific went wrong',
      status: 400,
    })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Something specific went wrong' })
  })

  it('calls captureException with an Error instance and the endpoint/userId context', () => {
    const error = new Error('db exploded')
    handleRouteError(error, { endpoint: '/api/test', userId: 'user-123' })

    expect(captureException).toHaveBeenCalledTimes(1)
    expect(captureException).toHaveBeenCalledWith(error, {
      endpoint: '/api/test',
      userId: 'user-123',
    })
  })

  it('normalizes a non-Error thrown value into an Error before reporting to Sentry', () => {
    handleRouteError('a raw string throw', { endpoint: '/api/test' })

    expect(captureException).toHaveBeenCalledTimes(1)
    const [reported] = captureException.mock.calls[0]
    expect(reported).toBeInstanceOf(Error)
    expect((reported as Error).message).toBe('a raw string throw')
  })

  it('logs to the console tagged with the endpoint', () => {
    handleRouteError(new Error('boom'), { endpoint: '/api/my-route' })

    expect(consoleErrorSpy).toHaveBeenCalledWith('[/api/my-route]', expect.any(Error))
  })
})
