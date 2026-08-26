import type { LookupAddress } from 'node:dns'
import { lookup } from 'node:dns/promises'
import { request as httpRequest, type IncomingMessage, type RequestOptions } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { BlockList, isIP, type LookupFunction } from 'node:net'

const blockedIpv4Addresses = new BlockList()
const blockedIpv6Addresses = new BlockList()
const publicIpv6Addresses = new BlockList()

const blockedIpv4Subnets: Array<[string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
]

const blockedIpv6Subnets: Array<[string, number]> = [
  ['::', 96],
  ['::ffff:0:0', 96],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['3fff::', 20],
  ['5f00::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['fec0::', 10],
  ['ff00::', 8],
]

for (const [network, prefix] of blockedIpv4Subnets) {
  blockedIpv4Addresses.addSubnet(network, prefix, 'ipv4')
}
for (const [network, prefix] of blockedIpv6Subnets) {
  blockedIpv6Addresses.addSubnet(network, prefix, 'ipv6')
}
// Publicly routable IPv6 unicast space is currently allocated from 2000::/3.
// Requiring that range rejects otherwise-unallocated/reserved IPv6 space.
publicIpv6Addresses.addSubnet('2000::', 3, 'ipv6')

function withoutIpv6Brackets(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname
}

function hasAuthorityUserInfo(input: string): boolean {
  const normalized = input.trim().replaceAll('\\', '/')
  const authority = normalized.match(/^(?:https?:)?\/\/([^/?#]*)/i)?.[1]
  return authority?.includes('@') ?? false
}

export function isPublicIpAddress(address: string): boolean {
  const family = isIP(address)
  if (family === 4) return !blockedIpv4Addresses.check(address, 'ipv4')
  if (family === 6) {
    return (
      publicIpv6Addresses.check(address, 'ipv6') && !blockedIpv6Addresses.check(address, 'ipv6')
    )
  }
  return false
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason)

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason)
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (error) => {
        signal.removeEventListener('abort', onAbort)
        reject(error)
      },
    )
  })
}

function rejectedAddressError(hostname: string): NodeJS.ErrnoException {
  const error = new Error(`Refusing non-public address for ${hostname}`) as NodeJS.ErrnoException
  error.code = 'EHOSTUNREACH'
  return error
}

async function resolvePublicAddresses(
  hostname: string,
  signal: AbortSignal,
): Promise<LookupAddress[]> {
  const addresses = await abortable(lookup(hostname, { all: true, verbatim: true }), signal)
  if (addresses.length === 0 || !addresses.every(({ address }) => isPublicIpAddress(address))) {
    throw rejectedAddressError(hostname)
  }
  return addresses
}

/**
 * Node's socket connector calls this lookup function while establishing the
 * connection. The addresses returned here are the addresses it will actually
 * connect to, closing the validation-to-connect DNS rebinding window.
 */
function createPublicLookup(signal: AbortSignal): LookupFunction {
  return (hostname, options, callback) => {
    resolvePublicAddresses(hostname, signal).then(
      (addresses) => {
        const requestedFamily =
          options.family === 4 || options.family === 6 ? options.family : undefined
        const candidates = requestedFamily
          ? addresses.filter(({ family }) => family === requestedFamily)
          : addresses

        if (candidates.length === 0) {
          callback(rejectedAddressError(hostname), '', 0)
        } else if (options.all) {
          callback(null, candidates)
        } else {
          callback(null, candidates[0].address, candidates[0].family)
        }
      },
      (error: NodeJS.ErrnoException) => callback(error, '', 0),
    )
  }
}

/**
 * Parse an outbound URL and verify that it can only target public network
 * addresses. Hostnames are resolved immediately before use and every answer
 * must be public; a mixed public/private answer is rejected.
 */
export async function validatePublicHttpUrl(
  input: string | URL,
  signal: AbortSignal,
  base?: URL,
): Promise<URL | null> {
  let url: URL
  try {
    if (typeof input === 'string' && hasAuthorityUserInfo(input)) return null
    url = new URL(input, base)
  } catch {
    return null
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (url.username || url.password) return null

  const hostname = withoutIpv6Brackets(url.hostname)
  const family = isIP(hostname)
  if (family !== 0) return isPublicIpAddress(hostname) ? url : null

  try {
    await resolvePublicAddresses(hostname, signal)
    return url
  } catch {
    return null
  }
}

export interface PublicHttpResult {
  url: URL
  response: IncomingMessage
}

/**
 * Validate an outbound URL, then perform a one-off native HTTP(S) request whose
 * socket lookup independently re-resolves and validates every DNS answer.
 *
 * `agent: false` prevents reuse of a socket created outside this guard, and
 * the lookup callback supplies the validated addresses directly to Node's
 * connector. HTTPS still uses the original hostname for SNI and certificate
 * verification.
 */
export async function requestPublicHttpUrl(
  input: string | URL,
  options: {
    signal: AbortSignal
    base?: URL
    headers?: Record<string, string>
  },
): Promise<PublicHttpResult | null> {
  const url = await validatePublicHttpUrl(input, options.signal, options.base)
  if (!url) return null

  const hostname = withoutIpv6Brackets(url.hostname)
  const requestOptions: RequestOptions = {
    method: 'GET',
    headers: options.headers,
    signal: options.signal,
    agent: false,
  }
  if (isIP(hostname) === 0) {
    requestOptions.lookup = createPublicLookup(options.signal)
  }

  const response = await new Promise<IncomingMessage>((resolve, reject) => {
    const onResponse = (incoming: IncomingMessage) => resolve(incoming)
    const request =
      url.protocol === 'https:'
        ? httpsRequest(url, requestOptions, onResponse)
        : httpRequest(url, requestOptions, onResponse)
    request.once('error', reject)
    request.end()
  })

  return { url, response }
}
