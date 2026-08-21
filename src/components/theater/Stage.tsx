'use client'

/**
 * Dark stage dispatcher (spec §3/§6): renders the right variant for the
 * current item. The stage background is ALWAYS near-black (#08070a) in both
 * themes — hardcoded, does not follow theme tokens.
 */

import { ArrowRight } from 'lucide-react'
import { PlatformGlyph } from '@/components/matter'
import { inferType } from '@/lib/trending/filter'
import { previewPath } from '@/lib/activity/preview-path'
import { usePlaybackSource } from './usePlaybackSource'
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
}

export function Stage({ item, muted, onRequestUnmute, onEnded, photoCaption }: StageProps) {
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
      />
    )
  }

  // YouTube has no MP4 — official youtube-nocookie iframe only, driven by
  // the raw postMessage protocol for autoplay/ended/transport (StageYouTube).
  if (item.platform === 'youtube') {
    return (
      <StageYouTube item={item} muted={muted} onRequestUnmute={onRequestUnmute} onEnded={onEnded} />
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
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[#08070a]">
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
        {title && (
          <h2 className="font-serif text-2xl leading-tight text-white sm:text-3xl">{title}</h2>
        )}
        <a
          href={href}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-clay-grad px-5 py-2.5 text-sm font-semibold text-white shadow-glow transition-opacity hover:opacity-90"
        >
          Open preview
          <ArrowRight size={15} />
        </a>
      </div>
    </div>
  )
}
