'use client'

import { useEffect, useRef, useState } from 'react'
import { previewPath } from '@/lib/activity/preview-path'
import { pingAnalytic } from '@/lib/analytics/client'
import type { TheaterItem } from './types'

/**
 * Copy-link + copy-caption flashes shared by desktop and mobile chrome.
 * Mobile share-link still uses navigator.share first; this hook is the
 * clipboard path both surfaces already had.
 */
export function useTheaterCopy(current: TheaterItem | null, caption: string) {
  const [linkCopied, setLinkCopied] = useState(false)
  const [textCopied, setTextCopied] = useState(false)
  const linkTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const textTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (linkTimeout.current) clearTimeout(linkTimeout.current)
      if (textTimeout.current) clearTimeout(textTimeout.current)
    },
    [],
  )

  const copyLink = async () => {
    if (!current) return
    try {
      const path = previewPath(current.platform, current.author, current.bookmarkId || '')
      const url = new URL(path, window.location.origin).toString()
      await navigator.clipboard.writeText(url)
      pingAnalytic('post.copy', {
        platform: current.platform,
        id: current.bookmarkId || undefined,
      })
      setLinkCopied(true)
      if (linkTimeout.current) clearTimeout(linkTimeout.current)
      linkTimeout.current = setTimeout(() => setLinkCopied(false), 1600)
    } catch {
      // Clipboard denial has nothing actionable to surface.
    }
  }

  const copyText = async () => {
    if (!caption) return
    try {
      await navigator.clipboard.writeText(caption)
      setTextCopied(true)
      if (textTimeout.current) clearTimeout(textTimeout.current)
      textTimeout.current = setTimeout(() => setTextCopied(false), 1600)
    } catch {
      // Clipboard denial has nothing actionable to surface.
    }
  }

  return { linkCopied, textCopied, copyLink, copyText }
}
