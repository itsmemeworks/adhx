import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const sentrySdk = vi.hoisted(() => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  init: vi.fn(),
  metricCount: vi.fn(),
  setExtra: vi.fn(),
}))

vi.mock('@sentry/node', () => ({
  captureException: sentrySdk.captureException,
  captureMessage: sentrySdk.captureMessage,
  init: sentrySdk.init,
  metrics: {
    count: sentrySdk.metricCount,
    distribution: vi.fn(),
    gauge: vi.fn(),
  },
  onUnhandledRejectionIntegration: vi.fn(() => ({ name: 'unhandled-rejection' })),
  withScope: vi.fn((callback: (scope: { setExtra: typeof sentrySdk.setExtra }) => void) =>
    callback({ setExtra: sentrySdk.setExtra }),
  ),
}))

type SentryModule = typeof import('@/lib/sentry')

let sentry: SentryModule

function capturedExtras(): Record<string, unknown> {
  return Object.fromEntries(sentrySdk.setExtra.mock.calls)
}

interface CapturedSentryOptions {
  beforeSend: (event: Record<string, unknown>) => Record<string, unknown>
  beforeBreadcrumb: (breadcrumb: Record<string, unknown>) => Record<string, unknown>
  beforeSendTransaction: (event: Record<string, unknown>) => Record<string, unknown>
  beforeSendSpan: (span: Record<string, unknown>) => Record<string, unknown>
}

beforeAll(async () => {
  vi.stubEnv('SENTRY_DSN', 'https://public@example.invalid/1')
  sentry = await import('@/lib/sentry')
})

