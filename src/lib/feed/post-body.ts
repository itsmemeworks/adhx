import type { FeedItem } from '@/components/feed/types'

/**
 * Post words for every surface (the web theater, the phone apps): HTML
 * entities decoded and t.co links swapped for where they go. Plain module so
 * server code can use it without pulling in React.
 */

const SHORT_LINK = /https?:\/\/t\.co\/\w+/g

/**
 * Decode HTML entities in text (named and numeric/hex)
 */
export function decodeHtmlEntities(text: string): string {
  const namedEntities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&nbsp;': ' ',
  }

  // First handle named entities
  let result = text.replace(
    /&(?:amp|lt|gt|quot|#39|apos|nbsp);/g,
    (match) => namedEntities[match] || match,
  )

  // Handle decimal numeric entities (&#12345;)
  result = result.replace(/&#(\d+);/g, (_, dec) => {
    const codePoint = parseInt(dec, 10)
    return String.fromCodePoint(codePoint)
  })

  // Handle hexadecimal numeric entities (&#x1F600; or &#X1F600;)
  result = result.replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => {
    const codePoint = parseInt(hex, 16)
    return String.fromCodePoint(codePoint)
  })

  return result
}

/**
 * The post's text with paragraph breaks kept (blank lines become one blank
 * line), short links swapped for where they go when known, else dropped.
 */
export function postBody(item: Pick<FeedItem, 'text' | 'links'>): string {
  const expanded = new Map<string, string>()
  for (const link of item.links ?? []) {
    if (link.originalUrl && link.expandedUrl) expanded.set(link.originalUrl, link.expandedUrl)
  }
  return decodeHtmlEntities(item.text || '')
    .replace(SHORT_LINK, (url) => expanded.get(url) ?? '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
