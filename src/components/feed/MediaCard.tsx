'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ExternalLink, Play, Pause, Volume2, VolumeX } from 'lucide-react'
import type { FeedItem, ArticleContent } from './types'
import { youtubeEmbedUrl } from '@/lib/media/youtube'
import { normalizeEntityMap } from '@/lib/utils/article-text'
import { AuthorAvatar } from './AuthorAvatar'
import { renderTextWithLinks, stripMediaUrls, fallbackToOriginal } from './utils'
import { PlatformGlyph, type PlatformId } from '@/components/matter'
import { formatCompactRelativeTime } from '@/lib/utils/format'
import { cn } from '@/lib/utils'

/**
 * Shared media-first card (the single triage/focus viewer) — Matter focus tokens.
 *
 * Two layouts:
 *  - `fullBleed` (mobile, media items): media covers the whole screen
 *    (object-cover, black bg); caption + chrome overlay on top — Reels/TikTok style.
 *  - framed (desktop, or any non-media item): media is maximized to fill the
 *    available height with the author card alongside; article reader (serif + TTS),
 *    quote (both posts in full), or text-only hero.
 */

/** Clear "which platform" wordmark, used in card headers / source lines. */
function PlatformWordmark({ platform }: { platform?: FeedItem['platform'] }) {
  const p = (platform ?? 'twitter') as PlatformId
  const label =
    p === 'instagram'
      ? 'Instagram'
      : p === 'tiktok'
        ? 'TikTok'
        : p === 'youtube'
          ? 'YouTube'
          : 'x.com'
  return (
    <span className="flex items-center gap-1.5 font-semibold text-fink">
      <PlatformGlyph platform={p} size={15} />
      {label}
    </span>
  )
}

function quoteThumb(item: FeedItem): string | null {
  const q = item.quotedTweet
  const qc = item.quoteContext
  if (q?.media?.[0]) return q.media[0].thumbnailUrl || q.media[0].url
  if (q?.articlePreview?.imageUrl) return q.articlePreview.imageUrl
  if (qc?.media?.photos?.[0]?.url) return qc.media.photos[0].url
  if (qc?.media?.videos?.[0]?.thumbnail_url) return qc.media.videos[0].thumbnail_url
  if (qc?.article?.imageUrl) return qc.article.imageUrl
  if (qc?.external?.imageUrl) return qc.external.imageUrl
  return null
}

/** The poster image to use as the hero when there's no first-class media. */
function heroImageUrl(item: FeedItem): string | null {
  if (item.media?.[0]?.thumbnailUrl) return item.media[0].thumbnailUrl
  if (item.articlePreview?.imageUrl) return item.articlePreview.imageUrl
  return null
}

/** A renderable article block — text (with heading level) or a resolved image. */
type ArticleRenderBlock =
  | { kind: 'h1' | 'h2' | 'h3' | 'quote' | 'li' | 'p'; key: string; text: string }
  | { kind: 'image'; key: string; src: string; alt: string; caption: string }

type LooseEntity = {
  type?: string
  data?: {
    url?: string
    src?: string
    alt?: string
    caption?: string
    mediaItems?: Array<{ mediaId: string }>
  }
}

/**
 * Turn X-Article DraftJS blocks into renderable blocks, resolving `atomic`
 * media blocks into image URLs (via entityMap → mediaEntities, or a direct
 * src/url). Mirrors the resolution in `articleBlocksToMarkdown`.
 */