afterAll(() => {
  vi.unstubAllEnvs()
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Sentry capture privacy boundary', () => {
  it('sanitizes automatic SDK events, breadcrumbs, transactions, and spans', () => {
    sentry.initSentry()

    expect(sentrySdk.init).toHaveBeenCalledOnce()
    const options = sentrySdk.init.mock.calls[0][0] as CapturedSentryOptions
    expect(options.beforeSend).toBeTypeOf('function')
    expect(options.beforeBreadcrumb).toBeTypeOf('function')
    expect(options.beforeSendTransaction).toBeTypeOf('function')
    expect(options.beforeSendSpan).toBeTypeOf('function')

    const rawUserId = 'u_automatic_private'
    const rawEmail = 'automatic@example.com'
    const rawAccessToken = 'automatic-access-token'
    const rawAuthHeader = 'Bearer automatic-auth-secret'
    const rawCookie = 'adhx_session=automatic-cookie'
    const rawOauthState = 'automatic-oauth-state'
    const rawIp = '203.0.113.42'
    const automaticEvent = {
      event_id: 'safe-event-correlation',
      message: `Request failed for ${rawEmail} user_id=${rawUserId}`,
      logentry: {
        message: `Sync failed for ${rawEmail}`,
        formatted: `Authorization: ${rawAuthHeader}`,
        params: [`{"access_token":"${rawAccessToken}","user_id":"${rawUserId}"}`],
      },
      exception: {
        values: [
          {
            type: 'UpstreamError',
            value: `Body {"access_token":"${rawAccessToken}","user_id":"${rawUserId}"}`,
            stacktrace: {
              frames: [
                {
                  filename: `https://adhx.com/api/sync/${rawUserId}?token=stack-query-secret`,
                  function: 'syncBookmarks',
                  context_line: `throw new Error("email=${rawEmail}")`,
                },
              ],
            },
          },
        ],
      },
      request: {
        method: 'POST',
        url: `https://adhx.com/api/sync/${rawUserId}?state=${rawOauthState}`,
        query_string: `state=${rawOauthState}`,
        headers: {
          authorization: rawAuthHeader,
          cookie: rawCookie,
          'x-api-key': 'automatic-api-key-secret',
          'set-cookie': 'refresh_token=set-cookie-secret',
          'user-agent': 'privacy-test-agent',
          'x-forwarded-for': rawIp,
        },
        env: { REMOTE_ADDR: rawIp },
        cookies: rawCookie,
        data: JSON.stringify({
          access_token: rawAccessToken,
          state: rawOauthState,
          user_id: rawUserId,
          nested: { email: rawEmail, route: '/api/sync?token=body-query-secret' },
        }),
      },
      user: {
        id: rawUserId,
        email: rawEmail,
        username: 'private-handle',
        ip_address: rawIp,
        plan: 'free',
      },
      tags: {
        route: '/api/sync',
        userId: rawUserId,
        platform: 'twitter',
      },
      contexts: {
        trace: {
          trace_id: 'safe-trace-correlation',
          span_id: 'safe-span-correlation',
          data: { authorization: rawAuthHeader, user_id: rawUserId },
        },
      },
      extra: {
        twitterBody: `upstream={"access_token":"${rawAccessToken}","user_id":"${rawUserId}","email":"${rawEmail}"}`,
      },
      breadcrumbs: [
        {
          category: 'fetch',
          message: `POST /api/sync?state=${rawOauthState}`,
          data: {
            url: `https://adhx.com/api/sync?state=${rawOauthState}`,
            headers: { authorization: rawAuthHeader },
            user_id: rawUserId,
          },
        },
      ],
    }
    const originalEvent = structuredClone(automaticEvent)

    const safeEvent = options.beforeSend(automaticEvent)
    const serialized = JSON.stringify(safeEvent)

    expect(automaticEvent).toEqual(originalEvent)
    expect(safeEvent).toMatchObject({
      event_id: 'safe-event-correlation',
      request: {
        method: 'POST',
        url: 'https://adhx.com/api/sync/[redacted]',
        headers: { 'user-agent': 'privacy-test-agent' },
      },
      user: {
        id: expect.stringMatching(/^sentry:[a-f0-9]{24}$/),
        email: expect.stringMatching(/^sentry:[a-f0-9]{24}$/),
        username: expect.stringMatching(/^sentry:[a-f0-9]{24}$/),
        ip_address: expect.stringMatching(/^sentry:[a-f0-9]{24}$/),
        plan: 'free',
      },
      tags: {
        route: '/api/sync',
        userId: expect.stringMatching(/^sentry:[a-f0-9]{24}$/),
        platform: 'twitter',
      },
      contexts: {
        trace: {
          trace_id: 'safe-trace-correlation',
          span_id: 'safe-span-correlation',
        },
      },
    })
    expect(safeEvent.request).not.toHaveProperty('query_string')
    expect(safeEvent.request).not.toHaveProperty('cookies')
    expect(safeEvent.exception).toMatchObject({
      values: [
        {
          stacktrace: {
            frames: [
              {
                filename: 'https://adhx.com/api/sync/[redacted]',
                function: 'syncBookmarks',
              },
            ],
          },
        },
      ],
    })
    for (const rawValue of [
      rawUserId,
      rawEmail,
      rawAccessToken,
      rawAuthHeader,
      rawCookie,
      rawOauthState,
      rawIp,
      'private-handle',
      'stack-query-secret',
      'body-query-secret',
      'set-cookie-secret',
      'automatic-api-key-secret',
    ]) {
      expect(serialized).not.toContain(rawValue)
    }
    expect(serialized).toContain('/api/sync')
    expect(options.beforeSend(safeEvent)).toEqual(safeEvent)

    const automaticBreadcrumb = {
      category: 'http',
      message: `POST https://adhx.com/oauth/callback?state=${rawOauthState}`,
      data: {
        request: {
          url: `https://adhx.com/oauth/callback?state=${rawOauthState}`,
          query: { state: rawOauthState },
          headers: { authorization: rawAuthHeader, accept: 'application/json' },
        },
        user_id: rawUserId,
      },
    }
    const safeBreadcrumb = options.beforeBreadcrumb(automaticBreadcrumb)
    expect(automaticBreadcrumb.data.request.headers.authorization).toBe(rawAuthHeader)
    expect(safeBreadcrumb).toMatchObject({
      category: 'http',
      message: 'POST https://adhx.com/oauth/callback',
      data: {
        request: {
          url: 'https://adhx.com/oauth/callback',
          headers: { accept: 'application/json' },
        },
        user_id: expect.stringMatching(/^sentry:[a-f0-9]{24}$/),
      },
    })
    expect(JSON.stringify(safeBreadcrumb)).not.toMatch(
      /automatic-private|automatic-auth-secret|automatic-oauth-state/,
    )

    const safeTransaction = options.beforeSendTransaction({
      type: 'transaction',
      transaction: `POST /api/sync/${rawUserId}?state=${rawOauthState}`,
      request: {
        url: `https://adhx.com/api/sync/${rawUserId}?state=${rawOauthState}`,
      },
      user: { id: rawUserId },
    })
    expect(safeTransaction).toMatchObject({
      type: 'transaction',
      transaction: 'POST /api/sync/[redacted]',
      request: { url: 'https://adhx.com/api/sync/[redacted]' },
    })

    const safeSpan = options.beforeSendSpan({
      name: `POST /api/sync?state=${rawOauthState}`,
      trace_id: 'safe-trace-correlation',
      attributes: {
        'http.request.header.authorization': rawAuthHeader,
        'http.request.header.cookie': rawCookie,
        'url.full': `https://adhx.com/api/sync?state=${rawOauthState}`,
        'user.id': rawUserId,
      },
    })
    expect(safeSpan).toMatchObject({
      name: 'POST /api/sync',
      trace_id: 'safe-trace-correlation',
      attributes: {
        'url.full': 'https://adhx.com/api/sync',
        'user.id': expect.stringMatching(/^sentry:[a-f0-9]{24}$/),
      },
    })
    expect(JSON.stringify(safeSpan)).not.toMatch(
      /automatic-private|automatic-auth-secret|automatic-cookie|automatic-oauth-state/,
    )
  })

  it('sanitizes valid JSON bodies and quoted-key fragments without losing safe context', () => {
    const rawJsonToken = 'json-token-secret'
    const rawJsonUserId = 'u_json_private'
    const rawJsonEmail = 'json-private@example.com'
    const rawFragmentToken = 'fragment-token-secret'
    const rawFragmentUserId = 'u_fragment_private'

    sentry.captureMessage('X bookmarks returned 402 (no API credits)', 'warning', {
      endpoint: '/api/sync',
      twitterStatus: 402,
      twitterBody: JSON.stringify({
        access_token: rawJsonToken,
        user_id: rawJsonUserId,
        nested: {
          email: rawJsonEmail,
          detail: `retry /2/users/${rawJsonUserId}?token=nested-query-secret`,
        },
        title: 'Credits exhausted',
      }),
      fragment: `upstream body: {"access_token":"${rawFragmentToken}","user_id":"${rawFragmentUserId}","email":"fragment@example.com"} route=/api/sync
Authorization: Bearer fragment-auth-secret
Cookie: adhx_session=fragment-cookie-secret`,
    })

    const extras = capturedExtras()
    const parsedBody = JSON.parse(extras.twitterBody as string) as Record<string, unknown>
    const serialized = JSON.stringify(extras)

    expect(extras).toMatchObject({
      endpoint: '/api/sync',
      twitterStatus: 402,
    })
    expect(parsedBody).toMatchObject({
      user_id: expect.stringMatching(/^sentry:[a-f0-9]{24}$/),
      nested: {
        email: expect.stringMatching(/^sentry:[a-f0-9]{24}$/),
        detail: 'retry /2/users/[redacted]',
      },
      title: 'Credits exhausted',
    })
    expect(parsedBody).not.toHaveProperty('access_token')
    expect(extras.fragment).toContain('"access_token":"[redacted]"')
    expect(extras.fragment).toMatch(/"user_id":"sentry:[a-f0-9]{24}"/)
    expect(extras.fragment).toContain('route=/api/sync')
    for (const rawValue of [
      rawJsonToken,
      rawJsonUserId,
      rawJsonEmail,
      rawFragmentToken,
      rawFragmentUserId,
      'fragment@example.com',
      'fragment-auth-secret',
      'fragment-cookie-secret',
      'nested-query-secret',
    ]) {
      expect(serialized).not.toContain(rawValue)
    }
  })

  it('hashes user identities at every nesting level while retaining safe diagnostics', () => {
    const rawUserId = 'u_private_4f78ca'
    const rawXId = '18446744073709551615'
    const rawArrayIdentity = 'u_nested_array_user'
    const rawActorUserId = 'u_admin_actor'

    sentry.captureException(new Error(`Database failed for userId=${rawUserId}`), {
      endpoint: '/api/feed',
      platform: 'twitter',
      status: 503,
      userId: rawUserId,
      actorUserId: rawActorUserId,
      account: {
        identity: {
          provider: 'x',
          providerId: rawXId,
        },
      },
      users: [
        { id: rawArrayIdentity, role: 'reader' },
        { userId: rawUserId, active: true },
      ],
      identities: [rawXId, rawArrayIdentity],
    })

    const extras = capturedExtras()
    const serialized = JSON.stringify(extras)

    expect(extras).toMatchObject({
      endpoint: '/api/feed',
      platform: 'twitter',
      status: 503,
    })
    expect(extras.userId).toMatch(/^sentry:[a-f0-9]{24}$/)
    expect(extras.actorUserId).toMatch(/^sentry:[a-f0-9]{24}$/)
    expect(extras.account).toMatchObject({
      identity: {
        provider: 'x',
        providerId: expect.stringMatching(/^sentry:[a-f0-9]{24}$/),
      },
    })
    expect(extras.users).toEqual([
      { id: expect.stringMatching(/^sentry:[a-f0-9]{24}$/), role: 'reader' },
      { userId: expect.stringMatching(/^sentry:[a-f0-9]{24}$/), active: true },
    ])
    expect(extras.identities).toEqual([
      expect.stringMatching(/^sentry:[a-f0-9]{24}$/),
      expect.stringMatching(/^sentry:[a-f0-9]{24}$/),
    ])
    expect(serialized).not.toContain(rawUserId)
    expect(serialized).not.toContain(rawXId)
    expect(serialized).not.toContain(rawArrayIdentity)
    expect(serialized).not.toContain(rawActorUserId)

    const reportedError = sentrySdk.captureException.mock.calls[0][0] as Error
    expect(reportedError.message).toBe('Database failed for userId=[redacted]')
    expect(reportedError.stack).not.toContain(rawUserId)
  })

  it('strips credentials, query strings, and fragments from URL keys and array values', () => {
    sentry.captureMessage('Upstream request failed', 'warning', {
      endpoint: '/api/media/video/hls/segment',
      requestUrl:
        'https://alice:password@cdn.example.com/media/clip.ts?token=query-secret#private-fragment',
      nested: {
        urls: [
          'https://cdn.example.com/one.mp4?Policy=signed-policy&Signature=signed-value',
          '/api/media/video?author=private-author#private-fragment',
        ],
      },
      accessToken: 'top-level-secret',
      codeVerifier: 'pkce-secret',
    })

    const extras = capturedExtras()
    const serialized = JSON.stringify(extras)

    expect(extras.endpoint).toBe('/api/media/video/hls/segment')
    expect(extras.requestUrl).toBe('https://cdn.example.com/media/clip.ts')
    expect(extras.nested).toEqual({
      urls: ['https://cdn.example.com/one.mp4', '/api/media/video'],
    })
    expect(extras).not.toHaveProperty('accessToken')
    for (const secret of [
      'alice',
      'password',
      'query-secret',
      'private-fragment',
      'signed-policy',
      'signed-value',
      'private-author',
      'top-level-secret',
      'pkce-secret',
    ]) {
      expect(serialized).not.toContain(secret)
    }
  })

  it('sanitizes URLs and secret assignments in exception and message text', () => {
    sentry.captureException(
      new Error(
        'Fetch https://alice:password@api.example.com/callback?token=query-secret#fragment failed; retry /oauth/callback?code=oauth-code#private; refresh_token=throw-secret',
      ),
    )

    const reportedError = sentrySdk.captureException.mock.calls[0][0] as Error
    expect(reportedError).toBeInstanceOf(Error)
    expect(reportedError.message).toContain('https://api.example.com/callback')
    expect(reportedError.message).toContain('retry /oauth/callback')
    expect(reportedError.message).toContain('refresh_token=[redacted]')
    expect(reportedError.message).not.toMatch(
      /alice|password|query-secret|fragment|oauth-code|private|throw-secret/,
    )

    sentry.captureMessage(
      'Retry https://bob:pw@cdn.example.com/file.mp4?Signature=signed#download; token=message-secret',
      'error',
    )

    expect(sentrySdk.captureMessage).toHaveBeenCalledWith(
      'Retry https://cdn.example.com/file.mp4 token=[redacted]',
      'error',
    )
  })

  it('caps nested context and omits values it cannot safely represent', () => {
    const circular: Record<string, unknown> = { safe: 'kept' }
    circular.self = circular

    sentry.captureMessage('bounded', 'info', {
      circular,
      callable: () => 'secret',
      oversized: 'x'.repeat(1_500),
      tooDeep: { one: { two: { three: { four: { five: { raw: 'omitted' } } } } } },
      largeArray: Array.from({ length: 40 }, (_, index) => index),
    })

    const extras = capturedExtras()
    expect(extras.circular).toEqual({ safe: 'kept' })
    expect(extras).not.toHaveProperty('callable')
    expect(extras.oversized).toHaveLength(1_001)
    expect(extras.largeArray).toHaveLength(25)
    expect(JSON.stringify(extras)).not.toContain('omitted')
  })

  it('uses a bounded keyed pseudonym for metrics.trackUser', () => {
    sentry.metrics.trackUser('u_email')

    expect(sentrySdk.metricCount).toHaveBeenCalledWith('users.daily_active', 1, {
      attributes: { user_hash: expect.stringMatching(/^[a-f0-9]{24}$/) },
    })
  })
})
