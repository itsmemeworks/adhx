/**
 * Expands t.co URLs in tweet text using the provided links
 */
export function expandUrls(
  text: string,
  links: Array<{ originalUrl?: string | null; expandedUrl: string }>
): string {
  let expandedText = text

  // Create a map of original URLs to expanded URLs
  for (const link of links) {
    if (link.originalUrl && link.expandedUrl) {
      // Replace t.co URL with expanded URL
      expandedText = expandedText.replace(link.originalUrl, link.expandedUrl)
    }
  }

  // Find all remaining t.co URLs in the text
  const remainingTcoUrls = expandedText.match(/https?:\/\/t\.co\/[a-zA-Z0-9]+/g) || []

  // For each remaining t.co URL, try to find a matching expanded URL
  if (remainingTcoUrls.length > 0 && links.length > 0) {
    // Get links that haven't been matched yet (no originalUrl or not yet used)
    const unmatchedLinks = links.filter(l =>
      l.expandedUrl &&
      !l.expandedUrl.includes('t.co/') &&
      !l.expandedUrl.includes('/status/') // Skip tweet status links
    )

    // Try to match remaining t.co URLs with unmatched links by position
    remainingTcoUrls.forEach((tcoUrl, index) => {
      // First try exact match
      const exactMatch = links.find(l => l.originalUrl === tcoUrl)
      if (exactMatch?.expandedUrl) {
        expandedText = expandedText.replace(tcoUrl, exactMatch.expandedUrl)
        return
      }

      // Fallback: use positional matching with unmatched links
      if (index < unmatchedLinks.length) {
        expandedText = expandedText.replace(tcoUrl, unmatchedLinks[index].expandedUrl)
      }
    })
  }

  return expandedText
}

/**
 * Truncates a URL for display while keeping it readable
 */
export function truncateUrl(url: string, maxLength: number = 50): string {
  try {
    const urlObj = new URL(url)
    const display = urlObj.hostname + urlObj.pathname
    if (display.length <= maxLength) {
      return display
    }
    return display.substring(0, maxLength - 3) + '...'
  } catch {
    if (url.length <= maxLength) {
      return url
    }
    return url.substring(0, maxLength - 3) + '...'
  }
}

/**
 * Makes URLs in text clickable by wrapping them in anchor tags
 * Returns an array of text/link segments for React rendering
 */
export function parseTextWithLinks(text: string): Array<{ type: 'text' | 'link'; content: string; url?: string }> {
  const urlRegex = /(https?:\/\/[^\s]+)/g
  const parts: Array<{ type: 'text' | 'link'; content: string; url?: string }> = []
  let lastIndex = 0
  let match

  while ((match = urlRegex.exec(text)) !== null) {
    // Add text before the URL
    if (match.index > lastIndex) {
      parts.push({
        type: 'text',
        content: text.slice(lastIndex, match.index),
      })
    }

    // Add the URL
    const url = match[0]
    parts.push({
      type: 'link',
      content: truncateUrl(url),
      url: url,
    })

    lastIndex = match.index + match[0].length
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push({
      type: 'text',
      content: text.slice(lastIndex),
    })
  }

  return parts
}
