/**
 * Pure Schema.org JSON-LD builders.
 *
 * Each function returns a plain JS object ready to JSON.stringify into a
 * `<script type="application/ld+json">` tag. No DB access, no fetch, no side
 * effects — callers resolve the data and pass it in.
 *
 * Convention: omit optional fields entirely when absent (never emit `null` or
 * `undefined` values into the output).
 */

/** A schema.org Person author block. */
export interface AuthorInput {
  /** Display name, e.g. "Jane Doe". */
  name: string
  /** Profile URL, e.g. "https://x.com/janedoe". */
  url?: string
  /** Avatar image URL. */
  image?: string
}

export interface SocialMediaPostingInput {
  /** Author of the post. */
  author: AuthorInput
  /** Headline — typically an article title or a truncated post text. */
  headline: string
  /** Full post text (maps to `articleBody`). */
  text?: string
  /** Canonical source URL of the post (e.g. the x.com permalink). */
  url: string
  /** ADHX preview page URL (maps to `mainEntityOfPage`). */
  mainEntityOfPage?: string
  /** ISO 8601 publish date. */
  datePublished?: string
  /** Like count. */
  likes?: number
  /** Repost/share count. */
  reposts?: number
  /** Reply/comment count. */
  replies?: number
  /** Primary image URL (omit for text-only posts). */
  image?: string
  /** Attached video, if any. */
  video?: VideoInput
}

/** Minimal video shape embedded inside a SocialMediaPosting. */
export interface VideoInput {
  contentUrl?: string
  thumbnailUrl?: string
  width?: number
  height?: number
  /** ISO 8601 duration, e.g. "PT1M30S". */
  duration?: string
}

export interface VideoObjectInput {
  /** Video title. */
  name: string
  /** Description / caption. */
  description?: string
  /** Poster/thumbnail image URL. */
  thumbnailUrl?: string
  /** ISO 8601 upload date. */
  uploadDate?: string
  /** Direct media URL (MP4 etc.). */
  contentUrl?: string
  /** Embeddable player URL (e.g. a YouTube embed). */
  embedUrl?: string
  /** ISO 8601 duration, e.g. "PT0M45S". */
  duration?: string
  /** Author of the video. */
  author?: AuthorInput
}

export interface ItemListEntryInput {
  /** Absolute or app-relative URL of the item's preview page. */
  url: string
  /** Optional display name for the entry. */
  name?: string
}

export interface CollectionPageInput {
  /** Page title. */
  name: string
  /** Page description. */
  description?: string
  /** Canonical URL of the collection page. */
  url: string
  /** Items the page collects. */
  items: ItemListEntryInput[]
  /** Base URL used to resolve relative item URLs. */
  baseUrl: string
}

/** A schema.org InteractionCounter. */
interface InteractionCounter {
  '@type': 'InteractionCounter'
  interactionType: string
  userInteractionCount: number
}

/** Resolve a possibly-relative URL against a base. Leaves absolute URLs intact. */
function resolveUrl(url: string, baseUrl: string): string {
  if (/^https?:\/\//.test(url)) return url
  const base = baseUrl.replace(/\/$/, '')
  const path = url.startsWith('/') ? url : `/${url}`
  return `${base}${path}`
}

/** Build the schema.org Person block, omitting empty optional fields. */
function buildAuthorLd(author: AuthorInput): Record<string, unknown> {
  const ld: Record<string, unknown> = {
    '@type': 'Person',
    name: author.name,
  }
  if (author.url) ld.url = author.url
  if (author.image) ld.image = author.image
  return ld
}

/** Build a VideoObject sub-block (no `@context`), omitting empty fields. */
function buildVideoBlock(video: VideoInput): Record<string, unknown> {
  const ld: Record<string, unknown> = { '@type': 'VideoObject' }
  if (video.contentUrl) ld.contentUrl = video.contentUrl
  if (video.thumbnailUrl) ld.thumbnailUrl = video.thumbnailUrl
  if (video.width !== undefined) ld.width = video.width
  if (video.height !== undefined) ld.height = video.height
  if (video.duration) ld.duration = video.duration
  return ld
}

/**
 * SocialMediaPosting for tweet-style posts. Reproduces the shape previously
 * built inline on the status preview page.
 */
export function buildSocialMediaPostingLd(input: SocialMediaPostingInput): Record<string, unknown> {
  const interactionStatistic: InteractionCounter[] = []
  if (input.likes !== undefined) {
    interactionStatistic.push({
      '@type': 'InteractionCounter',
      interactionType: 'https://schema.org/LikeAction',
      userInteractionCount: input.likes,
    })
  }
  if (input.reposts !== undefined) {
    interactionStatistic.push({
      '@type': 'InteractionCounter',
      interactionType: 'https://schema.org/ShareAction',
      userInteractionCount: input.reposts,
    })
  }
  if (input.replies !== undefined) {
    interactionStatistic.push({
      '@type': 'InteractionCounter',
      interactionType: 'https://schema.org/CommentAction',
      userInteractionCount: input.replies,
    })
  }

  const ld: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'SocialMediaPosting',
    headline: input.headline,
    author: buildAuthorLd(input.author),
    url: input.url,
  }

  if (input.text) ld.articleBody = input.text
  if (input.datePublished) ld.datePublished = input.datePublished
  if (input.mainEntityOfPage) ld.mainEntityOfPage = input.mainEntityOfPage
  if (interactionStatistic.length > 0) ld.interactionStatistic = interactionStatistic
  if (input.image) ld.image = input.image
  if (input.video) ld.video = buildVideoBlock(input.video)

  return ld
}

/**
 * Standalone VideoObject for Reels / Shorts / TikTok previews. Use `contentUrl`
 * for a direct MP4 (TikTok/Reels) or `embedUrl` for an iframe player (YouTube).
 */
export function buildVideoObjectLd(input: VideoObjectInput): Record<string, unknown> {
  const ld: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name: input.name,
  }
  if (input.description) ld.description = input.description
  if (input.thumbnailUrl) ld.thumbnailUrl = input.thumbnailUrl
  if (input.uploadDate) ld.uploadDate = input.uploadDate
  if (input.contentUrl) ld.contentUrl = input.contentUrl
  if (input.embedUrl) ld.embedUrl = input.embedUrl
  if (input.duration) ld.duration = input.duration
  if (input.author) ld.author = buildAuthorLd(input.author)
  return ld
}

/**
 * ItemList of preview URLs. Positions are 1-based. Relative item URLs are
 * resolved against `baseUrl`.
 */
export function buildItemListLd(
  items: ItemListEntryInput[],
  baseUrl: string,
): Record<string, unknown> {
  const itemListElement = items.map((item, index) => {
    const element: Record<string, unknown> = {
      '@type': 'ListItem',
      position: index + 1,
      url: resolveUrl(item.url, baseUrl),
    }
    if (item.name) element.name = item.name
    return element
  })

  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement,
  }
}

/**
 * CollectionPage for a /trending hub, wrapping an ItemList as `mainEntity`.
 * The nested ItemList omits its own `@context` (it lives inside the page node).
 */
export function buildCollectionPageLd(input: CollectionPageInput): Record<string, unknown> {
  const itemList = buildItemListLd(input.items, input.baseUrl)
  // The nested list is part of the page graph — drop its standalone context.
  delete itemList['@context']

  const ld: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: input.name,
    url: input.url,
    mainEntity: itemList,
  }
  if (input.description) ld.description = input.description
  return ld
}
