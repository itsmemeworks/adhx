/**
 * Fetch Open Graph metadata from a URL
 * Used as fallback when FxTwitter doesn't return external link data
 */

import type { IncomingMessage } from 'node:http'
import { decodeHtmlEntities } from '@/lib/utils/html-entities'
import { requestPublicHttpUrl } from '@/lib/utils/outbound-url'

const OG_FETCH_TIMEOUT_MS = 10_000
const MAX_REDIRECTS = 3
const MAX_HEAD_BYTES = 512 * 1024

export interface OgMetadata {
  title?: string
  description?: string
  image?: string
  siteName?: string
}

function cancelResponse(response: IncomingMessage): void {
  response.destroy()
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/**
 * Fetch and parse OG metadata from a URL.
 * Returns null on any failure (timeout, invalid HTML, no OG tags).
 */
export async function fetchOgMetadata(url: string): Promise<OgMetadata | null> {
  try {
    // One deadline covers DNS validation, redirects, and response streaming.
    const signal = AbortSignal.timeout(OG_FETCH_TIMEOUT_MS)
    let currentInput: string | URL = url
    let redirectBase: URL | undefined

    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
      const result = await requestPublicHttpUrl(currentInput, {
        signal,
        base: redirectBase,
        headers: {
          // Use Twitterbot UA — sites whitelist social crawlers for OG tag serving,
          // while blocking generic bots with Cloudflare etc.
          'User-Agent': 'Twitterbot/1.0',
          Accept: 'text/html',
        },
      })
      if (!result) return null
      const { url: current, response } = result

      const status = response.statusCode ?? 0
      if (status >= 300 && status < 400) {
        cancelResponse(response)
        if (redirects === MAX_REDIRECTS) return null

        const location = firstHeader(response.headers.location)
        if (!location) return null
        currentInput = location
        redirectBase = current
        continue
      }

      if (status < 200 || status >= 300) {
        cancelResponse(response)
        return null
      }

      const contentType = firstHeader(response.headers['content-type']) || ''
      if (!contentType.includes('text/html')) {
        cancelResponse(response)
        return null
      }

      // Read until </head> or 512KB limit — some sites have massive inline CSS/JS
      // before OG meta tags (e.g. theblock.co puts OG tags at ~230KB)
      const body = response.readable ? response : null
      if (!body) {
        cancelResponse(response)
        return null
      }

      let html = ''
      let bytesRead = 0
      const decoder = new TextDecoder()
      try {
        for await (const value of body) {
          const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value)
          const remaining = MAX_HEAD_BYTES - bytesRead
          const chunk = bytes.byteLength > remaining ? bytes.subarray(0, remaining) : bytes
          bytesRead += chunk.byteLength
          html += decoder.decode(chunk, { stream: true })
          if (/<\/head\s*>/i.test(html) || bytesRead >= MAX_HEAD_BYTES) break
        }
      } finally {
        cancelResponse(response)
      }

      return parseOgTags(html)
    }

    return null
  } catch {
    return null
  }
}

/** Extract OG meta tags from HTML string */
function parseOgTags(html: string): OgMetadata | null {
  const get = (property: string): string | undefined => {
    // Match <meta property="og:title" content="..."> or <meta name="og:title" content="...">
    const pattern = new RegExp(
      `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']` +
        `|<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`,
      'i',
    )
    const match = html.match(pattern)
    if (match) return decodeHtmlEntities(match[1] || match[2])

    // Fallback to <title> tag for title
    if (property === 'og:title') {
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
      if (titleMatch) return decodeHtmlEntities(titleMatch[1].trim())
    }

    // Fallback to meta description for description
    if (property === 'og:description') {
      const descMatch = html.match(
        /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']|<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i,
      )
      if (descMatch) return decodeHtmlEntities(descMatch[1] || descMatch[2])
    }

    return undefined
  }

  const title = get('og:title')
  const description = get('og:description')
  const image = get('og:image')
  const siteName = get('og:site_name')

  // Return null if we got nothing useful
  if (!title && !description && !image) return null

  return { title, description, image, siteName }
}