function buildArticleBlocks(content: ArticleContent | null | undefined): ArticleRenderBlock[] {
  if (!content?.blocks) return []
  const map = normalizeEntityMap(content.entityMap) as Record<string, LooseEntity>
  const media = content.mediaEntities || {}
  const out: ArticleRenderBlock[] = []

  for (const block of content.blocks) {
    if (block.type === 'atomic') {
      const entityKey = block.entityRanges?.[0]?.key
      const entity = entityKey !== undefined ? map[entityKey] : undefined
      let src: string | undefined
      if (entity?.type === 'MEDIA' && entity.data?.mediaItems?.[0]?.mediaId) {
        src = media[entity.data.mediaItems[0].mediaId]?.url
      }
      if (!src) src = entity?.data?.src || entity?.data?.url
      if (src) {
        out.push({
          kind: 'image',
          key: block.key,
          src,
          alt: entity?.data?.alt || '',
          caption: entity?.data?.caption || '',
        })
      }
      continue
    }
    if (block.type === 'unstyled-divider') continue
    const text = block.text?.trim()
    if (!text) continue
    const kind: ArticleRenderBlock['kind'] =
      block.type === 'header-one'
        ? 'h1'
        : block.type === 'header-two'
          ? 'h2'
          : block.type === 'header-three'
            ? 'h3'
            : block.type === 'blockquote'
              ? 'quote'
              : block.type === 'unordered-list-item' || block.type === 'ordered-list-item'
                ? 'li'
                : 'p'
    out.push({ kind, key: block.key, text })
  }
  return out
}

/** Rough reading time: ~200 wpm, floor of 1 min. */
function readMinutes(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round(words / 200))
}

function isArticleItem(item: FeedItem): boolean {
  const hasMedia = !!heroImageUrl(item)
  return (
    !!item.isXArticle ||
    !!(item.articleContent?.blocks && item.articleContent.blocks.length > 0) ||
    (!hasMedia &&
      !!(item.articlePreview && (item.articlePreview.title || item.articlePreview.description)))
  )
}

/**
 * Whether this item should render as full-bleed media on mobile (video/photo
 * with first-class media — not an article-with-cover, quote, or text post).
 */
export function isFullBleedCandidate(item: FeedItem): boolean {
  return !!heroImageUrl(item) && !isArticleItem(item)
}

/**
 * Inline MP4 source for a video item (TikTok ships a direct URL; others proxy).
 * Focus mode is a deliberate viewing surface, so it streams HD (720p) — the
 * 360p `preview` quality is only for gallery hover previews.
 */
function videoSrc(item: FeedItem): string {
  const primary = item.media?.[0]
  return item.platform === 'tiktok' && primary
    ? primary.url
    : `/api/media/video?author=${encodeURIComponent(item.author)}&tweetId=${encodeURIComponent(item.id)}&quality=hd`
}

const FRAMED_MEDIA_CLASS =
  'h-full max-h-full w-auto max-w-full object-contain rounded-2xl bg-black shadow-m-lg'

/**
 * Remember the focus-mode mute choice across items and sessions. Desktop
 * defaults to audio ON; once the viewer mutes/unmutes (via the native controls)
 * that choice sticks. SSR-safe (reads localStorage lazily on the client).
 */
const FOCUS_MUTED_KEY = 'adhx-focus-muted'
function useFocusMuted(defaultMuted: boolean): [boolean, (m: boolean) => void] {
  const [muted, setMutedState] = useState<boolean>(() => {
    if (typeof window === 'undefined') return defaultMuted
    const v = window.localStorage.getItem(FOCUS_MUTED_KEY)
    return v === null ? defaultMuted : v === '1'
  })
  const setMuted = (m: boolean) => {
    setMutedState(m)
    try {
      window.localStorage.setItem(FOCUS_MUTED_KEY, m ? '1' : '0')
    } catch {
      /* private mode / disabled storage — preference just won't persist */
    }
  }
  return [muted, setMuted]
}

/**
 * Framed (desktop) video. Honors the remembered mute preference (audio on by
 * default), attempts to play, and persists any mute toggle the viewer makes via
 * the native controls. Unmuted autoplay may be blocked by the browser until the
 * first interaction — the controls/poster are right there, and once the viewer
 * has played one clip the rest of the session autoplays with sound.
 */
