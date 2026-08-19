'use client'

/**
 * Send-the-file flow for the theater (spec §2/§8): prefetches the current
 * item's MP4 into a blob so `navigator.share` runs inside the user's tap
 * (iOS drops user-activation across an `await fetch()` — the first tap fails,
 * the second works once the video is cached; see the 2026-08-14 WORKLOG
 * entries), then shares `{ files, text: "via <canonical url>" }` — NEVER
 * `url` alongside `files` (WhatsApp concatenates them into "via URL URL").
 *
 * Desktop-fallback behavior (deliberately chosen, see `send()`): `supported`
 * is driven purely by whether the item HAS a sendable file
 * (`resolveSendSource`), not by `navigator.share` availability. Desktop
 * Chrome/Firefox have no Web Share API at all, but the button still shows and
 * still works — `send()` downloads the prefetched blob directly, mirroring
 * `handleShareMedia`'s desktop behavior (`src/components/feed/utils.tsx`).
 * This keeps one button with one coherent promise ("this always does
 * something useful") instead of hiding Send on desktop or shipping a second
 * download-only affordance.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { reelVideoSrc } from '@/components/feed/video-src'
import { previewPath } from '@/lib/activity/preview-path'
import type { TheaterItem } from './types'

export interface SendFile {
  /** False when this item has nothing sendable (no MP4/photo) — hide the button. */
  supported: boolean
  /** True once the file is prefetched and the share sheet can open in-tap. */
  ready: boolean
  /** True while a send is in flight. */
  sending: boolean
  /**
   * The verb `send()` will actually perform: `'share'` when the Web Share API
   * is available (mobile — opens the native share sheet), `'download'`
   * otherwise (desktop reality — `send()` saves the file directly). Computed
   * client-side from `typeof navigator.share === 'function'`; SSR-safe
   * default `'share'` since it only affects a label/icon, never `supported`.
   */
  mode: 'share' | 'download'
  /** Open the native share sheet (or fall back to the link). Call from a tap. */
  send: () => Promise<void>
}

/** Delay before prefetching starts — aligned with the seen-dwell threshold so
 * skimming past items doesn't download an MP4 per item (spec §5/§6). */
const PREFETCH_DELAY_MS = 2_000
const FETCH_TIMEOUT_MS = 30_000

/** Size-1 blob cache keyed by item — the rail only ever plays one item at a time. */
let cachedKey: string | null = null
let cachedBlob: Blob | null = null

/**
 * Shared in-flight prefetch. The hook is instantiated TWICE for the same item
 * (desktop Rail and the mobile chrome are both always mounted, just CSS-hidden
 * at the other breakpoint), so without this both instances would download the
 * same MP4. Whoever starts the fetch owns the AbortController; the other
 * instance just awaits the same promise.
 */
let inflightKey: string | null = null
let inflightPromise: Promise<Blob> | null = null

function prefetchBlob(key: string, mp4: string): Promise<Blob> {
  if (inflightKey === key && inflightPromise) return inflightPromise

  const controller = new AbortController()
  const abortTimer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  const promise = fetch(mp4, { signal: controller.signal })
    .then(async (res) => {
      if (!res.ok) throw new Error('Send file unavailable')
      const contentType = (res.headers.get('content-type') || '').split(';')[0].trim()
      // A proxy 200 with a JSON/HTML error body is not a video — reject it
      // before it gets shared or downloaded as garbage (the exact trap
      // `isMediaAvailable`/`fileFromMediaUrl` guard against elsewhere).
      if (contentType.includes('json') || contentType.includes('html')) {
        throw new Error('Send file unavailable')
      }
      const blob = await res.blob()
      if (blob.size === 0) throw new Error('Send file unavailable')
      cachedKey = key
      cachedBlob = blob
      return blob
    })
    .finally(() => {
      clearTimeout(abortTimer)
      if (inflightKey === key) {
        inflightKey = null
        inflightPromise = null
      }
    })

  inflightKey = key
  inflightPromise = promise
  // Prevent an unhandled-rejection warning when no instance is awaiting.
  promise.catch(() => {})
  return promise
}

type SendableItem = Pick<TheaterItem, 'platform' | 'bookmarkId' | 'author' | 'contentType'>

/**
 * Resolve the sendable MP4 for an item, or null when there's nothing to send
 * (PR 2 scope: video only — photo/text/article are a later PR). Pure, no
 * fetch — always goes through the video-src SSOT (`reelVideoSrc`), never an
 * inline per-platform URL (the regression that made Instagram fall through
 * to the Twitter proxy repeatedly).
 */
export function resolveSendSource(
  item: SendableItem | null,
): { mp4: string; filename: string } | null {
  if (!item || !item.bookmarkId) return null

  // YouTube has no MP4 mirror at all — official iframe embed only, a
  // deliberate product decision (no compliant zero-cost source exists).
  if (item.platform === 'youtube') return null

  // TikTok and Instagram are single-format platforms: always video.
  if (item.platform === 'tiktok' || item.platform === 'instagram') {
    return {
      mp4: reelVideoSrc(item as TheaterItem),
      filename: `adhx-${item.platform}-${item.bookmarkId}.mp4`,
    }
  }

  // Twitter carries text/photo/video/article — only send when it's actually a video.
  if (item.platform === 'twitter' && item.contentType === 'video') {
    return {
      mp4: reelVideoSrc(item as TheaterItem),
      filename: `adhx-twitter-${item.bookmarkId}.mp4`,
    }
  }

  return null
}

