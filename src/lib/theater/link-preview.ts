import type { TextLinkRef, TheaterLinkPreview } from '@/lib/trending/query'

const X_HOST_RE = /(?:^|\.)(?:x|twitter)\.com$/i

/** Hostname without a leading `www.` — empty when `url` isn't a valid URL. */
export function domainFromUrl(url: string): string | null {
  try {
    const host = new URL(url).hostname.replace(/^www\./i, '')
    return host || null
  } catch {
    return null
  }
}

/** True when `url` points off X/Twitter (a publisher card, not an X Article). */
export function isOffsiteHttpUrl(url: string): boolean {
  const host = domainFromUrl(url)
  if (!host) return false
  return !X_HOST_RE.test(host)
}

export function isExternalLinkPreview(item: { linkPreview?: TheaterLinkPreview | null }): boolean {
  const url = item.linkPreview?.url
  return !!url && isOffsiteHttpUrl(url)
}

/**
 * Drop the card's own URL (and its t.co short link) from the tweet body so
 * the typeset stage doesn't shout the same link the card already shows.
 */
export function stripPreviewUrls(
  text: string,
  preview: TheaterLinkPreview | undefined,
  links?: TextLinkRef[],
): string {
  if (!preview?.url) return text
  const urls = new Set<string>([preview.url])
  for (const link of links ?? []) {
    if (link.expandedUrl === preview.url && link.shortUrl) urls.add(link.shortUrl)
  }
  let out = text
  for (const url of urls) {
    out = out.split(url).join(' ')
  }
  return out
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Visible prose for type-size: URLs don't count as a short poetic tweet. */
export function visibleTextForSizing(text: string): string {
  return text
    .replace(/https?:\/\/[^\s]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function linkPreviewFromExternal(
  external:
    | {
        url?: string | null
        expanded_url?: string | null
        title?: string | null
        description?: string | null
        thumbnail_url?: string | null
        display_url?: string | null
      }
    | null
    | undefined,
): TheaterLinkPreview | undefined {
  if (!external) return undefined
  const url = external.expanded_url || external.url
  if (!url || !isOffsiteHttpUrl(url)) return undefined
  if (!external.title && !external.description && !external.thumbnail_url) return undefined
  const fromDisplay = (external.display_url || '').split('/')[0]
  return {
    url,
    title: external.title ?? null,
    description: external.description ?? null,
    imageUrl: external.thumbnail_url ?? null,
    domain: fromDisplay || domainFromUrl(url),
  }
}

/** Collection `articlePreview` → theater card, only for off-site URLs. */
export function linkPreviewFromArticlePreview(
  preview:
    | {
        url: string
        title?: string | null
        description?: string | null
        imageUrl?: string | null
        domain?: string | null
      }
    | null
    | undefined,
): TheaterLinkPreview | undefined {
  if (!preview?.url || !isOffsiteHttpUrl(preview.url)) return undefined
  if (!preview.title && !preview.description && !preview.imageUrl) return undefined
  return {
    url: preview.url,
    title: preview.title ?? null,
    description: preview.description ?? null,
    imageUrl: preview.imageUrl ?? null,
    domain: preview.domain || domainFromUrl(preview.url),
  }
}