function FramedVideo({ item }: { item: FeedItem }) {
  const [muted, setMuted] = useFocusMuted(false)
  const ref = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const v = ref.current
    if (!v) return
    v.muted = muted
    v.play().catch(() => {})
  }, [muted, item.id])

  return (
    <video
      key={item.id}
      ref={ref}
      src={videoSrc(item)}
      poster={item.media?.[0]?.thumbnailUrl}
      controls
      autoPlay
      loop
      playsInline
      onVolumeChange={(e) => {
        const m = e.currentTarget.muted
        if (m !== muted) setMuted(m)
      }}
      className={FRAMED_MEDIA_CLASS}
    />
  )
}

/* ===================== FULL-BLEED MEDIA (mobile) ===================== */

function FullBleedMedia({ item }: { item: FeedItem }) {
  const primary = item.media?.[0]
  const isVideo = primary?.mediaType === 'video' || primary?.mediaType === 'animated_gif'
  const text = stripMediaUrls(item.text || '', !!item.media?.[0])
  const videoRef = useRef<HTMLVideoElement>(null)
  const [muted, setMuted] = useState(true)

  const toggleMute = () => {
    const v = videoRef.current
    if (!v) return
    v.muted = !v.muted
    setMuted(v.muted)
    if (!v.muted) v.play().catch(() => {})
  }

  let media: ReactNode = null
  if (item.platform === 'youtube') {
    media = (
      <iframe
        key={item.id}
        src={youtubeEmbedUrl(item.id)}
        title={item.text || 'YouTube Short'}
        className="absolute inset-0 w-full h-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
      />
    )
  } else if (isVideo && primary) {
    media = (
      <video
        key={item.id}
        ref={videoRef}
        src={videoSrc(item)}
        poster={primary.thumbnailUrl}
        autoPlay
        muted
        loop
        playsInline
        className="absolute inset-0 w-full h-full object-contain"
      />
    )
  } else {
    const img = primary?.url || heroImageUrl(item)
    media = img ? (
      <img
        src={img}
        alt=""
        className="absolute inset-0 w-full h-full object-contain"
        referrerPolicy="no-referrer"
        onError={fallbackToOriginal(primary?.originalUrl)}
      />
    ) : null
  }

  return (
    <>
      {media}

      {/* Scrim — darkens top (for the chrome) and bottom (for the caption/dock). */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'linear-gradient(180deg, rgba(0,0,0,.55), transparent 22%, transparent 48%, rgba(0,0,0,.86))',
        }}
        aria-hidden
      />

      {/* Tap-to-unmute (video only) — top-right, clear of the dock. */}
      {isVideo && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            toggleMute()
          }}
          aria-label={muted ? 'Unmute' : 'Mute'}
          className="absolute top-[68px] right-4 z-[4] w-10 h-10 rounded-full bg-black/40 backdrop-blur text-white flex items-center justify-center"
        >
          {muted ? (
            <VolumeX className="w-[18px] h-[18px]" />
          ) : (
            <Volume2 className="w-[18px] h-[18px]" />
          )}
        </button>
      )}

      {/* Caption — author + text, sitting just above the dock. */}
      <div className="absolute left-0 right-0 z-[3] px-5" style={{ bottom: 150 }}>
        <div className="flex items-center gap-2.5 mb-1.5">
          <AuthorAvatar src={item.authorProfileImageUrl} author={item.author} size="sm" />
          <div className="min-w-0">
            <p className="text-white font-semibold text-sm leading-tight truncate drop-shadow">
              {item.authorName || item.author}
            </p>
            <p className="text-white/70 font-mono text-xs truncate flex items-center gap-1.5">
              @{item.author}
              <PlatformGlyph platform={(item.platform ?? 'twitter') as PlatformId} size={11} />
              {item.createdAt && (
                <>
                  <span aria-hidden>·</span>
                  {formatCompactRelativeTime(item.createdAt)}
                </>
              )}
            </p>
          </div>
        </div>
        {text && (
          <p className="text-white/90 text-[14.5px] leading-snug line-clamp-3 drop-shadow">
            {text}
          </p>
        )}
      </div>
    </>
  )
}

