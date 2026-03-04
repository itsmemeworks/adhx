/**
 * Fetch Open Graph metadata from a URL
 * Used as fallback when FxTwitter doesn't return external link data
 */

export interface OgMetadata {
  title?: string
  description?: string
  image?: string
  siteName?: string
}

/**
 * Fetch and parse OG metadata from a URL.
 * Returns null on any failure (timeout, invalid HTML, no OG tags).
 */
export async function fetchOgMetadata(url: string): Promise<OgMetadata | null> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      headers: {
        // Use Twitterbot UA — sites whitelist social crawlers for OG tag serving,
        // while blocking generic bots with Cloudflare etc.
        'User-Agent': 'Twitterbot/1.0',
        'Accept': 'text/html',
      },
      redirect: 'follow',
    })

    if (!response.ok) return null

    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('text/html')) return null

    // Read until </head> or 512KB limit — some sites have massive inline CSS/JS
    // before OG meta tags (e.g. theblock.co puts OG tags at ~230KB)
    const reader = response.body?.getReader()
    if (!reader) return null

    let html = ''
    const decoder = new TextDecoder()
    const maxBytes = 512 * 1024
    while (html.length < maxBytes) {
      const { done, value } = await reader.read()
      if (done) break
      html += decoder.decode(value, { stream: true })
      if (html.includes('</head>')) break
    }
    reader.cancel().catch(() => {})

    return parseOgTags(html)
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
      'i'
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
        /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']|<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i
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

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
}
