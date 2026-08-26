import { beforeEach, describe, expect, it, vi } from 'vitest'

const sentryBoundary = vi.hoisted(() => ({
  captureException: vi.fn(),
  initSentry: vi.fn(),
  moduleLoads: 0,
}))

vi.mock('@/lib/sentry', () => {
  sentryBoundary.moduleLoads += 1
  return {
    captureException: sentryBoundary.captureException,
    initSentry: sentryBoundary.initSentry,
  }
})

const requestContext = {
  routerKind: 'App Router' as const,
  routePath: '/api/accounts/[id]',
  routeType: 'route' as const,
  revalidateReason: undefined,
}

beforeEach(() => {
  vi.resetModules()
  vi.unstubAllEnvs()
  vi.clearAllMocks()
  sentryBoundary.moduleLoads = 0
})

describe('Next.js server instrumentation', () => {
  it('does not load the Node Sentry module in the Edge runtime', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'edge')
    const instrumentation = await import('@/instrumentation')

    await instrumentation.register()
    await instrumentation.onRequestError(
      new Error('edge failure'),
      {
        path: '/api/accounts/private-user?token=private-query',
        method: 'GET',
        headers: { authorization: 'Bearer private-header' },
      },
      requestContext,
    )

    expect(sentryBoundary.moduleLoads).toBe(0)
    expect(sentryBoundary.initSentry).not.toHaveBeenCalled()
    expect(sentryBoundary.captureException).not.toHaveBeenCalled()
  })

  it('eagerly initializes Sentry when a Node server registers', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs')
    const { register } = await import('@/instrumentation')

    await register()

    expect(sentryBoundary.moduleLoads).toBe(1)
    expect(sentryBoundary.initSentry).toHaveBeenCalledOnce()
  })

  it('captures only bounded route metadata without raw request data', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs')
    const { onRequestError } = await import('@/instrumentation')
    const error = Object.assign(new Error('render failed'), { digest: '781204998' })

    await onRequestError(
      error,
      {
        path: '/api/accounts/private-user?token=private-query-value',
        method: 'post',
        headers: {
          authorization: 'Bearer private-header-value',
          cookie: 'adhx_session=private-cookie-value',
          'x-forwarded-for': '203.0.113.50',
        },
      },
      requestContext,
    )

    expect(sentryBoundary.captureException).toHaveBeenCalledOnce()
    expect(sentryBoundary.captureException).toHaveBeenCalledWith(error, {
      requestPath: '/api/accounts/[id]',
      requestMethod: 'POST',
      routePath: '/api/accounts/[id]',
      routeType: 'route',
      digest: '781204998',
    })

    const serializedCapture = JSON.stringify(sentryBoundary.captureException.mock.calls[0])
    expect(serializedCapture).not.toMatch(
      /private-user|private-query-value|private-header-value|private-cookie-value|203\.0\.113\.50/,
    )
  })

  it('bounds route paths and rejects token-shaped digests', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs')
    const { onRequestError } = await import('@/instrumentation')
    const error = Object.assign(new Error('render failed'), {
      digest: 'sk_live_private_digest_1234567890',
    })
    const longRoutePath = `/${'a'.repeat(300)}?private-route-query`

    await onRequestError(
      error,
      {
        path: '/private/request?query=private-request-query',
        method: 'invalid method',
        headers: {},
      },
      { ...requestContext, routePath: longRoutePath },
    )

    expect(sentryBoundary.captureException).toHaveBeenCalledWith(error, {
      requestPath: `/${'a'.repeat(255)}`,
      requestMethod: 'UNKNOWN',
      routePath: `/${'a'.repeat(255)}`,
      routeType: 'route',
    })
    expect(JSON.stringify(sentryBoundary.captureException.mock.calls[0][1])).not.toMatch(
      /sk_live_private_digest_1234567890|private-route-query|private-request-query/,
    )
  })

  it('rejects overlong numeric digests instead of truncating them', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs')
    const { onRequestError } = await import('@/instrumentation')
    const error = Object.assign(new Error('render failed'), {
      digest: '12345678901',
    })

    await onRequestError(
      error,
      {
        path: '/api/accounts/private-user?token=private-query',
        method: 'GET',
        headers: {},
      },
      requestContext,
    )

    expect(sentryBoundary.captureException).toHaveBeenCalledWith(error, {
      requestPath: '/api/accounts/[id]',
      requestMethod: 'GET',
      routePath: '/api/accounts/[id]',
      routeType: 'route',
    })
  })
})
