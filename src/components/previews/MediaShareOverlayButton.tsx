'use client'

import { useEffect, useState } from 'react'
import { Check, Download, Loader2, Share2 } from 'lucide-react'
import { isTouchDevice } from '@/components/feed/utils'
import { cn } from '@/lib/utils'

/**
 * Floating share/download button pinned over preview-page media (top-right).
 *
 * On **touch devices** it opens the native share sheet (share the video to
 * another app), always visible. On desktop it downloads the file and reveals on
 * hover (`group-hover` — the parent media wrapper must be `group`). Mirrors the
 * TikTok/X preview buttons so all platforms behave the same.
 */
export function MediaShareOverlayButton({
  streamUrl,
  downloadUrl,
  title,
}: {
  /** Inline stream URL (shared via the native sheet on touch devices). */
  streamUrl: string
  /** Attachment URL (downloaded on desktop). */
  downloadUrl: string
  title: string
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
      if (isMobile && typeof navigator.share === 'function') {
        await navigator.share({
          url: new URL(streamUrl, window.location.origin).toString(),
          title,
        })
        setShowSuccess(true)
      } else {
        const link = document.createElement('a')
        link.href = downloadUrl
        link.download = ''
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        setShowSuccess(true)
      }
    } catch {
      // User cancelled the share sheet / download — silently reset.
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
