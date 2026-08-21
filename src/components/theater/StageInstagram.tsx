'use client'

/**
 * Instagram Reel stage (spec §6/§11): NEVER attaches `<video src>` until the
 * mirror proxy answers a Range probe with 200/206 (`probeInstagramVideo`) —
 * vxinstagram's cold cache can 404-retry for ~10–20s and a media element
 * aborts sooner than that, which used to surface as a false "failed to load"
 * (see `instagram-playback.ts`). While probing: poster + a small spinner for
 * ≤3s, then poster + a quiet "starting…" line — never a black void. Once the
 * probe confirms the mirror, this renders `StageVideo` itself (same chrome:
 * tap-for-sound, progress bar, replay + "↓ next") rather than duplicating it.
 * A persistent miss falls back to Instagram's official embed.
 */

import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Loader2 } from 'lucide-react'
import {
  instagramEmbedUrl,
  instagramVideoSrc,
  probeInstagramVideo,
} from '@/lib/media/instagram-playback'
import { previewPath } from '@/lib/activity/preview-path'
import { StageVideo } from './StageVideo'
import { StageFrame } from './stage-primitives'
import type { TheaterItem } from './types'

export interface StageInstagramProps {
  item: TheaterItem
  muted: boolean
  onRequestUnmute: () => void
  onEnded?: () => void
  /** shared-post-repeat: forwarded straight through to the StageVideo it renders once the mirror is ready. */
  repeat?: boolean
}

type ProbeStatus = 'probing' | 'ready' | 'failed'

/** Cap the visible "probing" wait at 3s before switching to the quieter status line (spec §11). */
const INSTAGRAM_SPINNER_MS = 3_000

/**
 * The official IG-embed fallback (persistent mirror miss) never fires
 * `ended` — it's a bare iframe we don't control. In auto-advance contexts
 * (an `onEnded` prop, `repeat` false), give a viewer a moment to notice the
 * embed, then move the queue along rather than parking on it forever.
 */
const ADVANCE_AFTER_EMBED_FALLBACK_MS = 8_000

/**
 * `probeInstagramVideo` can legitimately take up to
 * `INSTAGRAM_PROBE_ATTEMPTS * INSTAGRAM_PROBE_TIMEOUT_MS` (up to ~70s) on a
 * very cold mirror before it even resolves to 'failed'. That's far longer
 * than a viewer will wait on a stalled item in an auto-advancing queue, so
 * this is a hard ceiling independent of the probe's own outcome: if nothing
 * has started playing by this point, advance — the probe keeps running in
 * the background and still warms `probedReady` for next time.
 */
const NEVER_STARTED_GUARD_MS = 20_000

/**
 * Pure: given the current probe status, should an auto-advance guard fire?
 * Never once the mirror is confirmed ready — StageVideo owns `onEnded` from
 * that point on.
 */
export function shouldAdvanceInstagramStage(status: ProbeStatus): boolean {
  return status !== 'ready'
}

/** Reel ids whose mirror already answered 200/206 this session — skip the probe on a repeat visit. */
const probedReady = new Set<string>()

/**
 * Pure: probe status + "have we been waiting a while" → what the stage
 * renders. Extracted so the phase logic is unit-testable without a DOM.
 */
export function instagramStagePhase(
  status: ProbeStatus,
  slow: boolean,
): 'spinner' | 'status' | 'video' | 'embed' {
  if (status === 'ready') return 'video'
  if (status === 'failed') return 'embed'
  return slow ? 'status' : 'spinner'
}

