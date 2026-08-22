'use client'

/**
 * Send-the-file flow for the theater (spec §2/§8): prefetches the current
 * item's file (video MP4 or, for Twitter photo posts, the primary image)
 * into a blob so `navigator.share` runs inside the user's tap (iOS drops
 * user-activation across an `await fetch()` — the first tap fails, the
 * second works once the file is cached; see the 2026-08-14 WORKLOG entries),
 * then shares `{ files, text: "via <canonical url>" }` — NEVER `url`
 * alongside `files` (WhatsApp concatenates them into "via URL URL").
 *
 * Desktop behavior (deliberately chosen, see `send()`): `supported` is driven
 * purely by whether the item HAS a sendable file (`resolveSendSource`), and on
 * a desktop PLATFORM (`getPlatformType()`, UA-based) `send()` ALWAYS downloads
 * — never `navigator.share`, even where desktop Safari/Chrome expose it. The
 * button says "Download" there, and a macOS share sheet on click reads as a
 * bug (user review 2026-08-19). Mirrors `handleShareMedia`'s desktop behavior
 * (`src/components/feed/utils.tsx`). This keeps one button with one coherent
 * promise ("this always does something useful") instead of hiding Send on
 * desktop or shipping a second download-only affordance.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { reelVideoSrc } from '@/components/feed/video-src'
import { previewPath } from '@/lib/activity/preview-path'
import { getPlatformType } from '@/lib/platform'
import type { TheaterItem } from './types'

export interface SendFile {
  /** False when this item has nothing sendable (no MP4/photo) — hide the button. */
  supported: boolean
  /** True once the file is prefetched and the share sheet can open in-tap. */
  ready: boolean
  /** True while a send is in flight — INCLUDING the file fetch a tap kicks off
   * when the prefetch hasn't finished. The button must keep its spinner up for
   * the whole of this (owner: "it needs to be smart enough that when you tap
   * download, it keeps the spinner going until it has the file to send"). */
  sending: boolean
  /**
   * The file is now cached but the share sheet was refused because the tap's
   * user activation expired while fetching it (iOS/Android both drop
   * activation across an `await`). One more tap shares the real file
   * instantly. Cleared on a successful send and whenever the item changes.
   */
  primed: boolean
  /**
   * The verb `send()` will actually perform: `'share'` only on a touch
   * platform (iOS/Android) whose browser can put a FILE on the share sheet;
   * `'download'` everywhere else — including desktop browsers that DO expose
   * `navigator.share` (the desktop button says Download, so it downloads).
   * Settled client-side in an effect; SSR-safe default `'share'` since it
   * only affects a label/icon, never `supported`.
   */
  mode: 'share' | 'download'
  /** Open the native share sheet (or fall back to the link). Call from a tap. */
  send: () => Promise<void>
}

/** Delay before prefetching starts — aligned with the seen-dwell threshold so
 * skimming past items doesn't download a file per item (spec §5/§6). */
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

export interface SendSource {
  /** The file's proxy/CDN URL — fetched into a blob for share/download. */
  src: string
  filename: string
  /** Drives the fallback MIME (when the fetched blob carries no usable
   * Content-Type) and the button's title copy. */
  kind: 'video' | 'photo'
}

/**
 * Resolve the sendable file for an item, or null when there's nothing to send
 * (text/article/quote posts, YouTube — no free MP4 mirror exists there).
 * Pure, no fetch — video always goes through the video-src SSOT
 * (`reelVideoSrc`), never an inline per-platform URL (the regression that
 * made Instagram fall through to the Twitter proxy repeatedly). Twitter
 * photo posts go through the `/api/media/image` proxy's `download=1`
 * variant, downloading the FIRST/primary photo only (multi-photo posts keep
 * it simple — no photo picker in the Send button).
 */
