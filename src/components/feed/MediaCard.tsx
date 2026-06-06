'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ExternalLink, Play, Pause, Volume2 } from 'lucide-react'
import type { FeedItem, ArticleContentBlock } from './types'
import { youtubeEmbedUrl } from '@/lib/media/youtube'
import { AuthorAvatar } from './AuthorAvatar'
import { renderTextWithLinks, stripMediaUrls } from './utils'
import { PlatformGlyph, type PlatformId } from '@/components/matter'
import { cn } from '@/lib/utils'

/**
 * Shared media-first card (the single triage/focus viewer) — Matter focus tokens.
 * Media is maximized per orientation; text sits alongside (text-only → text is the hero).
 * Variants: vertical video (+ author card), article reader (serif + TTS), quote (both posts in full).
 */

/** Clear "which platform" wordmark, used in card headers / source lines. */
function PlatformWordmark({ platform }: { platform?: FeedItem['platform'] }) {
  const p = (platform ?? 'twitter') as PlatformId
  const label =
    p === 'instagram' ? 'Instagram' : p === 'tiktok' ? 'TikTok' : p === 'youtube' ? 'YouTube' : 'x.com'
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

/** Flatten article blocks into readable paragraphs (skips media/dividers). */
function articleParagraphs(blocks: ArticleContentBlock[] | undefined): string[] {
  if (!blocks) return []
  return blocks
    .filter((b) => b.type !== 'atomic' && b.type !== 'unstyled-divider')
    .map((b) => b.text?.trim() ?? '')
    .filter(Boolean)
}

/** Rough reading time: ~200 wpm, floor of 1 min. */
function readMinutes(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round(words / 200))
}

/* ============================ MEDIA PANEL ============================ */

