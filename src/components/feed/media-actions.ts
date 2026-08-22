/**
 * Share/copy/download actions for a saved item's media and preview link.
 */
import type React from 'react'
import type { FeedItem } from './types'
import { previewPath } from '@/lib/activity/preview-path'
import { fileFromMediaUrl, shareFileWithLink } from '@/lib/share/web-share'
import { PUBLIC_BASE_URL } from '@/lib/routes/base-url'
import { isTouchDevice } from './device'

/** The on-ADHX preview URL for a saved item (absolute). */
export function previewUrlForItem(item: Pick<FeedItem, 'platform' | 'author' | 'id'>): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : PUBLIC_BASE_URL
  return `${origin}${previewPath(item.platform || 'twitter', item.author, item.id)}`
}

/**
 * Copy a saved item's on-ADHX preview link to the clipboard. Returns true on
 * success. Powers the quick Share buttons in the gallery + collection mode.
 */
export async function copyPreviewLink(
  item: Pick<FeedItem, 'platform' | 'author' | 'id'>,
): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(previewUrlForItem(item))
    return true
  } catch {
    return false
  }
}

/**
 * Share a saved item's preview link via the Web Share API (the native share
 * sheet on mobile). Falls back to copying the link when the API is unavailable
 * (most desktop browsers). Returns what actually happened so the UI can show the
 * right confirmation. A user-cancelled share sheet resolves to `'cancelled'`.
 */
export async function sharePreviewLink(
  item: Pick<FeedItem, 'platform' | 'author' | 'id'>,
): Promise<'shared' | 'copied' | 'cancelled' | 'failed'> {
  const url = previewUrlForItem(item)
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ url })
      return 'shared'
    } catch (err) {
      // The user dismissing the share sheet throws AbortError — not a failure.
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled'
      // Any other error (e.g. NotAllowedError) → fall back to copy.
    }
  }
  return (await copyPreviewLink(item)) ? 'copied' : 'failed'
}

/**
 * `onError` handler for media images: if the primary (proxy) URL fails to load,
 * swap once to the source CDN `originalUrl`. The FxEmbed photo proxy occasionally
 * fails in-browser for a given photo (e.g. the first photo of a multi-image
 * tweet) even though the source pbs.twimg.com image loads fine.
 */
export function fallbackToOriginal(
  originalUrl?: string | null,
): (e: React.SyntheticEvent<HTMLImageElement>) => void {
  return (e) => {
    const el = e.currentTarget
    if (originalUrl && !el.dataset.fellBack) {
      el.dataset.fellBack = '1'
      el.src = originalUrl
    }
  }
}

/**
 * Download media helper - fetches image as blob and triggers download
 * This is necessary because the download attribute doesn't work for cross-origin URLs
 */
/**
 * Whether a media proxy URL will actually deliver a file.
 *
 * The media proxies answer with a **JSON error body** (502) when the upstream
 * mirror can't resolve the video — and an `<a download>` click, or a `.blob()`
 * with no status check, happily saves that JSON *as the .mp4*. So every download
 * path has to ask first. Instagram currently fails this for every reel (its
 * video surfaces are all closed — see the outage log in `@/lib/media/mirrors`),
 * which is exactly the "downloads are broken" symptom: a garbage file and, worse,
 * a success checkmark.
 *
 * HEAD is cheap here: Next auto-handles it for a GET route handler, and the
 * mirror resolver gives up immediately on a non-retryable upstream 404.
 */
export async function isMediaAvailable(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD' })
    return response.ok
  } catch {
    return false
  }
}

/**
 * Download a media URL as `filename`. Returns whether a file was actually
 * saved, so callers can show an honest failure instead of a silent no-op.
 */
export async function handleDownloadMedia(
  e: React.MouseEvent,
  url: string,
  filename: string,
): Promise<boolean> {
  e.stopPropagation()
  e.preventDefault()

  try {
    const response = await fetch(url)
    // Without this the error JSON gets saved as the video file.
    if (!response.ok) return false
    const blob = await response.blob()
    const blobUrl = URL.createObjectURL(blob)

    const link = document.createElement('a')
    link.href = blobUrl
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    // Clean up the blob URL after a short delay
    setTimeout(() => URL.revokeObjectURL(blobUrl), 100)
    return true
  } catch (error) {
    // Log error but don't open in new tab - download should just fail silently
    console.error('Download failed:', error)
    return false
  }
}

// Size threshold for mobile video download/sharing (50MB)
const MOBILE_VIDEO_SIZE_LIMIT = 50 * 1024 * 1024

/**
 * Format bytes to human-readable size string
 */
