'use client'

/**
 * Dark stage dispatcher (spec §3/§6): renders the right variant for the
 * current item. The stage background is ALWAYS near-black (#08070a) in both
 * themes — hardcoded, does not follow theme tokens.
 */

import { useRef } from 'react'
import { PlatformGlyph } from '@/components/matter'
import { inferType } from '@/lib/trending/filter'
import { previewPath } from '@/lib/activity/preview-path'
import { usePlaybackSource } from './usePlaybackSource'
import {
  STAGE_ARTICLE_ROOT,
  STAGE_ARTICLE_TEXT_PANE,
  STAGE_ARTICLE_VIDEO_BAND,
  StageArticleVideoFade,
  StageFrame,
  StageHeadline,
  StageCTA,
} from './stage-primitives'
import { StageVideo } from './StageVideo'
import { StageText } from './StageText'
import { StageInstagram, useInstagramStage } from './StageInstagram'
import { StageYouTube } from './StageYouTube'
import { StageArticle } from './StageArticle'
import { isArticleReader, isQuoteReader, type TheaterItem } from './types'

export interface StageProps {
  item: TheaterItem | null
  /** Muted until the user's first gesture (autoplay policy). */
  muted: boolean
  /** User tapped the "Tap for sound" chip / the video. */
  onRequestUnmute: () => void
  /** Current video finished — the shell auto-advances (or loops, per repeat mode). */
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
  /**
   * Video/photo + quote or a long caption: default is full-bleed parent
   * media. Flip this to read the article. A playing parent video stays
   * mounted in a top band so you can read while it continues.
   */
  articleMode?: boolean
}

export function Stage({
  item,
  muted,
  onRequestUnmute,
  onEnded,
  photoCaption,
  repeat,
  articleMode = false,
}: StageProps) {
  const playback = usePlaybackSource(item)

  // Instagram's mirror MP4 has to be Range-probed before a <video src> is
  // attached (cold-cache 404s). The probe lives in a hook rather than inside
  // StageInstagram so the confirmed reel can play through the SAME video slot
  // below as X and TikTok — one element, one iOS unmute grant, for every MP4
  // platform. Called unconditionally (hooks rules); `active` gates the work.
  const isInstagram = !!item && item.platform === 'instagram'
  const instagram = useInstagramStage({ item, active: isInstagram, onEnded, repeat })

  // Does THIS item render through the shared <video> element? YouTube never
  // does — it's an iframe, which is a genuine platform ceiling for the grant.
  // Article mode keeps this true for parent video so the same element
  // (and unmute grant) keeps playing above the reader.
  const isStageVideoItem =
    !!item &&
    !isQuoteReader(item, false) &&
    item.platform !== 'youtube' &&
    (isInstagram ? instagram.status === 'ready' : playback.kind === 'video' && !!playback.src)
  const videoSrc = isInstagram ? instagram.src : playback.src
  const videoPoster = isInstagram ? instagram.poster : playback.poster

  // Remember the last item that DID, so every other kind of item can keep that
  // element alive underneath itself instead of unmounting it. iOS grants
  // unmuted playback to the ELEMENT the viewer gestured on, so dropping it
  // silently kills sound for the rest of the session — owner report: "it goes
  // from a video to an image or a text post, and then back to a video. It's
  // actually muted for me again." Same trick round 8 used for the waiting
  // stage: keep it mounted, cover it, pause it. Writing a ref during render is
  // fine here — it's idempotent, so a StrictMode double-render stores the same
  // value twice.
  const retainedVideo = useRef<{ item: TheaterItem; src: string; poster: string | null } | null>(
    null,
  )
  if (isStageVideoItem && item && videoSrc) {
    retainedVideo.current = { item, src: videoSrc, poster: videoPoster }
  }

  if (!item) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#08070a]">
        <p className="text-sm text-white/40">Nothing playing</p>
      </div>
    )
  }

  const isYouTube = item.platform === 'youtube'
  const articleWithLiveVideo = articleMode && isStageVideoItem
  const articleWithYouTube = articleMode && isYouTube
  const keepPlayingInArticle = articleWithLiveVideo || articleWithYouTube

  // What goes ON TOP of the video layer — null when the video IS the stage.
  // YouTube lives in the video layer (same slot as StageVideo) so Read does
  // not remount the iframe. Overlay is only the article pane.
  let overlay: React.ReactNode = null
  if (keepPlayingInArticle) {
    overlay = <StageText item={item} omitParentVideo flushTop underBand />
  } else if (!isStageVideoItem && !isYouTube) {
    const type = inferType(item)
    if (isInstagram) {
      // Not ready yet (or the mirror never answered): poster + spinner, or the
      // official-embed fallback. No player here — see `useInstagramStage`.
      overlay = <StageInstagram item={item} status={instagram.status} slow={instagram.slow} />
    } else if (type === 'article') {
      overlay = <StageArticle item={item} />
    } else if (type === 'photo' && !isArticleReader(item, articleMode)) {
      overlay = <StageText item={item} photo photoCaption={photoCaption} />
    } else if (type === 'text' || type === 'quote' || isArticleReader(item, articleMode)) {
      overlay = <StageText item={item} />
    } else {
      // Anything unresolvable: a graceful poster fallback — never a dead stage.
      overlay = <StagePoster item={item} poster={playback.poster} />
    }
  }

  const retained = retainedVideo.current

  // ONE tree shape for every item, because React reconciles by POSITION: if
  // the video sat at the root for a video item and one level deeper for a text
  // item, the <video> would be destroyed and rebuilt on every switch — which
  // is exactly the element (and grant) this is trying to preserve. So the video
  // layer is always this slot, and everything else is an overlay above it.
  return (
    <div className={STAGE_ARTICLE_ROOT}>
      {isStageVideoItem && videoSrc ? (
        <div className={articleWithLiveVideo ? STAGE_ARTICLE_VIDEO_BAND : 'absolute inset-0'}>
          <StageVideo
            item={item}
            src={videoSrc}
            poster={videoPoster}
            muted={muted}
            onRequestUnmute={onRequestUnmute}
            onEnded={onEnded}
            repeat={repeat}
          />
        </div>
      ) : isYouTube ? (
        <div className={articleWithYouTube ? STAGE_ARTICLE_VIDEO_BAND : 'absolute inset-0'}>
          <StageYouTube
            item={item}
            muted={muted}
            onRequestUnmute={onRequestUnmute}
            onEnded={onEnded}
            repeat={repeat}
          />
        </div>
      ) : retained ? (
        <div className="absolute inset-0" aria-hidden tabIndex={-1}>
          <StageVideo
            item={retained.item}
            src={retained.src}
            poster={retained.poster}
            muted={muted}
            onRequestUnmute={onRequestUnmute}
            covered
          />
        </div>
      ) : null}
      {keepPlayingInArticle ? <StageArticleVideoFade /> : null}
      {overlay && (
        // Opaque over a covered (paused) video. In article mode with a live
        // player the pane sits *below* the band so the same video stays visible.
        <div
          className={
            keepPlayingInArticle ? STAGE_ARTICLE_TEXT_PANE : 'absolute inset-0 z-10 bg-[#08070a]'
          }
        >
          {overlay}
        </div>
      )}
    </div>
  )
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
