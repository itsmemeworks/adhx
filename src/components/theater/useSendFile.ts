'use client'

import { keptSrc } from '@/lib/keep/src'

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
import { pingSharePulse } from '@/lib/activity/ping-share'
import { pingAnalytic } from '@/lib/analytics/client'
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
  send: () => Promise<boolean>
  /** Force a browser download, even on touch devices that can share files. */
  download: () => boolean | Promise<boolean>
  error?: string | null
  notice?: string | null
}

/** Delay before prefetching starts — aligned with the seen-dwell threshold so
 * skimming past items doesn't download a file per item (spec §5/§6). */
const PREFETCH_DELAY_MS = 2_000
const FETCH_TIMEOUT_MS = 30_000

/** Size-1 blob cache keyed by item — the rail only ever plays one item at a time. */
let cachedKey: string | null = null
let cachedBlob: Blob | null = null

/** Bound both concurrent transfers and retained bytes, including unknown-length responses. */
export const MAX_SEND_FILE_BYTES = 64 * 1024 * 1024
class SendFileTooLarge extends Error {}
type Transfer = {
  key: string
  controller: AbortController
  promise: Promise<Blob>
  explicit: boolean
}
let transfer: Transfer | null = null
const consumers = new Map<string, number>()

function retainSource(key: string): () => void {
  consumers.set(key, (consumers.get(key) ?? 0) + 1)
  return () => {
    const remaining = (consumers.get(key) ?? 1) - 1
    if (remaining) consumers.set(key, remaining)
    else consumers.delete(key)
    // Both responsive controls share the transfer. StrictMode can reattach
    // synchronously; abort only when its last consumer really left.
    queueMicrotask(() => {
      if (consumers.has(key)) return
      if (transfer?.key === key && !transfer.explicit) transfer.controller.abort()
      if (cachedKey === key) {
        cachedKey = null
        cachedBlob = null
      }
    })
  }
}

function prefetchBlob(key: string, mp4: string, explicit = false): Promise<Blob> {
  if (cachedKey === key && cachedBlob) return Promise.resolve(cachedBlob)
  if (transfer?.key === key && !transfer.controller.signal.aborted) {
    transfer.explicit ||= explicit
    return transfer.promise
  }
  // A tap's download keeps its slot; speculative work for another video waits.
  if (transfer?.explicit && !explicit) {
    const resume = () => {
      if (!consumers.has(key)) throw new DOMException('Download cancelled', 'AbortError')
      return prefetchBlob(key, mp4)
    }
    return transfer.promise.then(resume, resume)
  }
  transfer?.controller.abort()
  const controller = new AbortController()
  const abortTimer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  const entry: Transfer = {
    key,
    controller,
    explicit,
    promise: fetch(mp4, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error('Send file unavailable')
        const contentType = (res.headers.get('content-type') || '').split(';')[0].trim()
        if (contentType.includes('json') || contentType.includes('html')) {
          await res.body?.cancel()
          throw new Error('Send file unavailable')
        }
        if (Number(res.headers.get('content-length')) > MAX_SEND_FILE_BYTES) {
          await res.body?.cancel()
          throw new SendFileTooLarge('Use the streaming download for this file')
        }
        if (!res.body) throw new Error('Send file unavailable')
        const reader = res.body.getReader()
        const chunks: ArrayBuffer[] = []
        let bytes = 0
        try {
          for (;;) {
            const chunk = await reader.read()
            if (chunk.done) break
            bytes += chunk.value.byteLength
            if (bytes > MAX_SEND_FILE_BYTES)
              throw new SendFileTooLarge('Use the streaming download for this file')
            chunks.push(chunk.value.slice().buffer as ArrayBuffer)
          }
        } finally {
          await reader.cancel().catch(() => {})
        }
        if (controller.signal.aborted) throw new DOMException('Download cancelled', 'AbortError')
        if (!bytes) throw new Error('Send file unavailable')
        const blob = new Blob(chunks, { type: contentType })
        if (consumers.has(key)) {
          cachedKey = key
          cachedBlob = blob
        }
        return blob
      })
      .finally(() => {
        clearTimeout(abortTimer)
        if (transfer === entry) transfer = null
      }),
  }
  transfer = entry
  entry.promise.catch(() => {})
  return entry.promise
}

type SendableItem = Pick<TheaterItem, 'platform' | 'bookmarkId' | 'author' | 'contentType'>

export interface SendSource {
  /** Inline proxy URL fetched into a blob for native file sharing. */
  src: string
  /** Same-origin attachment endpoint used by the explicit Download option. */
  downloadSrc: string
  filename: string
  /** Drives the fallback MIME (when the fetched blob carries no usable
   * Content-Type) and the button's title copy. */
  kind: 'video' | 'photo'
}

/**
 * Resolve the sendable file for an item, or null when there's nothing to send
 * (text/article/quote posts).
 * Pure, no fetch — video always goes through the video-src SSOT
 * (`reelVideoSrc`), never an inline per-platform URL (the regression that
 * made Instagram fall through to the Twitter proxy repeatedly). Twitter
 * photo posts go through the `/api/media/image` proxy's `download=1`
 * variant. Multi-photo and multi-video tweets send the FIRST clip only
 * (no picker in the Send button).
 */
