/**
 * Platform-agnostic helpers for content-first `<title>` / meta description
 * generation, shared by all preview pages (tweet, Reel, TikTok, Short).
 *
 * "Content-first" means the tag leads with the post's own content instead of
 * a utility pitch ("Preview @user's post") — GSC showed the old utility
 * framing converting at 0.4% CTR, well below what a content-led snippet gets.
 */

const TITLE_SUFFIX = ' | ADHX'
const TITLE_LEN = 60
const DESC_LEN = 160

/**
 * Truncate at a word boundary near `maxLength`, stripping URLs and collapsing
 * whitespace first. Falls back to a hard cut when the nearest earlier space
 * would throw away too much of the budget (< 60% of it).
 */
export function truncateWordBoundary(text: string, maxLength: number): string {
  const clean = text
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (clean.length <= maxLength) return clean
  const sliced = clean.slice(0, maxLength)
  const lastSpace = sliced.lastIndexOf(' ')
  const cut = lastSpace > maxLength * 0.6 ? sliced.slice(0, lastSpace) : sliced
  return `${cut.trimEnd()}…`
}

/** Content-first `<title>`: the post's own content, brand-suffixed. */
export function buildContentTitle(content: string, maxLength = TITLE_LEN): string {
  return `${truncateWordBoundary(content, maxLength)}${TITLE_SUFFIX}`
}

/**
 * Content-first meta description (~160 chars) for the SERP snippet. `suffix`
 * (e.g. an engagement stat like " (1.4K likes)") is appended after truncation
 * and counts against the budget.
 */
export function buildContentDescription(
  content: string,
  suffix = '',
  maxLength = DESC_LEN,
): string {
  const budget = Math.max(20, maxLength - suffix.length)
  const truncated = truncateWordBoundary(content, budget)
  return suffix ? `${truncated}${suffix}` : truncated
}
