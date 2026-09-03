'use client'

import { useEffect, useRef, useState } from 'react'
import { previewPath } from '@/lib/activity/preview-path'
import { pingAnalytic } from '@/lib/analytics/client'
import { composeArticleCopy, fetchArticleMarkdown } from '@/lib/theater/article-body'
import { inferType } from '@/lib/trending/filter'
import type { TheaterItem } from './types'

/**
 * Copy-link + copy-caption flashes shared by desktop and mobile chrome.
 * Mobile share-link still uses navigator.share first; this hook is the
 * clipboard path both surfaces already had.
 *
 * Articles copy the markdown body from `/api/share/tweet` (same payload
 * the stage reader uses) — `item.text` is only the title.
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

  // Warm the article body so Copy article can write inside the tap
  // (Safari drops user-activation across an awaited fetch).
  useEffect(() => {
    if (!current || inferType(current) !== 'article') return
    if (current.platform !== 'twitter' || !current.author || !current.bookmarkId) return
    void fetchArticleMarkdown(current.author, current.bookmarkId)
  }, [current])

  const copyLink = async () => {
    if (!current) return false
    try {
      const path = previewPath(
        current.platform,
        current.author,
        current.bookmarkId || '',
        current.contentType,
      )
      const url = new URL(path, window.location.origin).toString()
      await navigator.clipboard.writeText(url)
      pingAnalytic('post.copy', {
        platform: current.platform,
        id: current.bookmarkId || undefined,
      })
      setLinkCopied(true)
      if (linkTimeout.current) clearTimeout(linkTimeout.current)
      linkTimeout.current = setTimeout(() => setLinkCopied(false), 1600)
      return true
    } catch {
      // Clipboard denial has nothing actionable to surface.
      return false
    }
  }

  const copyText = async () => {
    if (!current) return false
    let payload = caption
    if (
      inferType(current) === 'article' &&
      current.platform === 'twitter' &&
      current.author &&
      current.bookmarkId
    ) {
      const markdown = await fetchArticleMarkdown(current.author, current.bookmarkId)
      if (markdown) payload = composeArticleCopy(caption, markdown)
    }
    if (!payload) return false
    try {
      await navigator.clipboard.writeText(payload)
      setTextCopied(true)
      if (textTimeout.current) clearTimeout(textTimeout.current)
      textTimeout.current = setTimeout(() => setTextCopied(false), 1600)
      return true
    } catch {
      // Clipboard denial has nothing actionable to surface.
      return false
    }
  }

  return { linkCopied, textCopied, copyLink, copyText }
}
