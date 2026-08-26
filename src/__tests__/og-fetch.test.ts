import type { LookupAddress } from 'node:dns'
import { lookup } from 'node:dns/promises'
import { EventEmitter } from 'node:events'
import type { ClientRequest, IncomingMessage, RequestOptions } from 'node:http'
import { isIP } from 'node:net'
import { Readable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { fetchOgMetadata } from '@/lib/utils/og-fetch'

const { httpRequestMock, httpsRequestMock } = vi.hoisted(() => ({
  httpRequestMock: vi.fn(),
  httpsRequestMock: vi.fn(),
}))

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(),
}))

vi.mock('node:http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:http')>()
  return { ...actual, request: httpRequestMock }
})

vi.mock('node:https', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:https')>()
  return { ...actual, request: httpsRequestMock }
})

const lookupAll = lookup as unknown as (
  hostname: string,
  options: { all: true; verbatim: true },
) => Promise<LookupAddress[]>
const lookupMock = vi.mocked(lookupAll)
const connectMock = vi.fn()

interface PlannedResponse {
  statusCode: number
  headers?: Record<string, string>
  chunks?: Array<string | Buffer>
  missingBody?: boolean
  response?: IncomingMessage
  destroySpy?: MockInstance
}

let plannedResponses: PlannedResponse[] = []

function htmlPlan(title = 'Public page'): PlannedResponse {
  return {
    statusCode: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    chunks: [
      `<html><head><meta property="og:title" content="${title}"></head><body></body></html>`,
    ],
  }
}

function redirectPlan(location?: string): PlannedResponse {
  return {
    statusCode: 302,
    headers: location ? { location } : {},
  }
}

function makeIncomingMessage(plan: PlannedResponse): IncomingMessage {
  const response = Readable.from(plan.chunks ?? []) as IncomingMessage
  Object.defineProperties(response, {
    statusCode: { value: plan.statusCode, configurable: true },
    headers: { value: plan.headers ?? {}, configurable: true },
  })
  if (plan.missingBody) {
    Object.defineProperty(response, 'readable', { value: false, configurable: true })
  }
  plan.response = response
  plan.destroySpy = vi.spyOn(response, 'destroy')
  return response
}

function nativeRequestImplementation(
  urlInput: URL | string,
  options: RequestOptions,
  onResponse: (response: IncomingMessage) => void,
): ClientRequest {
  const request = new EventEmitter() as ClientRequest
  const url = new URL(String(urlInput))
  const hostname =
    url.hostname.startsWith('[') && url.hostname.endsWith(']')
      ? url.hostname.slice(1, -1)
      : url.hostname

  const connect = () => {
    connectMock(url.toString())
    const plan = plannedResponses.shift()
    if (!plan) {
      queueMicrotask(() => request.emit('error', new Error('No planned response')))
      return
    }
    queueMicrotask(() => onResponse(makeIncomingMessage(plan)))
  }

  request.end = (() => {
    if (isIP(hostname) !== 0) {
      connect()
      return request
    }

    if (!options.lookup) {
      queueMicrotask(() => request.emit('error', new Error('Missing guarded lookup')))
      return request
    }

    options.lookup(hostname, { all: true }, (error) => {
      if (error) queueMicrotask(() => request.emit('error', error))
      else connect()
    })
    return request
  }) as ClientRequest['end']
  request.destroy = (() => request) as ClientRequest['destroy']
  return request
}

function requestCount(): number {
  return httpRequestMock.mock.calls.length + httpsRequestMock.mock.calls.length
}

