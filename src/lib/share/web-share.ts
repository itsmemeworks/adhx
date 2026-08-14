/**
 * Web Share helpers for sending a media FILE plus the ADHX preview link.
 *
 * WhatsApp / iMessage ignore or *concatenate* `url` when `files` are present.
 * Putting the same link in both `text` (`via https://…`) and `url` produced
 * "via URL URL" in WhatsApp. File shares send `files` + `text` only.
 *
 * iOS Safari also drops user-activation if we `await fetch(mp4)` inside the
 * tap handler — the first share fails (our AlertCircle), the second works
 * because the video is now cached. Prefetch the File on mount so share()
 * runs in the same turn as the tap.
 */

const MIN_MEDIA_BYTES = 2048
const shareFileCache = new Map<string, Promise<File>>()

export function shareCaption(pageUrl?: string): string | undefined {
  if (!pageUrl) return undefined
  return `via ${pageUrl}`
}

/** Origin + pathname, no query/hash — the URL we put in captions and link shares. */
export function canonicalShareUrl(href?: string): string | undefined {
  if (!href) return undefined
  try {
    const u = new URL(href)
    const path = u.pathname.replace(/\/+$/, '')
    return `${u.origin}${path}`
  } catch {
    return undefined
  }
}

export interface ShareFileWithLinkOptions {
  /** Canonical ADHX preview URL to attach as the caption. */
  pageUrl?: string
}

/**
 * Share `file` via the native sheet with `via <pageUrl>` as caption.
 * Never sets `url` alongside `files` — messengers treat that as a second link.
 * Throws `AbortError` when the user dismisses the sheet (callers treat that as success).
 */
export async function shareFileWithLink(
  file: File,
  opts: ShareFileWithLinkOptions = {},
): Promise<void> {
  const pageUrl = canonicalShareUrl(opts.pageUrl) ?? opts.pageUrl
  const text = shareCaption(pageUrl)

  const attempts: ShareData[] = []
  if (text) attempts.push({ files: [file], text })
  attempts.push({ files: [file] })

  let lastError: unknown
  for (const data of attempts) {
    try {
      if (navigator.canShare && !navigator.canShare(data)) continue
      await navigator.share(data)
      return
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw error
      lastError = error
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Share failed')
}

/** Link-only share (no file). URL once — WhatsApp unfurls it. */
export async function sharePageLink(opts: { title?: string; href?: string }): Promise<void> {
  const url = canonicalShareUrl(opts.href)
  if (!url) throw new Error('Share failed')
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    await navigator.share({ url, title: opts.title })
    return
  }
  await navigator.clipboard.writeText(url)
}

export async function fileFromMediaUrl(
  url: string,
  filename: string,
  mimeType = 'video/mp4',
): Promise<File> {
  const res = await fetch(url)
  if (!res.ok) throw new Error('Share file unavailable')
  const blob = await res.blob()
  const headerType = (res.headers?.get('content-type') || blob.type || '').split(';')[0].trim()
  if (blob.size === 0) throw new Error('Share file unavailable')
  if (headerType.includes('json') || headerType.includes('text/html')) {
    throw new Error('Share file unavailable')
  }
  if (
    blob.size < MIN_MEDIA_BYTES &&
    !headerType.startsWith('video/') &&
    !headerType.startsWith('image/')
  ) {
    throw new Error('Share file unavailable')
  }
  const type =
    headerType.startsWith('video/') || headerType.startsWith('image/') ? headerType : mimeType
  return new File([blob], filename, { type })
}

/** Dedupe in-flight fetches so the overlay and the CTA share one MP4 download. */
export function prefetchShareFile(
  url: string,
  filename: string,
  mimeType = 'video/mp4',
): Promise<File> {
  let pending = shareFileCache.get(url)
  if (!pending) {
    pending = fileFromMediaUrl(url, filename, mimeType).catch((error) => {
      shareFileCache.delete(url)
      throw error
    })
    shareFileCache.set(url, pending)
  }
  return pending
}

/** @internal tests */
export function resetShareFileCache() {
  shareFileCache.clear()
}