/* ===================== MEDIA PANEL (framed, maximized) ===================== */

function MediaPanel({ item }: { item: FeedItem }) {
  const primary = item.media?.[0]
  const isVideo = primary?.mediaType === 'video' || primary?.mediaType === 'animated_gif'
  // Fill the available focus-area height; width follows the media's own ratio.
  const fill = FRAMED_MEDIA_CLASS

  // YouTube plays via the official iframe embed (no MP4). Vertical Shorts frame —
  // fills height, width derived from the 9/16 ratio.
  if (item.platform === 'youtube') {
    return (
      <div className="relative aspect-[9/16] h-full max-h-full max-w-full rounded-2xl overflow-hidden bg-black shadow-m-lg">
        <iframe
          key={item.id}
          src={youtubeEmbedUrl(item.id)}
          title={item.text || 'YouTube Short'}
          className="absolute inset-0 w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      </div>
    )
  }

  if (isVideo && primary) {
    return <FramedVideo item={item} />
  }

  const photos = (item.media ?? []).filter((m) => m.mediaType === 'photo')
  if (photos.length > 1) {
    return (
      <div className="flex h-full max-w-full gap-2 overflow-x-auto snap-x snap-mandatory rounded-2xl">
        {photos.map((p, i) => (
          <img
            key={p.id}
            src={p.url}
            alt={`Image ${i + 1} of ${photos.length}`}
            className="snap-center h-full w-auto max-w-full object-contain rounded-2xl bg-black flex-shrink-0 shadow-m-lg"
            referrerPolicy="no-referrer"
            onError={fallbackToOriginal(p.originalUrl)}
          />
        ))}
      </div>
    )
  }

  const img = heroImageUrl(item)
  if (!img) return null
  const href = item.articlePreview?.url || item.tweetUrl
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="block h-full max-h-full">
      <img
        src={primary?.url || img}
        alt=""
        className={fill}
        referrerPolicy="no-referrer"
        onError={fallbackToOriginal(primary?.originalUrl)}
      />
    </a>
  )
}

/* ============================ AUTHOR CARD ============================ */

