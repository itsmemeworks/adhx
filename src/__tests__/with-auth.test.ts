import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/with-auth'

/**
 * `withAuth` (`src/lib/api/with-auth.ts`) is the shared auth gate used by
 * ~29 routes: resolves `getCurrentUserId()`, short-circuits unauthenticated
 * requests with the standard 401 shape, otherwise calls through to the
 * handler with the resolved userId and passes its response straight back.
 */

let mockUserId: string | null = 'user-123'

vi.mock('@/lib/auth/session', () => ({
  getCurrentUserId: vi.fn(() => Promise.resolve(mockUserId)),
}))

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost:3000/api/whatever')
}

describe('withAuth', () => {
  beforeEach(() => {
    mockUserId = 'user-123'
  })

  it('returns 401 with the standard error shape when unauthenticated', async () => {
    mockUserId = null
    const handler = vi.fn()
    const route = withAuth(handler)

    const res = await route(makeRequest())

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
    expect(handler).not.toHaveBeenCalled()
  })

  it('calls the handler with the resolved userId when authenticated', async () => {
    const handler = vi.fn(() => NextResponse.json({ ok: true }))
    const route = withAuth(handler)
    const req = makeRequest()

    await route(req)

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith(req, 'user-123', undefined)
  })

  it('passes the handler response straight through, unmodified', async () => {
    const handler = vi.fn(() => NextResponse.json({ data: [1, 2, 3] }, { status: 201 }))
    const route = withAuth(handler)

    const res = await route(makeRequest())

    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ data: [1, 2, 3] })
  })

  it('preserves dynamic-route ctx (e.g. params) passed to the wrapped handler', async () => {
    const handler = vi.fn(
      async (_req: NextRequest, userId: string, ctx: { params: Promise<{ id: string }> }) => {
        const { id } = await ctx.params
        return NextResponse.json({ userId, id })
      },
    )
    const route = withAuth(handler)
    const ctx = { params: Promise.resolve({ id: 'bookmark-42' }) }

    const res = await route(makeRequest(), ctx)

    expect(await res.json()).toEqual({ userId: 'user-123', id: 'bookmark-42' })
  })

  it('propagates a thrown/rejected error from the handler rather than swallowing it', async () => {
    const handler = vi.fn(() => {
      throw new Error('boom')
    })
    const route = withAuth(handler)

    // withAuth has no try/catch of its own — the promise it returns rejects.
    await expect(route(makeRequest())).rejects.toThrow('boom')
  })
})