function itemKey(item: SendableItem): string {
  return `${item.platform}:${item.bookmarkId}`
}

/** Absolute canonical preview URL for the caption / link-only share. */
function canonicalUrlFor(item: TheaterItem): string {
  const path = previewPath(item.platform, item.author, item.bookmarkId || '')
  if (typeof window === 'undefined') return path
  return new URL(path, window.location.origin).toString()
}

/**
 * Build the `navigator.share` payload for a ready file send. Exported for
 * tests: asserts there is NEVER a `url` key alongside `files` — the WhatsApp
 * "via URL URL" regression the repo has already shipped a fix for once.
 */
export function buildSharePayload(file: File, canonicalUrl: string): ShareData {
  return { files: [file], text: `via ${canonicalUrl}` }
}

/** Fire-and-forget anonymous share pulse. Identifiers only — never client display fields. */
function pingSharePulse(platform: string, id: string): void {
  if (!id) return
  try {
    void fetch('/api/activity/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform, id }),
      keepalive: true,
    })
  } catch {
    // A pulse-write failure must never surface to the user.
  }
}

export function useSendFile(item: TheaterItem | null): SendFile {
  const [ready, setReady] = useState(false)
  const [sending, setSending] = useState(false)
  // SSR-safe default: 'share' until the client effect below settles it. This
  // only drives a label/icon, so a brief mismatch on desktop's first paint is
  // harmless (and avoided in practice — Rail/mobile chrome only render the
  // button once `supported` is known, by which point this has run).
  const [mode, setMode] = useState<'share' | 'download'>('share')
  const blobRef = useRef<Blob | null>(null)

  useEffect(() => {
    // 'share' only when the browser can put a FILE on the share sheet —
    // navigator.share existing alone isn't enough (some desktops expose it
    // for links only, and send() would fall through to the download path
    // while the button still said "Send").
    let canShareFiles = false
    try {
      canShareFiles =
        typeof navigator !== 'undefined' &&
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files: [new File([''], 'probe.mp4', { type: 'video/mp4' })] })
    } catch {
      canShareFiles = false
    }
    setMode(canShareFiles ? 'share' : 'download')
  }, [])

  const source = resolveSendSource(item)
  const supported = source !== null
  const key = item && source ? itemKey(item) : null

  useEffect(() => {
    // New item (or one that lost its source) — reset this instance. A shared
    // in-flight fetch is deliberately NOT aborted here: the other hook
    // instance tracks the same current item, and a superseded fetch is
    // bounded by its own 30s timeout anyway.
    setReady(false)
    blobRef.current = null

    if (!source || !key) return

    if (cachedKey === key && cachedBlob) {
      blobRef.current = cachedBlob
      setReady(true)
      return
    }

    let cancelled = false
    const delayTimer = setTimeout(() => {
      if (cancelled) return
      prefetchBlob(key, source.mp4)
        .then((blob) => {
          if (cancelled) return
          blobRef.current = blob
          setReady(true)
        })
        .catch(() => {
          // Swallow — send() falls back to a link-only share/copy when no
          // blob ever arrives. There's nothing actionable to surface here.
        })
    }, PREFETCH_DELAY_MS)

    return () => {
      cancelled = true
      clearTimeout(delayTimer)
    }
  }, [key, source?.mp4])

  const send = useCallback(async () => {
    if (!item || !source) return
    setSending(true)
    try {
      const canonicalUrl = canonicalUrlFor(item)
      const blob = blobRef.current
      const hasShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

      if (blob && hasShare) {
        const file = new File([blob], source.filename, { type: blob.type || 'video/mp4' })
        const payload = buildSharePayload(file, canonicalUrl)
        if (!navigator.canShare || navigator.canShare(payload)) {
          try {
            await navigator.share(payload)
            pingSharePulse(item.platform, item.bookmarkId || '')
            return
          } catch (err) {
            // User dismissed the sheet — a cancel, not a failure. Don't fall
            // through to a second share/download prompt.
            if (err instanceof DOMException && err.name === 'AbortError') return
            // Any other error (e.g. unsupported payload at share-time):
            // fall through to the link/download paths below.
          }
        }
      }

      // Blob not ready yet (early tap) or file-sharing unsupported — never
      // leave the tap dead. Link-only share is valid without `files`.
      if (hasShare) {
        try {
          await navigator.share({ url: canonicalUrl })
          pingSharePulse(item.platform, item.bookmarkId || '')
          return
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') return
        }
      }

      // No Web Share API at all (desktop Chrome/Firefox): download the blob
      // directly if we have it, mirroring `handleShareMedia`'s desktop path.
      if (blob) {
        const blobUrl = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = blobUrl
        link.download = source.filename
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        setTimeout(() => URL.revokeObjectURL(blobUrl), 100)
        pingSharePulse(item.platform, item.bookmarkId || '')
        return
      }

      // Last resort: no share API, no blob yet — copy the link so the tap
      // still does something.
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(canonicalUrl)
      }
    } finally {
      setSending(false)
    }
  }, [item, source])

  return { supported, ready, sending, mode, send }
}