function AuthorCard({ item }: { item: FeedItem }) {
  const text = stripMediaUrls(item.text || '', !!item.media?.[0])
  const created = item.createdAt
    ? new Date(item.createdAt).toLocaleString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : null

  return (
    <article
      data-triage-content
      className="w-full md:w-[330px] flex-shrink-0 bg-fsurface border border-fline rounded-2xl shadow-m-lg flex flex-col max-h-[32vh] md:max-h-full overflow-hidden"
    >
      <header className="flex items-start gap-3 p-4 pb-2 flex-shrink-0">
        <AuthorAvatar src={item.authorProfileImageUrl} author={item.author} size="md" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-fink truncate">{item.authorName || item.author}</p>
          <p className="text-sm text-fink-3 font-mono truncate">@{item.author}</p>
        </div>
        {/* Platform glyph + human time chip (no external-link icon). */}
        <a
          href={item.tweetUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 flex-shrink-0 rounded-full bg-inset px-2.5 py-1 text-fink-2 hover:opacity-80"
          title="Open source"
        >
          <PlatformGlyph platform={(item.platform ?? 'twitter') as PlatformId} size={13} />
          {item.createdAt && (
            <span className="font-mono text-xs">{formatCompactRelativeTime(item.createdAt)}</span>
          )}
        </a>
      </header>

      <div className="overflow-y-auto px-4 pb-4 flex flex-col gap-3">
        {text && (
          <p className="text-[15px] leading-relaxed text-fink whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
            {renderTextWithLinks(text)}
          </p>
        )}

        {created && (
          <p className="text-xs text-fink-3 font-mono border-t border-fline pt-2">{created}</p>
        )}
      </div>
    </article>
  )
}

/* ============================ TTS PLAYER ============================ */

function TtsPlayer({ text, minutes }: { text: string; minutes: number }) {
  const [playing, setPlaying] = useState(false)
  const [rate, setRate] = useState(1)
  // 0..1 — how far through the article the speech has read. Drives the
  // waveform fill so it acts as a position indicator, not just on/off.
  const [progress, setProgress] = useState(0)
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null)
  // `boundary` events are the accurate position source but many voices/engines
  // never emit them — so a wall-clock estimate drives the bar by default and
  // boundary events take over (and stop the timer) the moment they fire.
  const boundaryFiredRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
  }

  // Stop any speech / timer when unmounting or switching items.
  useEffect(() => {
    setProgress(0)
    setPlaying(false)
    boundaryFiredRef.current = false
    return () => {
      stopTimer()
      if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel()
    }
  }, [text])

  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window

  // Words / (≈175 wpm × rate) → estimated duration in ms (floor 1s).
  const estDurationMs = (speakRate: number) => {
    const words = text.trim().split(/\s+/).filter(Boolean).length
    return Math.max(1000, (words / (175 * speakRate)) * 60_000)
  }

  const begin = (speakRate: number) => {
    if (!supported) return
    const synth = window.speechSynthesis
    synth.cancel()
    stopTimer()
    setProgress(0)
    boundaryFiredRef.current = false

    const u = new SpeechSynthesisUtterance(text)
    u.rate = speakRate
    // Ignore events from a superseded utterance — our own cancel() fires an
    // `interrupted` error on the previous one, which must not flip the new one's
    // state (the classic Web Speech "interrupted kills the next clip" trap).
    u.onboundary = (e) => {
      if (utterRef.current !== u || text.length === 0) return
      boundaryFiredRef.current = true // accurate source available — stop using the estimate
      setProgress(Math.min(1, e.charIndex / text.length))
    }
    u.onend = () => {
      if (utterRef.current !== u) return
      stopTimer()
      setProgress(1)
      setPlaying(false)
    }
    u.onerror = () => {
      if (utterRef.current !== u) return
      stopTimer()
      setPlaying(false)
    }
    utterRef.current = u
    synth.speak(u)
    setPlaying(true)

    // Runs for the whole playback: (1) keep Chrome from auto-pausing long
    // utterances (~15s bug), and (2) drive the bar by wall-clock until/unless
    // accurate boundary events take over.
    const started = performance.now()
    const dur = estDurationMs(speakRate)
    timerRef.current = setInterval(() => {
      if (window.speechSynthesis.paused) window.speechSynthesis.resume()
      if (!boundaryFiredRef.current) {
        setProgress(Math.min(0.99, (performance.now() - started) / dur))
      }
    }, 200)
  }

  const toggle = () => {
    if (!supported) return
    if (playing) {
      window.speechSynthesis.cancel()
      stopTimer()
      setPlaying(false)
      return
    }
    begin(rate)
  }

  const cycleRate = () => {
    const next = rate >= 2 ? 0.75 : rate >= 1.5 ? 2 : rate >= 1 ? 1.5 : 1
    setRate(next)
    // Web Speech can't change rate mid-utterance, so it restarts from the top.
    if (playing) begin(next)
  }

  const bars = 44
  const activeBars = Math.round(bars * progress)

  return (
    <div className="flex items-center gap-3.5 pl-2.5 pr-3 py-2.5 rounded-full bg-fsurface border border-fline">
      <button
        onClick={toggle}
        disabled={!supported}
        aria-label={playing ? 'Pause' : 'Listen to article'}
        className="w-[42px] h-[42px] flex-none rounded-full bg-clay-grad shadow-glow flex items-center justify-center text-white disabled:opacity-40"
      >
        {playing ? (
          <Pause className="w-[19px] h-[19px]" fill="currentColor" />
        ) : (
          <Play className="w-[19px] h-[19px]" fill="currentColor" />
        )}
      </button>
      <div className="flex items-center justify-between flex-1 min-w-0 h-[26px] overflow-hidden">
        {Array.from({ length: bars }).map((_, i) => {
          const h = 6 + Math.abs(Math.sin(i * 0.9)) * 18
          const on = i < activeBars
          return (
            <span
              key={i}
              className={cn(
                'w-[3px] flex-none rounded-[3px] transition-colors',
                on ? 'bg-clay' : 'bg-fline',
              )}
              style={{ height: h }}
            />
          )
        })}
      </div>
      <button
        onClick={cycleRate}
        className="px-2.5 py-1 rounded-full text-xs font-semibold bg-inset text-fink-2 flex-none"
        aria-label="Playback speed"
      >
        {rate % 1 === 0 ? `${rate}.0×` : `${rate}×`}
      </button>
      <span className="text-xs font-mono flex-none text-fink-2 whitespace-nowrap flex items-center gap-1.5">
        <Volume2 className="w-3.5 h-3.5" />
        Listen · {minutes} min
      </span>
    </div>
  )
}

