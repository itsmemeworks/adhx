'use client'

import { useEffect, useState } from 'react'
import { Check, Download, Loader2, Share2 } from 'lucide-react'
import { isTouchDevice } from '@/components/feed/utils'
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
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    setIsMobile(isTouchDevice())
  }, [])

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    setIsLoading(true)
    try {
      // Desktop: download directly (the share sheet is clunky on desktop).
      if (!isMobile) {
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
      const blob = await (await fetch(streamUrl)).blob()
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
      // AbortError = user dismissed the share sheet; anything else we just reset.
      if (error instanceof Error && error.name === 'AbortError') setShowSuccess(true)
    } finally {
      setIsLoading(false)
      setTimeout(() => setShowSuccess(false), 1500)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={isLoading}
      className={cn(
        'rounded-full bg-black/60 p-2 transition-all hover:bg-black/80 disabled:opacity-80',
        isMobile ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
      )}
      title={isMobile ? 'Share' : 'Download'}
      aria-label={isMobile ? 'Share video' : 'Download video'}
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-white" />
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