describe('fetchOgMetadata SSRF protection', () => {
  beforeEach(() => {
    lookupMock.mockReset()
    lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
    httpRequestMock.mockReset()
    httpsRequestMock.mockReset()
    httpRequestMock.mockImplementation(nativeRequestImplementation)
    httpsRequestMock.mockImplementation(nativeRequestImplementation)
    connectMock.mockReset()
    plannedResponses = []
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each(['file:///etc/passwd', 'ftp://example.com/file', 'data:text/html,hello', 'gopher://x/'])(
    'rejects the unsupported scheme in %s',
    async (url) => {
      expect(await fetchOgMetadata(url)).toBeNull()
      expect(lookupMock).not.toHaveBeenCalled()
      expect(requestCount()).toBe(0)
      expect(connectMock).not.toHaveBeenCalled()
    },
  )

  it.each([
    'http://0.0.0.0/',
    'http://10.1.2.3/',
    'http://100.64.0.1/',
    'http://127.0.0.1/',
    'http://127.1/',
    'http://169.254.169.254/latest/meta-data/',
    'http://172.16.0.1/',
    'http://192.0.2.1/',
    'http://192.168.1.1/',
    'http://198.18.0.1/',
    'http://224.0.0.1/',
    'http://240.0.0.1/',
    'http://[::]/',
    'http://[::1]/',
    'http://[::ffff:127.0.0.1]/',
    'http://[fc00::1]/',
    'http://[fe80::1]/',
    'http://[ff02::1]/',
    'http://[2001:db8::1]/',
    'http://[4000::1]/',
  ])('rejects non-public literal address %s', async (url) => {
    expect(await fetchOgMetadata(url)).toBeNull()
    expect(lookupMock).not.toHaveBeenCalled()
    expect(requestCount()).toBe(0)
    expect(connectMock).not.toHaveBeenCalled()
  })

  it('rejects a hostname that resolves to a private address', async () => {
    lookupMock.mockResolvedValue([{ address: '10.0.0.7', family: 4 }])

    expect(await fetchOgMetadata('https://internal.example/')).toBeNull()
    expect(lookupMock).toHaveBeenCalledWith('internal.example', {
      all: true,
      verbatim: true,
    })
    expect(requestCount()).toBe(0)
    expect(connectMock).not.toHaveBeenCalled()
  })

  it('rejects mixed public and private DNS answers', async () => {
    lookupMock.mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: 'fd00::1234', family: 6 },
    ])

    expect(await fetchOgMetadata('https://mixed.example/')).toBeNull()
    expect(requestCount()).toBe(0)
    expect(connectMock).not.toHaveBeenCalled()
  })

  it('blocks rebinding when preflight is public but connection DNS is private', async () => {
    lookupMock
      .mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }])
      .mockResolvedValueOnce([{ address: '169.254.169.254', family: 4 }])
    plannedResponses.push(htmlPlan('Must not be reached'))

    expect(await fetchOgMetadata('https://rebind.example/article')).toBeNull()
    expect(lookupMock).toHaveBeenCalledTimes(2)
    expect(requestCount()).toBe(1)
    expect(connectMock).not.toHaveBeenCalled()
    expect(plannedResponses).toHaveLength(1)
  })

  it('rejects redirects to private destinations before requesting them', async () => {
    lookupMock.mockImplementation(async (hostname) => {
      if (hostname === 'private.example') return [{ address: '169.254.169.254', family: 4 }]
      return [{ address: '93.184.216.34', family: 4 }]
    })
    const redirect = redirectPlan('http://private.example/latest/meta-data/')
    plannedResponses.push(redirect)

    expect(await fetchOgMetadata('https://public.example/start')).toBeNull()
    expect(requestCount()).toBe(1)
    expect(connectMock).toHaveBeenCalledTimes(1)
    expect(redirect.destroySpy).toHaveBeenCalled()
  })

  it('stops a redirect loop at the hop cap and cancels every body', async () => {
    const redirects = Array.from({ length: 4 }, () => redirectPlan('/loop'))
    plannedResponses.push(...redirects)

    expect(await fetchOgMetadata('https://public.example/loop')).toBeNull()
    expect(requestCount()).toBe(4)
    expect(connectMock).toHaveBeenCalledTimes(4)
    for (const redirect of redirects) {
      expect(redirect.destroySpy).toHaveBeenCalled()
    }
  })

  it.each([
    'https://@example.com/',
    'https://:@example.com/',
    'https://user@example.com/',
    'https://user:password@example.com/',
    'http://user%40example.com:password@example.com/',
  ])('rejects URL credentials in %s', async (url) => {
    expect(await fetchOgMetadata(url)).toBeNull()
    expect(lookupMock).not.toHaveBeenCalled()
    expect(requestCount()).toBe(0)
  })

  it('rejects credentials introduced by a redirect and cancels its body', async () => {
    const redirect = redirectPlan('https://@second.example/article')
    plannedResponses.push(redirect)

    expect(await fetchOgMetadata('https://first.example/start')).toBeNull()
    expect(requestCount()).toBe(1)
    expect(lookupMock).toHaveBeenCalledTimes(2)
    expect(redirect.destroySpy).toHaveBeenCalled()
  })

  it('follows a connection-validated public redirect and parses OG metadata', async () => {
    lookupMock.mockImplementation(async (hostname) => {
      if (hostname === 'first.example') return [{ address: '93.184.216.34', family: 4 }]
      return [{ address: '2606:4700:4700::1111', family: 6 }]
    })
    plannedResponses.push(redirectPlan('https://second.example/article'))
    plannedResponses.push(htmlPlan('Redirected article'))

    expect(await fetchOgMetadata('http://first.example/start')).toEqual({
      title: 'Redirected article',
      description: undefined,
      image: undefined,
      siteName: undefined,
    })
    expect(lookupMock).toHaveBeenCalledTimes(4)
    expect(httpRequestMock).toHaveBeenCalledTimes(1)
    expect(httpsRequestMock).toHaveBeenCalledTimes(1)
    expect(connectMock).toHaveBeenNthCalledWith(2, 'https://second.example/article')
  })

  it('preserves direct public HTTP enrichment', async () => {
    plannedResponses.push(htmlPlan('Plain HTTP page'))

    expect(await fetchOgMetadata('http://public.example/article')).toMatchObject({
      title: 'Plain HTTP page',
    })
    expect(httpRequestMock).toHaveBeenCalledTimes(1)
    expect(connectMock).toHaveBeenCalledTimes(1)
  })

  it.each([
    { name: 'non-OK', plan: { statusCode: 500 } satisfies PlannedResponse },
    {
      name: 'non-HTML',
      plan: {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        chunks: ['{}'],
      } satisfies PlannedResponse,
    },
    {
      name: 'missing body',
      plan: {
        statusCode: 200,
        headers: { 'content-type': 'text/html' },
        missingBody: true,
      } satisfies PlannedResponse,
    },
    { name: 'redirect without Location', plan: redirectPlan() },
  ])('cancels the response for $name rejection', async ({ plan }) => {
    plannedResponses.push(plan)

    expect(await fetchOgMetadata('https://public.example/article')).toBeNull()
    expect(plan.destroySpy).toHaveBeenCalled()
  })
})
