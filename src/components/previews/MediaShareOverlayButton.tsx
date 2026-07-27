'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, Check, Download, Loader2, Share2 } from 'lucide-react'
import { isTouchDevice, isMediaAvailable } from '@/components/feed/utils'
import { cn } from '@/lib/utils'

/**
 * Floating share/download button pinned over preview-page media (top-right).
 *
 * On **touch devices** it fetches the video and opens the native share sheet
 * with the actual FILE (`navigator.share({ files })`) — so it shares the video
 * to another app, not just a link. On desktop it downloads the file and reveals
 * on hover (`group-hover` — the parent media wrapper must be `group`). Matches
 * the X preview's `handleShareMedia` behaviour; used by Instagram + TikTok.
 */
export function MediaShareOverlayButton({
  streamUrl,
  downloadUrl,
  filename,
  title,
  mimeType = 'video/mp4',
}: {
  /** Inline stream URL — fetched to a Blob to share the file on touch devices. */
  streamUrl: string
  /** Attachment URL — used for the direct desktop download. */
  downloadUrl: string
  /** Filename for the shared/downloaded file. */
  filename: string
  title?: string
  mimeType?: string
}) {
  const [isLoading, setIsLoading] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [failed, setFailed] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    setIsMobile(isTouchDevice())
  }, [])

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    setIsLoading(true)
    setFailed(false)
    try {
      // Desktop: download directly (the share sheet is clunky on desktop).
      if (!isMobile) {
        // Ask before saving: on an unresolvable video the proxy answers with a
        // JSON error that `<a download>` would write out as the .mp4.
        if (!(await isMediaAvailable(downloadUrl))) {
          setFailed(true)
          return
        }
        const link = document.createElement('a')
        link.href = downloadUrl
        link.download = ''
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        setShowSuccess(true)
        return
      }

      // Touch: share the actual video FILE via the native sheet.
      const streamed = await fetch(streamUrl)
      // fetch() doesn't throw on 502, so without this the error JSON gets
      // wrapped in a File and shared as if it were the video.
      if (!streamed.ok) {
        setFailed(true)
        return
      }
      const blob = await streamed.blob()
      const file = new File([blob], filename, { type: mimeType })

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title })
        setShowSuccess(true)
        return
      }

      // No file-share support → download the blob instead.
      const blobUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      setTimeout(() => URL.revokeObjectURL(blobUrl), 100)
      setShowSuccess(true)
    } catch (error) {
      // AbortError = user dismissed the share sheet; anything else is a failure.
      if (error instanceof Error && error.name === 'AbortError') setShowSuccess(true)
      else setFailed(true)
    } finally {
      setIsLoading(false)
      setTimeout(() => {
        setShowSuccess(false)
        setFailed(false)
      }, 2500)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={isLoading}
      className={cn(
        'rounded-full p-2 transition-all disabled:opacity-80',
        failed ? 'bg-black/75' : 'bg-black/60 hover:bg-black/80',
        isMobile || failed ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
      )}
      title={
        failed
          ? "This video isn't downloadable — the source blocks it. Open the original instead."
          : isMobile
            ? 'Share'
            : 'Download'
      }
      aria-label={
        failed ? 'Video unavailable to download' : isMobile ? 'Share video' : 'Download video'
      }
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-white" />
      ) : failed ? (
        <AlertCircle className="h-4 w-4 text-white" />
      ) : showSuccess ? (
        <Check className="h-4 w-4 text-white" />
      ) : isMobile ? (
        <Share2 className="h-4 w-4 text-white" />
      ) : (
        <Download className="h-4 w-4 text-white" />
      )}
    </button>
  )
}