/* ============================ ARTICLE READER ============================ */

function ArticleBlockView({ block }: { block: ArticleRenderBlock }) {
  switch (block.kind) {
    case 'image':
      return (
        <figure className="my-5">
          <img
            src={block.src}
            alt={block.alt}
            className="w-full rounded-xl bg-inset"
            referrerPolicy="no-referrer"
            loading="lazy"
          />
          {block.caption && (
            <figcaption className="mt-2 text-center text-xs text-fink-3 not-italic">
              {block.caption}
            </figcaption>
          )}
        </figure>
      )
    case 'h1':
      return (
        <h2 className="font-serif text-[24px] leading-snug font-semibold text-fink mt-7 mb-2">
          {block.text}
        </h2>
      )
    case 'h2':
      return (
        <h3 className="font-serif text-[21px] leading-snug font-semibold text-fink mt-6 mb-2">
          {block.text}
        </h3>
      )
    case 'h3':
      return (
        <h4 className="font-serif text-[19px] leading-snug font-semibold text-fink mt-5 mb-1.5">
          {block.text}
        </h4>
      )
    case 'quote':
      return (
        <blockquote className="my-4 border-l-[3px] border-clay pl-4 italic text-fink-2">
          {block.text}
        </blockquote>
      )
    case 'li':
      return (
        <div className="mb-1.5 flex gap-2.5">
          <span className="text-clay flex-none">•</span>
          <span>{block.text}</span>
        </div>
      )
    default:
      return <p className="mb-4">{block.text}</p>
  }
}

