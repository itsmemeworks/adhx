/**
 * Web Share helpers for sending a media FILE plus the ADHX preview link.
 *
 * WhatsApp / iMessage often ignore `url` when `files` are present, so the
 * preview URL also goes in `text` (`via https://adhx.com/…`). Some browsers
 * throw if `files` + `url` are combined — we try that first, then degrade.
 */

export function shareCaption(pageUrl?: string): string | undefined {
  if (!pageUrl) return undefined
  return `via ${pageUrl}`
}

export interface ShareFileWithLinkOptions {
  title?: string
  /** Canonical ADHX preview URL to attach as the caption / link. */
  pageUrl?: string
}

/**
 * Share `file` via the native sheet, attaching `pageUrl` when the browser
 * allows it. Throws `AbortError` when the user dismisses the sheet (callers
 * treat that as success). Throws a different error if every payload fails.
 */
export async function shareFileWithLink(
  file: File,
  opts: ShareFileWithLinkOptions = {},
): Promise<void> {
  const { title, pageUrl } = opts
  const text = shareCaption(pageUrl)

  const attempts: ShareData[] = []
  if (pageUrl) {
    attempts.push({ files: [file], title, text, url: pageUrl })
    attempts.push({ files: [file], title, text })
  }
  attempts.push({ files: [file], title })

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