export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)}MB`
  return `${(bytes / 1024).toFixed(0)}KB`
}

export interface ShareMediaResult {
  success: boolean
  method: 'share' | 'download'
  tooLargeForMobile?: boolean
  estimatedSize?: number
}

/**
 * Share or download media - uses Web Share API on mobile, downloads directly on desktop
 * This enables native share sheets on touch devices (WhatsApp, Messages, etc.)
 * Desktop browsers skip the share API entirely for a better UX
 *
 * For videos on desktop: Uses streaming download endpoint for instant start with progress
 * For videos on mobile: Checks size first, warns if >50MB to avoid memory issues
 * For images: Uses blob approach (small files, works everywhere)
 */
export async function handleShareMedia(
  e: React.MouseEvent,
  url: string,
  filename: string,
  mimeType: string = 'image/jpeg',
  options?: { pageUrl?: string },
): Promise<ShareMediaResult> {
  e.stopPropagation()
  e.preventDefault()

  const isVideo = mimeType.startsWith('video/')

  // Extract author and tweetId from video proxy URL
  const getVideoParams = () => {
    const urlParams = new URL(url, window.location.origin).searchParams
    return {
      author: urlParams.get('author'),
      tweetId: urlParams.get('tweetId'),
    }
  }

  // Check device type FIRST - desktop should always download directly
  // This fixes the issue where desktop Chrome supports navigator.canShare
  // but shows a clunky share sheet instead of downloading
  if (!isTouchDevice()) {
    // For videos on desktop, use streaming download for instant start with progress
    if (isVideo) {
      const { author, tweetId } = getVideoParams()

      if (author && tweetId) {
        // Use the streaming download endpoint (HD quality for bandwidth efficiency)
        const downloadUrl = `/api/media/video/download?author=${encodeURIComponent(author)}&tweetId=${encodeURIComponent(tweetId)}&quality=hd`
        const link = document.createElement('a')
        link.href = downloadUrl
        link.download = '' // Server sets filename via Content-Disposition
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        return { success: true, method: 'download' }
      }
    }

    // For images (and fallback for videos), use blob approach
    try {
      const response = await fetch(url)
      const blob = await response.blob()
      const blobUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      setTimeout(() => URL.revokeObjectURL(blobUrl), 100)
      return { success: true, method: 'download' }
    } catch (error) {
      console.error('Download failed:', error)
      return { success: false, method: 'download' }
    }
  }

  // MOBILE: Check video size before attempting share
  if (isVideo) {
    const { author, tweetId } = getVideoParams()

    if (author && tweetId) {
      try {
        // Fetch video info to check size. withSizes=true triggers HEAD requests
        // upstream so we get actual byte counts — playback flow skips this.
        const infoResponse = await fetch(
          `/api/media/video/info?author=${encodeURIComponent(author)}&tweetId=${encodeURIComponent(tweetId)}&withSizes=true`,
        )

        if (infoResponse.ok) {
          const info = await infoResponse.json()
          // Check HD quality size (720p) - reasonable for mobile sharing
          // Falls back to full if HD not available
          const hdFormat = info.formats?.find((f: { quality: string }) => f.quality === 'hd')
          const fullFormat = info.formats?.find((f: { quality: string }) => f.quality === 'full')
          const estimatedSize = hdFormat?.estimatedSize || fullFormat?.estimatedSize || 0

          if (estimatedSize > MOBILE_VIDEO_SIZE_LIMIT) {
            // Video too large for mobile - return warning
            return {
              success: false,
              method: 'share',
              tooLargeForMobile: true,
              estimatedSize,
            }
          }
        }
      } catch (error) {
        // If size check fails, proceed anyway (user can cancel if too slow)
        console.warn('Failed to check video size:', error)
      }
    }
  }

  // Mobile: try Web Share API, fall back to download
  try {
    const file = await fileFromMediaUrl(url, filename, mimeType)

    // Check if file sharing is supported (mobile browsers)
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await shareFileWithLink(file, { pageUrl: options?.pageUrl })
      return { success: true, method: 'share' }
    }

    // Fallback to download for mobile browsers without share support
    const blobUrl = URL.createObjectURL(file)
    const link = document.createElement('a')
    link.href = blobUrl
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    setTimeout(() => URL.revokeObjectURL(blobUrl), 100)

    return { success: true, method: 'download' }
  } catch (error) {
    // AbortError means user cancelled the share sheet - still counts as handled
    if (error instanceof Error && error.name === 'AbortError') {
      return { success: true, method: 'share' }
    }
    console.error('Share failed:', error)
    return { success: false, method: 'share' }
  }
}