export function resolveSendSource(item: SendableItem | null): SendSource | null {
  if (!item || !item.bookmarkId) return null
  const platform = item.platform || 'twitter'
  const id = item.bookmarkId
  if ((platform === 'twitter' || platform === 'tiktok') && !item.author) return null

  if (item.contentType === 'photo') {
    const src = keptSrc(platform, id, 'photo-1', item.author, { download: true })
    return { src, downloadSrc: src, filename: `adhx-${platform}-${id}.jpg`, kind: 'photo' }
  }
  const isVideo = item.contentType === 'video' || platform === 'tiktok' || platform === 'instagram'
  if (isVideo) {
    return {
      src: reelVideoSrc(item as TheaterItem),
      downloadSrc: keptSrc(platform, id, 'video-1', item.author, { download: true }),
      filename: `adhx-${platform}-${id}.mp4`,
      kind: 'video',
    }
  }
  return null
}

export function sendSourceKey(item: SendableItem, source: SendSource): string {
  return `${item.platform}:${item.bookmarkId}:${item.contentType ?? 'unknown'}:${source.src}`
}

/** Absolute canonical preview URL for the caption / link-only share. */
function canonicalUrlFor(item: TheaterItem): string {
  const path = previewPath(item.platform, item.author, item.bookmarkId || '', item.contentType)
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

export function useSendFile(
  item: TheaterItem | null,
  { eager = false }: { eager?: boolean } = {},
): SendFile {
  const [ready, setReady] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
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
  const key = item && source ? sendSourceKey(item, source) : null

  useEffect(() => {
    // Each responsive control retains the current source; its last release
    // cancels obsolete speculative work without interrupting a user download.
    setReady(false)
    setPrimed(false)
    setError(null)
    setNotice(null)
    blobRef.current = null

    if (!source || !key) return
    const release = retainSource(key)

    if (cachedKey === key && cachedBlob) {
      blobRef.current = cachedBlob
      setReady(true)
      return release
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
      release()
    }
  }, [key, source?.src, eager])

  const download = useCallback(async () => {
    if (!item || !source || !key) return false
    setSending(true)
    setError(null)
    try {
      // Verify the file before reporting success. An attachment URL can return
      // an error page after an anchor click, which the page cannot observe.
      const blob = blobRef.current ?? (await prefetchBlob(key, source.src, true))
      const blobUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = source.filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1_000)
      pingSharePulse(item.platform, item.bookmarkId || '')
      pingAnalytic('post.send', {
        platform: item.platform,
        id: item.bookmarkId || undefined,
        source: 'download',
      })
      return true
    } catch (error) {
      if (error instanceof SendFileTooLarge) {
        const link = document.createElement('a')
        link.href = source.downloadSrc
        link.download = source.filename
        document.body.appendChild(link)
        link.click()
        link.remove()
        setNotice('Downloading the full file through your browser.')
        return true
      }
      setError("Couldn't get the file. Try again or use Share link.")
      return false
    } finally {
      setSending(false)
    }
  }, [item, source, key])

  const send = useCallback(async () => {
    if (!item || !source) return false
    if (mode === 'download') return download()
    setError(null)
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
      // Native file sharing requires the bytes before opening the sheet.
      // Download mode is handled by the verified-file action above.
      if (!blob && key && wantsShare) {
        try {
          blob = await prefetchBlob(key, source.src, true)
          blobRef.current = blob
          setReady(true)
        } catch (error) {
          if (error instanceof SendFileTooLarge) return await download()
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
            pingAnalytic('post.send', {
              platform: item.platform,
              id: item.bookmarkId || undefined,
              source: 'share',
            })
            return true
          } catch (err) {
            // User dismissed the sheet — a cancel, not a failure. Don't fall
            // through to a second share/download prompt.
            if (err instanceof DOMException && err.name === 'AbortError') return false
            // Activation expired while we fetched the file (both iOS and
            // Chrome consume transient activation across an `await`). The file
            // IS cached now, so a second tap shares it inside its own gesture
            // — say so instead of quietly downgrading this tap to a link,
            // which is the failure the owner reported.
            if (err instanceof DOMException && err.name === 'NotAllowedError') {
              setPrimed(true)
              return false
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
          return true
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') return false
        }
      }

      // A failed native share can still hand the verified file to the browser.
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
        pingAnalytic('post.send', {
          platform: item.platform,
          id: item.bookmarkId || undefined,
          source: 'download',
        })
        return true
      }

      // If the sharing API disappeared after mode detection, use the same
      // verified download path; an anchor URL alone cannot prove success.
      if (!wantsShare) {
        return await download()
      }

      // Last resort (share mode, share failed, no blob): copy the link so
      // the tap still does something.
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        try {
          await navigator.clipboard.writeText(canonicalUrl)
          return true
        } catch {
          return false
        }
      }
      return false
    } finally {
      setSending(false)
    }
  }, [item, source, mode, key, download])

  return { supported, ready, sending, primed, mode, send, download, error, notice }
}