function MediaPanel({ item }: { item: FeedItem }) {
  const primary = item.media?.[0]
  const isVideo = primary?.mediaType === 'video' || primary?.mediaType === 'animated_gif'
  const heightClass = 'max-h-[50vh] lg:max-h-[84vh]'

  // YouTube plays via the official iframe embed (no MP4). Vertical Shorts frame.
  // Needs a concrete height (the iframe is absolute, so aspect-ratio alone would
  // collapse the box to zero); width then follows from the 9/16 ratio.
  if (item.platform === 'youtube') {
    return (
      <div className="relative aspect-[9/16] h-[60vh] lg:h-[82vh] max-h-[82vh] max-w-full rounded-2xl overflow-hidden bg-black shadow-m-lg">
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
    const src =
      item.platform === 'tiktok'
        ? primary.url
        : `/api/media/video?author=${encodeURIComponent(item.author)}&tweetId=${encodeURIComponent(item.id)}&quality=preview`
    return (
      <video
        key={item.id}
        src={src}
        poster={primary.thumbnailUrl}
        controls
        autoPlay
        muted
        loop
        playsInline
        className={`max-w-full w-auto ${heightClass} rounded-2xl object-contain bg-black shadow-m-lg`}
      />
    )
  }

  const photos = (item.media ?? []).filter((m) => m.mediaType === 'photo')
  if (photos.length > 1) {
    return (
      <div className="flex gap-2 overflow-x-auto snap-x snap-mandatory rounded-2xl max-w-full">
        {photos.map((p, i) => (
          <img
            key={p.id}
            src={p.url}
            alt={`Image ${i + 1} of ${photos.length}`}
            className={`snap-center ${heightClass} w-auto max-w-full object-contain rounded-2xl bg-black flex-shrink-0 shadow-m-lg`}
            referrerPolicy="no-referrer"
          />
        ))}
      </div>
    )
  }

  const img = heroImageUrl(item)
  if (!img) return null
  const href = item.articlePreview?.url || item.tweetUrl
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="block">
      <img
        src={primary?.url || img}
        alt=""
        className={`max-w-full w-auto ${heightClass} rounded-2xl object-contain bg-black shadow-m-lg`}
        referrerPolicy="no-referrer"
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
    <article className="w-full lg:w-[340px] flex-shrink-0 bg-fsurface border border-fline rounded-2xl shadow-m-lg flex flex-col max-h-[32vh] lg:max-h-[84vh] overflow-hidden">
      <header className="flex items-start gap-3 p-4 pb-2 flex-shrink-0">
        <AuthorAvatar src={item.authorProfileImageUrl} author={item.author} size="md" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-fink truncate">{item.authorName || item.author}</p>
          <p className="text-sm text-fink-3 font-mono truncate">@{item.author}</p>
        </div>
        <a
          href={item.tweetUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-sm hover:opacity-80 flex-shrink-0"
          title="Open source"
        >
          <PlatformWordmark platform={item.platform} />
          <ExternalLink className="w-3.5 h-3.5 text-fink-3" />
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
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null)

  // Stop any speech when unmounting / switching items.
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel()
    }
  }, [text])

  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window

  const toggle = () => {
    if (!supported) return
    const synth = window.speechSynthesis
    if (playing) {
      synth.cancel()
      setPlaying(false)
      return
    }
    synth.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.rate = rate
    u.onend = () => setPlaying(false)
    u.onerror = () => setPlaying(false)
    utterRef.current = u
    synth.speak(u)
    setPlaying(true)
  }

  const cycleRate = () => {
    const next = rate >= 2 ? 0.75 : rate >= 1.5 ? 2 : rate >= 1 ? 1.5 : 1
    setRate(next)
    // Apply live: restart utterance at the new rate if currently speaking.
    if (playing && supported) {
      const synth = window.speechSynthesis
      synth.cancel()
      const u = new SpeechSynthesisUtterance(text)
      u.rate = next
      u.onend = () => setPlaying(false)
      u.onerror = () => setPlaying(false)
      utterRef.current = u
      synth.speak(u)
    }
  }

  const bars = 44
  const activeBars = playing ? bars : Math.round(bars * 0.3)

  return (
    <div className="flex items-center gap-3.5 pl-2.5 pr-3 py-2.5 rounded-full bg-fsurface border border-fline">
      <button
        onClick={toggle}
        disabled={!supported}
        aria-label={playing ? 'Pause' : 'Listen to article'}
        className="w-[42px] h-[42px] flex-none rounded-full bg-clay-grad shadow-glow flex items-center justify-center text-white disabled:opacity-40"
      >
        {playing ? <Pause className="w-[19px] h-[19px]" fill="currentColor" /> : <Play className="w-[19px] h-[19px]" fill="currentColor" />}
      </button>
      <div className="flex items-center gap-[2px] flex-1 min-w-0 h-[26px] overflow-hidden">
        {Array.from({ length: bars }).map((_, i) => {
          const h = 6 + Math.abs(Math.sin(i * 0.9)) * 18
          const on = i < activeBars
          return (
            <span
              key={i}
              className={cn('w-[3px] flex-none rounded-[3px]', on ? 'bg-clay' : 'bg-fline')}
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

function ArticleReader({ item }: { item: FeedItem }) {
  const paras = useMemo(() => articleParagraphs(item.articleContent?.blocks), [item.articleContent])
  const fallbackText = stripMediaUrls(item.text || '', !!item.media?.[0])
  const bodyParas = paras.length > 0 ? paras : fallbackText ? fallbackText.split(/\n{2,}/).filter(Boolean) : []
  const title = item.articlePreview?.title || item.authorName || item.author
  const source = item.articlePreview?.domain || (item.platform === 'twitter' ? 'x.com' : item.platform) || 'x.com'
  const fullText = bodyParas.join(' ')
  const minutes = readMinutes(fullText || title || '')

  return (
    <div className="w-full max-w-[700px] h-full flex flex-col gap-[18px] pt-1.5">
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

      {fullText && <div className="flex-none"><TtsPlayer text={fullText} minutes={minutes} /></div>}

      {/* full untruncated body — scrolls in-app */}
      <div className="font-serif text-[17px] leading-[1.7] text-fink overflow-y-auto flex-1 min-h-0">
        {bodyParas.map((p, i) => (
          <p key={i} className={i === bodyParas.length - 1 ? 'm-0' : 'mb-4'}>
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
    <div className="w-full max-w-[640px] max-h-full overflow-y-auto bg-fsurface border border-fline rounded-2xl shadow-m-lg p-6 lg:p-7">
      {/* quoting post header */}
      <div className="flex items-center gap-3 mb-4">
        <AuthorAvatar src={item.authorProfileImageUrl} author={item.author} size="md" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-fink truncate">{item.authorName || item.author}</p>
          <p className="text-xs font-mono text-fink-3 truncate">@{item.author}</p>
        </div>
        <a href={item.tweetUrl} target="_blank" rel="noopener noreferrer" title="Open source" className="hover:opacity-80 flex-none">
          <PlatformGlyph platform={(item.platform ?? 'twitter') as PlatformId} size={17} className="text-fink-2" />
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
          {(q?.authorProfileImageUrl || qc?.authorProfileImageUrl) ? (
            <AuthorAvatar src={q?.authorProfileImageUrl || qc?.authorProfileImageUrl} author={qHandle} size="sm" />
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
    <article className="w-full max-w-xl max-h-full overflow-y-auto bg-fsurface border border-fline rounded-2xl shadow-m-lg p-6 lg:p-7">
      <div className="flex items-center gap-3 mb-4">
        <AuthorAvatar src={item.authorProfileImageUrl} author={item.author} size="md" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-fink truncate">{item.authorName || item.author}</p>
          <p className="text-xs font-mono text-fink-3 truncate">@{item.author}</p>
        </div>
        <a href={item.tweetUrl} target="_blank" rel="noopener noreferrer" title="Open source" className="flex items-center gap-1 hover:opacity-80 flex-none">
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

export function MediaCard({ item }: { item: FeedItem }) {
  const hasMedia = !!heroImageUrl(item)
  const hasQuote = !!(item.isQuote && (item.quotedTweet || item.quoteContext))
  const isArticle =
    !!item.isXArticle ||
    !!(item.articleContent?.blocks && item.articleContent.blocks.length > 0) ||
    (!hasMedia && !!(item.articlePreview && (item.articlePreview.title || item.articlePreview.description)))

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
      <div className="w-full flex items-start justify-center">
        <QuoteView item={item} />
      </div>
    )
  }

  // Text-only hero.
  if (!hasMedia) {
    return (
      <div className="w-full flex items-start justify-center">
        <TextCard item={item} />
      </div>
    )
  }

  // Media + author card alongside (vertical video, photos, link image).
  return (
    <div className="w-full flex flex-col lg:flex-row gap-3 lg:gap-8 items-center lg:items-start justify-center">
      <div className="flex-1 min-w-0 w-full flex items-start justify-center">
        <MediaPanel item={item} />
      </div>
      <AuthorCard item={item} />
    </div>
  )
}