function ArticleReader({ item }: { item: FeedItem }) {
  const blocks = useMemo(() => buildArticleBlocks(item.articleContent), [item.articleContent])
  const fallbackText = stripMediaUrls(item.text || '', !!item.media?.[0])
  const fallbackParas =
    blocks.length === 0 && fallbackText ? fallbackText.split(/\n{2,}/).filter(Boolean) : []
  const title = item.articlePreview?.title || item.authorName || item.author
  const source =
    item.articlePreview?.domain ||
    (item.platform === 'twitter' ? 'x.com' : item.platform) ||
    'x.com'

  // Reading text excludes images; used for TTS + reading-time estimate.
  const fullText =
    blocks
      .filter((b): b is Exclude<ArticleRenderBlock, { kind: 'image' }> => b.kind !== 'image')
      .map((b) => b.text)
      .join(' ') || fallbackParas.join(' ')
  const minutes = readMinutes(fullText || title || '')

  // Header/cover image — skip if it's already one of the inline images.
  const inlineSrcs = new Set(
    blocks.filter((b) => b.kind === 'image').map((b) => (b as { src: string }).src),
  )
  const cover =
    item.articlePreview?.imageUrl && !inlineSrcs.has(item.articlePreview.imageUrl)
      ? item.articlePreview.imageUrl
      : null

  return (
    <div
      data-triage-content
      className="w-full max-w-[700px] h-full flex flex-col gap-[18px] pt-1.5"
    >
      {/* source line */}
      <div className="flex items-center gap-2.5 flex-none">
        <span className="w-[26px] h-[26px] rounded-[7px] bg-inset flex items-center justify-center text-fink-2">
          <PlatformGlyph platform={(item.platform ?? 'twitter') as PlatformId} size={13} />
        </span>
        <span className="text-xs font-mono text-fink-3">
          {source} · article · {minutes} min read
        </span>
      </div>

      <h1 className="font-serif text-[28px] lg:text-[34px] leading-[1.16] text-fink font-semibold tracking-[-0.01em] m-0 flex-none">
        {title}
      </h1>

      {fullText && (
        <div className="flex-none">
          <TtsPlayer text={fullText} minutes={minutes} />
        </div>
      )}

      {/* full untruncated body (cover + images + text) — scrolls in-app */}
      <div className="font-serif text-[17px] lg:text-[19px] leading-[1.72] text-fink overflow-y-auto flex-1 min-h-0">
        {cover && (
          <img
            src={cover}
            alt=""
            className="w-full rounded-xl bg-inset mb-5"
            referrerPolicy="no-referrer"
          />
        )}
        {blocks.length > 0
          ? blocks.map((b) => <ArticleBlockView key={b.key} block={b} />)
          : fallbackParas.map((p, i) => (
              <p key={i} className={i === fallbackParas.length - 1 ? 'm-0' : 'mb-4'}>
                {p}
              </p>
            ))}
      </div>
    </div>
  )
}

/* ============================ QUOTE ============================ */

function QuoteView({ item }: { item: FeedItem }) {
  const q = item.quotedTweet
  const qc = item.quoteContext

  const outerText = stripMediaUrls(item.text || '', !!item.media?.[0])

  const qName = q?.authorName || q?.author || qc?.authorName || qc?.author || 'unknown'
  const qHandle = q?.author || qc?.author || ''
  const qText = q?.text || qc?.text || ''
  const qThumb = quoteThumb(item)

  return (
    <div
      data-triage-content
      className="w-full max-w-[640px] max-h-full overflow-y-auto bg-fsurface border border-fline rounded-2xl shadow-m-lg p-6 lg:p-7"
    >
      {/* quoting post header */}
      <div className="flex items-center gap-3 mb-4">
        <AuthorAvatar src={item.authorProfileImageUrl} author={item.author} size="md" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-fink truncate">{item.authorName || item.author}</p>
          <p className="text-xs font-mono text-fink-3 truncate">@{item.author}</p>
        </div>
        <a
          href={item.tweetUrl}
          target="_blank"
          rel="noopener noreferrer"
          title="Open source"
          className="hover:opacity-80 flex-none"
        >
          <PlatformGlyph
            platform={(item.platform ?? 'twitter') as PlatformId}
            size={17}
            className="text-fink-2"
          />
        </a>
      </div>

      {outerText && (
        <div className="text-[17px] lg:text-[19px] leading-[1.5] text-fink mb-[18px] whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
          {renderTextWithLinks(outerText)}
        </div>
      )}

      {/* embedded quoted post — shown in full */}
      <div className="p-[18px] lg:px-5 lg:py-[18px] bg-inset border border-fline rounded-xl">
        <div className="flex items-center gap-2.5 mb-3">
          {q?.authorProfileImageUrl || qc?.authorProfileImageUrl ? (
            <AuthorAvatar
              src={q?.authorProfileImageUrl || qc?.authorProfileImageUrl}
              author={qHandle}
              size="sm"
            />
          ) : (
            <AuthorAvatar author={qHandle} size="sm" />
          )}
          <div className="min-w-0">
            <p className="font-semibold text-sm text-fink truncate">{qName}</p>
            {qHandle && <p className="text-xs font-mono text-clay truncate">@{qHandle}</p>}
          </div>
        </div>
        {qText && (
          <div className="text-[15px] leading-[1.55] text-fink-2 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
            {renderTextWithLinks(qText)}
          </div>
        )}
        {qThumb && (
          <img
            src={qThumb}
            alt=""
            className="mt-3 w-full max-h-72 rounded-lg object-cover bg-inset"
            referrerPolicy="no-referrer"
          />
        )}
      </div>
    </div>
  )
}

