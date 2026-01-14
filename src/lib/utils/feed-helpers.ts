/**
 * Feed helper utilities for bookmark processing
 */

export interface BookmarkLink {
  id: number
  bookmarkId: string
  originalUrl?: string | null
  expandedUrl: string
  domain?: string | null
  linkType?: string | null
  previewTitle?: string | null
  previewDescription?: string | null
  previewImageUrl?: string | null
  contentJson?: string | null
}

/**
 * Select the best article link from a list of bookmark links.
 *
 * Priority order:
 * 1. Links with linkType='article' AND previewTitle (enriched article data)
 * 2. Links with any previewTitle or previewImageUrl (other enriched links)
 * 3. null if no enriched links found
 *
 * This ensures we display the actual article content when available,
 * rather than empty tweet links that may be present.
 */
export function selectArticleLink(links: BookmarkLink[]): BookmarkLink | null {
  if (!links || links.length === 0) return null

  // First priority: article type with preview title (fully enriched article)
  const articleWithTitle = links.find(
    (l) => l.linkType === 'article' && l.previewTitle
  )
  if (articleWithTitle) return articleWithTitle

  // Second priority: any link with preview data
  const linkWithPreview = links.find(
    (l) => l.previewTitle || l.previewImageUrl
  )
  if (linkWithPreview) return linkWithPreview

  return null
}

/**
 * Build article preview object from a bookmark link
 */
export function buildArticlePreview(
  link: BookmarkLink,
  isXArticle: boolean
): {
  title: string | null
  description: string | null
  imageUrl: string | null
  url: string
  domain: string | null
  isXArticle: boolean
} {
  return {
    title: link.previewTitle || null,
    description: link.previewDescription || null,
    imageUrl: link.previewImageUrl || null,
    url: link.expandedUrl,
    domain: link.domain || null,
    isXArticle,
  }
}

/**
 * Parse article content JSON safely
 */
export function parseArticleContent(contentJson: string | null | undefined): unknown | null {
  if (!contentJson) return null

  try {
    return JSON.parse(contentJson)
  } catch {
    return null
  }
}