export function StageInstagram({
  item,
  muted,
  onRequestUnmute,
  onEnded,
  repeat,
}: StageInstagramProps) {
  const id = item.bookmarkId || ''
  const [status, setStatus] = useState<ProbeStatus>(() =>
    probedReady.has(id) ? 'ready' : 'probing',
  )
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    setSlow(false)

    if (probedReady.has(id)) {
      setStatus('ready')
      return
    }
    if (!id) {
      setStatus('failed')
      return
    }

    setStatus('probing')
    const controller = new AbortController()
    const slowTimer = setTimeout(() => setSlow(true), INSTAGRAM_SPINNER_MS)

    probeInstagramVideo(id, { signal: controller.signal }).then((ok) => {
      if (controller.signal.aborted) return
      if (ok) probedReady.add(id)
      setStatus(ok ? 'ready' : 'failed')
    })

    return () => {
      controller.abort()
      clearTimeout(slowTimer)
    }
  }, [id])

  // `status` at the moment either guard's timer actually fires — read via a
  // ref so a stale value captured at schedule time can't suppress a real
  // advance (or fire a spurious one after the mirror came ready).
  const statusRef = useRef(status)
  useEffect(() => {
    statusRef.current = status
  }, [status])

  // Guard 2: the IG-embed fallback never fires `ended` on its own (it's a
  // bare iframe we don't control). Give a viewer a moment on it, then move
  // the queue along. Keyed on `status` transitioning to 'failed', so a later
  // item that lands in 'ready' or a fresh 'probing' never inherits a stale
  // timer (the effect's own cleanup clears it on every status change).
  useEffect(() => {
    if (!onEnded || repeat) return
    if (status !== 'failed') return
    const timer = setTimeout(() => {
      onEnded()
    }, ADVANCE_AFTER_EMBED_FALLBACK_MS)
    return () => clearTimeout(timer)
  }, [status, onEnded, repeat])

  // Guard 3: an overall "nothing started" ceiling from mount, independent of
  // the probe's own (up to ~70s) retry budget — if the probe is still
  // spinning well past its documented warm-up window, don't make an
  // auto-advancing queue wait on it. Keyed on `id` rather than `status` so
  // it can't be re-armed by a status flicker within the same item; if Guard
  // 2 already advanced first, the parent swaps the item and this effect's
  // `id`-change cleanup cancels the now-irrelevant timer before it fires.
  useEffect(() => {
    if (!onEnded || repeat || !id) return
    const timer = setTimeout(() => {
      if (shouldAdvanceInstagramStage(statusRef.current)) onEnded()
    }, NEVER_STARTED_GUARD_MS)
    return () => clearTimeout(timer)
  }, [id, onEnded, repeat])

  const poster = item.thumbnailUrl ?? null

  if (status === 'ready') {
    return (
      <StageVideo
        item={item}
        src={instagramVideoSrc(id)}
        poster={poster}
        muted={muted}
        onRequestUnmute={onRequestUnmute}
        onEnded={onEnded}
        repeat={repeat}
      />
    )
  }

  if (status === 'failed') {
    const href = previewPath('instagram', item.author, id)
    return (
      <div className="relative flex h-full w-full items-center justify-center bg-[#08070a]">
        <div className="relative flex h-full w-full max-w-[480px] flex-col items-center justify-center gap-4 px-4 py-6">
          <div className="h-full w-full overflow-hidden rounded-2xl bg-black">
            {id && (
              <iframe
                src={instagramEmbedUrl(id)}
                title="Instagram Reel"
                allow="autoplay; encrypted-media"
                className="h-full w-full border-0"
              />
            )}
          </div>
          <a
            href={href}
            className="inline-flex min-h-[44px] flex-none items-center gap-1.5 rounded-full bg-clay-grad px-5 py-2.5 text-sm font-semibold text-white shadow-glow transition-opacity hover:opacity-90"
          >
            Open preview
            <ArrowRight size={15} />
          </a>
        </div>
      </div>
    )
  }

  // Probing: poster + spinner (≤3s), then poster + a quiet status line.
  const phase = instagramStagePhase(status, slow)
  return (
    <StageFrame>
      {poster && (
        <img
          src={poster}
          alt=""
          referrerPolicy="no-referrer"
          className="absolute inset-0 h-full w-full object-contain opacity-70"
        />
      )}
      <div className="absolute inset-0 bg-[#08070a]/45" aria-hidden />
      <div className="relative">
        {phase === 'spinner' ? (
          <Loader2 size={30} className="animate-spin text-white/80" aria-hidden />
        ) : (
          <span className="inline-flex min-h-[44px] items-center rounded-full bg-black/50 px-4 py-2 text-sm font-medium text-white/80 backdrop-blur-md">
            starting…
          </span>
        )}
      </div>
      <span className="sr-only">{item.text || 'Instagram reel'}</span>
    </StageFrame>
  )
}
