import type { NextRequest } from 'next/server'

/**
 * A form posted from one of our own pages: the browser says it came from this
 * address (`Origin`) and not from another site (`Sec-Fetch-Site`). Pages that
 * spend a link (sign-in, invites) refuse everything else.
 */
export function isSameOriginPost(request: NextRequest): boolean {
  return (
    request.headers.get('origin') ===
      new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').origin &&
    request.headers.get('sec-fetch-site') !== 'cross-site'
  )
}

/**
 * A small URL-encoded form body, or null when it isn't one or is bigger than
 * `maxBytes`. Reads no further than the limit.
 */
export async function readSmallForm(
  request: NextRequest,
  maxBytes = 1024,
): Promise<URLSearchParams | null> {
  if (
    request.headers.get('content-type')?.split(';')[0].trim() !==
      'application/x-www-form-urlencoded' ||
    !request.body
  )
    return null
  const reader = request.body.getReader()
  const decoder = new TextDecoder()
  let body = ''
  let bytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > maxBytes) {
        await reader.cancel()
        return null
      }
      body += decoder.decode(value, { stream: true })
    }
    return new URLSearchParams(body + decoder.decode())
  } finally {
    reader.releaseLock()
  }
}
