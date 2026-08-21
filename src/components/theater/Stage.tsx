'use client'

/**
 * Dark stage dispatcher (spec §3/§6): renders the right variant for the
 * current item. The stage background is ALWAYS near-black (#08070a) in both
 * themes — hardcoded, does not follow theme tokens.
 */

import { PlatformGlyph } from '@/components/matter'
import { inferType } from '@/lib/trending/filter'
import { previewPath } from '@/lib/activity/preview-path'
import { usePlaybackSource } from './usePlaybackSource'
import { StageFrame, StageHeadline, StageCTA } from './stage-primitives'
import { StageVideo } from './StageVideo'
import { StageText } from './StageText'
import { StageInstagram } from './StageInstagram'
import { StageYouTube } from './StageYouTube'
import { StageArticle } from './StageArticle'
import type { TheaterItem } from './types'

export interface StageProps {
  item: TheaterItem | null
  /** Muted until the user's first gesture (autoplay policy). */
  muted: boolean
  /** User tapped the "Tap for sound" chip / the video. */
  onRequestUnmute: () => void
  /** Current video finished (show replay + "↓ next" nudge; no auto-advance). */
  onEnded?: () => void
  /**
   * Forwarded to StageText's photo variant. Default true (CollectionTheater's
   * stages, whose rail has no now-playing text of its own). TheaterShell
   * passes false — its rail (desktop) and mobile chrome already show the
   * author + caption, so the stage's own scrim would be a duplicate.
   */
  photoCaption?: boolean
  /**
   * shared-post-repeat: while the pinned shared post is on stage, the
   * player-level loop path (StageVideo's `loop` attribute / StageYouTube's
   * seek-to-0 replay) takes over instead of ever firing `onEnded` — see
   * TheaterShell's `isSharedPostPinned`. Ignored for non-video stages (their
   * own 'timed' auto-advance is suppressed one level up, at the progress-line
   * kind, since they have no player to loop).
   */
  repeat?: boolean
}

export function Stage({ item, muted, onRequestUnmute, onEnded, photoCaption, repeat }: StageProps) {
  const playback = usePlaybackSource(item)

  if (!item) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#08070a]">
        <p className="text-sm text-white/40">Nothing playing</p>
      </div>
    )
  }

  // Instagram gets its own stage: the mirror MP4 must be Range-probed before
  // a <video src> is attached (cold-cache 404s), so it can't share StageVideo.
  if (item.platform === 'instagram') {
    return (
      <StageInstagram
        item={item}
        muted={muted}
        onRequestUnmute={onRequestUnmute}
        onEnded={onEnded}
        repeat={repeat}
      />
    )
  }

  // YouTube has no MP4 — official youtube-nocookie iframe only, driven by
  // the raw postMessage protocol for autoplay/ended/transport (StageYouTube).
  if (item.platform === 'youtube') {
    return (
      <StageYouTube
        item={item}
        muted={muted}
        onRequestUnmute={onRequestUnmute}
        onEnded={onEnded}
        repeat={repeat}
      />
    )
  }

  if (playback.kind === 'video' && playback.src) {
    return (
      <StageVideo
        item={item}
        src={playback.src}
        poster={playback.poster}
        muted={muted}
        onRequestUnmute={onRequestUnmute}
        onEnded={onEnded}
        repeat={repeat}
      />
    )
  }

  const type = inferType(item)

  if (type === 'article') {
    return <StageArticle item={item} />
  }

  if (type === 'photo') {
    return <StageText item={item} photo photoCaption={photoCaption} />
  }

  if (type === 'text' || type === 'quote') {
    return <StageText item={item} />
  }

  // Anything unresolvable: a graceful poster fallback — never a dead black stage.
  return <StagePoster item={item} poster={playback.poster} />
}

function StagePoster({ item, poster }: { item: TheaterItem; poster: string | null }) {
  const thumb = poster ?? item.thumbnailUrl ?? null
  const title = (item.text || '').trim()
  const href = previewPath(item.platform, item.author, item.bookmarkId || '')

  return (
    <StageFrame>
      {thumb ? (
        <>
          <img
            src={thumb}
            alt=""
            referrerPolicy="no-referrer"
            className="absolute inset-0 h-full w-full object-contain opacity-60"
          />
          <div className="absolute inset-0 bg-[#08070a]/55" aria-hidden />
        </>
      ) : null}

      <div className="relative flex max-w-xl flex-col items-center gap-4 px-6 text-center">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-md">
          <PlatformGlyph platform={item.platform} size={20} />
        </span>
        {title && <StageHeadline>{title}</StageHeadline>}
        <StageCTA href={href} />
      </div>
    </StageFrame>
  )
}