/* ============================ TEXT-ONLY ============================ */

function TextCard({ item }: { item: FeedItem }) {
  const text = stripMediaUrls(item.text || '', !!item.media?.[0])
  const created = item.createdAt
    ? new Date(item.createdAt).toLocaleString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : null

  return (
    <article
      data-triage-content
      className="w-full max-w-xl max-h-full overflow-y-auto bg-fsurface border border-fline rounded-2xl shadow-m-lg p-6 lg:p-7"
    >
      <div className="flex items-center gap-3 mb-4">
        <AuthorAvatar src={item.authorProfileImageUrl} author={item.author} size="md" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-fink truncate">{item.authorName || item.author}</p>
          <p className="text-xs font-mono text-fink-3 truncate">@{item.author}</p>
        </div>
        <a
          href={item.tweetUrl}
          target="_blank"
          rel="noopener noreferrer"
          title="Open source"
          className="flex items-center gap-1 hover:opacity-80 flex-none"
        >
          <PlatformWordmark platform={item.platform} />
          <ExternalLink className="w-3.5 h-3.5 text-fink-3" />
        </a>
      </div>

      {text && (
        <div className="text-[17px] lg:text-[19px] leading-[1.55] text-fink whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
          {renderTextWithLinks(text)}
        </div>
      )}

      {item.summary && (
        <p className="mt-4 text-sm text-fink-2 border-t border-fline pt-3">{item.summary}</p>
      )}

      {created && <p className="mt-4 text-xs font-mono text-fink-3">{created}</p>}
    </article>
  )
}

/* ============================ ROOT ============================ */

export function MediaCard({ item, fullBleed = false }: { item: FeedItem; fullBleed?: boolean }) {
  // Mobile full-bleed media — the whole viewer is the media, chrome overlays it.
  if (fullBleed) {
    return <FullBleedMedia item={item} />
  }

  const hasMedia = !!heroImageUrl(item)
  const hasQuote = !!(item.isQuote && (item.quotedTweet || item.quoteContext))
  const isArticle = isArticleItem(item)

  // Article reader (serif body + TTS). Article-with-cover still reads as an article.
  if (isArticle) {
    return (
      <div className="w-full flex items-stretch justify-center h-full">
        <ArticleReader item={item} />
      </div>
    )
  }

  // Quote (quoting + quoted, both in full) when there's no first-class media.
  if (hasQuote && !hasMedia) {
    return (
      <div className="w-full h-full flex items-start justify-center overflow-y-auto">
        <QuoteView item={item} />
      </div>
    )
  }

  // Text-only hero.
  if (!hasMedia) {
    return (
      <div className="w-full h-full flex items-start justify-center overflow-y-auto">
        <TextCard item={item} />
      </div>
    )
  }

  // Media maximized + author card alongside (vertical video, photos, link image).
  // No flex-grow on the media cell — it sizes to the media so the pair stays
  // centered together (gap 8); a grown cell would strand the card at the edge.
  return (
    <div className="w-full h-full flex flex-col md:flex-row gap-4 md:gap-8 items-center justify-center">
      <div
        data-triage-content
        className="min-w-0 max-w-full h-full min-h-0 flex items-center justify-center"
      >
        <MediaPanel item={item} />
      </div>
      <AuthorCard item={item} />
    </div>
  )
}
