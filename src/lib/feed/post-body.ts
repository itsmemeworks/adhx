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

  const result = text.replace(
    /&(?:amp|lt|gt|quot|apos|nbsp);|&#(?:(\d+)|[xX]([0-9a-fA-F]+));/g,
    (match, dec, hex) => {
      if (namedEntities[match]) return namedEntities[match]
      const codePoint = parseInt(dec ?? hex, dec === undefined ? 16 : 10)
      // Invalid Unicode scalar values are replacement characters, never exceptions.
      return !Number.isFinite(codePoint) ||
        codePoint <= 0 ||
        codePoint > 0x10ffff ||
        (codePoint >= 0xd800 && codePoint <= 0xdfff)
        ? '\uFFFD'
        : String.fromCodePoint(codePoint)
    },
  )

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
