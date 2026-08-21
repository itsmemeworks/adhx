import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchWithTimeout } from '@/lib/utils/fetch-timeout'

describe('fetchWithTimeout', () => {
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = vi.fn().mockResolvedValue(new Response('ok'))
    global.fetch = mockFetch as unknown as typeof fetch
  })

  it('sets an AbortSignal on the request', async () => {
    await fetchWithTimeout('https://example.com', 10_000)

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('https://example.com')
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('preserves other init fields (method, headers, body)', async () => {
    await fetchWithTimeout('https://example.com', 5_000, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ a: 1 }),
    })

    const [, init] = mockFetch.mock.calls[0]
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(init.body).toBe(JSON.stringify({ a: 1 }))
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('accepts a URL instance', async () => {
    const url = new URL('https://example.com/path')
    await fetchWithTimeout(url, 1_000)

    const [calledUrl] = mockFetch.mock.calls[0]
    expect(calledUrl).toBe(url)
  })

  it('respects the timeout value passed in (does not abort before it elapses)', async () => {
    await fetchWithTimeout('https://example.com', 30_000)
    const [, init] = mockFetch.mock.calls[0]
    // A 30s timeout should not have fired yet.
    expect(init.signal.aborted).toBe(false)
  })

  it('aborts once the given timeout elapses', async () => {
    await fetchWithTimeout('https://example.com', 20)
    const [, init] = mockFetch.mock.calls[0]
    expect(init.signal.aborted).toBe(false)

    await new Promise((resolve) => setTimeout(resolve, 150))
    expect(init.signal.aborted).toBe(true)
  })

  it('combines an existing init.signal with the timeout signal via AbortSignal.any', async () => {
    const controller = new AbortController()
    await fetchWithTimeout('https://example.com', 10_000, { signal: controller.signal })

    const [, init] = mockFetch.mock.calls[0]
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(init.signal).not.toBe(controller.signal)
    expect(init.signal.aborted).toBe(false)

    controller.abort()
    expect(init.signal.aborted).toBe(true)
  })
})