export function resolveSendSource(item: SendableItem | null): SendSource | null {
  if (!item || !item.bookmarkId) return null

  // YouTube has no MP4 mirror at all — official iframe embed only, a
  // deliberate product decision (no compliant zero-cost source exists).
  if (item.platform === 'youtube') return null

  // TikTok and Instagram are single-format platforms: always video.
  if (item.platform === 'tiktok' || item.platform === 'instagram') {
    return {
      src: reelVideoSrc(item as TheaterItem),
      filename: `adhx-${item.platform}-${item.bookmarkId}.mp4`,
      kind: 'video',
    }
  }

  // Twitter carries text/photo/video/article.
  if (item.platform === 'twitter' && item.contentType === 'video') {
    return {
      src: reelVideoSrc(item as TheaterItem),
      filename: `adhx-twitter-${item.bookmarkId}.mp4`,
      kind: 'video',
    }
  }
  if (item.platform === 'twitter' && item.contentType === 'photo' && item.author) {
    return {
      src: `/api/media/image?author=${encodeURIComponent(item.author)}&tweetId=${encodeURIComponent(item.bookmarkId)}&index=1&download=1`,
      filename: `adhx-twitter-${item.bookmarkId}.jpg`,
      kind: 'photo',
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

export function useSendFile(
  item: TheaterItem | null,
  { eager = false }: { eager?: boolean } = {},
): SendFile {
  const [ready, setReady] = useState(false)
  const [sending, setSending] = useState(false)
  // SSR-safe default: 'share' until the client effect below settles it. This
  // only drives a label/icon, so a brief mismatch on desktop's first paint is
  // harmless (and avoided in practice — Rail/mobile chrome only render the
  // button once `supported` is known, by which point this has run).
  const [mode, setMode] = useState<'share' | 'download'>('share')
  const [primed, setPrimed] = useState(false)
  const blobRef = useRef<Blob | null>(null)

  useEffect(() => {
    // Desktop platform is ALWAYS 'download' — desktop Safari/Chrome expose
    // navigator.share these days, but the desktop button is labeled Download
    // and a macOS share sheet on click reads as a bug. On touch platforms,
    // 'share' only when the browser can put a FILE on the share sheet —
    // navigator.share existing alone isn't enough (some browsers expose it
    // for links only, and send() would fall through to the download path
    // while the button still said "Send").
    if (getPlatformType() === 'desktop') {
      setMode('download')
      return
    }
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
    setPrimed(false)
    blobRef.current = null

    if (!source || !key) return

    if (cachedKey === key && cachedBlob) {
      blobRef.current = cachedBlob
      setReady(true)
      return
    }

    let cancelled = false
    // `eager` skips the skim guard: on a shared preview page there's one post
    // the visitor followed a link FOR, and it's pinned and repeating rather
    // than skimmed past — so start immediately and the file is usually ready
    // before any realistic tap, which is the only way to share it inside the
    // tap's own activation.
    const delayTimer = setTimeout(
      () => {
        if (cancelled) return
        prefetchBlob(key, source.src)
          .then((blob) => {
            if (cancelled) return
            blobRef.current = blob
            setReady(true)
          })
          .catch(() => {
            // Swallow — send() falls back to a link-only share/copy when no
            // blob ever arrives. There's nothing actionable to surface here.
          })
      },
      eager ? 0 : PREFETCH_DELAY_MS,
    )

    return () => {
      cancelled = true
      clearTimeout(delayTimer)
    }
  }, [key, source?.src, eager])

  const send = useCallback(async () => {
    if (!item || !source) return
    setSending(true)
    try {
      const canonicalUrl = canonicalUrlFor(item)
      const hasShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
      // The settled mode gates the share paths — desktop (mode 'download')
      // never opens a share sheet even though its browser may have one.
      const wantsShare = mode === 'share' && hasShare

      /**
       * Tapped before the prefetch finished. This used to fall straight
       * through to a link-only share, so a tap 1s into a 3MB video put a URL
       * on the WhatsApp message instead of the file — the whole point of the
       * button (owner report). Now the tap WAITS for the file, spinner up
       * (`sending` is still true), joining the in-flight prefetch rather than
       * starting a second download. Only a genuine fetch failure falls
       * through to the link paths below.
       */
      let blob = blobRef.current
      // Only the SHARE path needs the bytes in hand — `navigator.share` can't
      // be handed a URL to fetch. Download mode keeps its old streaming
      // anchor (below): waiting on a full in-memory buffer of a 1080p video
      // behind a spinner is strictly worse than the browser's own download
      // progress, and this fix was only ever about the share sheet.
      if (!blob && key && wantsShare) {
        try {
          blob = await prefetchBlob(key, source.src)
          blobRef.current = blob
          setReady(true)
        } catch {
          // No file to be had — the fallbacks below still make the tap useful.
        }
      }

      if (blob && wantsShare) {
        const fallbackType = source.kind === 'photo' ? 'image/jpeg' : 'video/mp4'
        const file = new File([blob], source.filename, { type: blob.type || fallbackType })
        const payload = buildSharePayload(file, canonicalUrl)
        if (!navigator.canShare || navigator.canShare(payload)) {
          try {
            await navigator.share(payload)
            setPrimed(false)
            pingSharePulse(item.platform, item.bookmarkId || '')
            return
          } catch (err) {
            // User dismissed the sheet — a cancel, not a failure. Don't fall
            // through to a second share/download prompt.
            if (err instanceof DOMException && err.name === 'AbortError') return
            // Activation expired while we fetched the file (both iOS and
            // Chrome consume transient activation across an `await`). The file
            // IS cached now, so a second tap shares it inside its own gesture
            // — say so instead of quietly downgrading this tap to a link,
            // which is the failure the owner reported.
            if (err instanceof DOMException && err.name === 'NotAllowedError') {
              setPrimed(true)
              return
            }
            // Any other error (e.g. unsupported payload at share-time):
            // fall through to the link/download paths below.
          }
        }
      }

      // The file could not be fetched at all (dead proxy/mirror), or the
      // payload was rejected — never leave the tap dead. Link-only share is
      // valid without `files`. NOT the early-tap path any more: that now waits
      // for the file above.
      if (wantsShare) {
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

      // Download mode with no blob yet (early click): stream the same-origin
      // proxy URL through an anchor download instead of leaving the click
      // dead — the browser saves the file as it streams.
      if (!wantsShare) {
        const link = document.createElement('a')
        link.href = source.src
        link.download = source.filename
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        pingSharePulse(item.platform, item.bookmarkId || '')
        return
      }

      // Last resort (share mode, share failed, no blob): copy the link so
      // the tap still does something.
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(canonicalUrl)
      }
    } finally {
      setSending(false)
    }
  }, [item, source, mode, key])

  return { supported, ready, sending, primed, mode, send }
}
