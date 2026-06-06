'use client'

import { ExternalLink, Instagram, Sparkles, FileText } from 'lucide-react'
import type { FeedItem } from './types'
import { AuthorAvatar } from './AuthorAvatar'
import { renderTextWithLinks, stripMediaUrls } from './utils'
import { XIcon } from '@/components/icons'

/**
 * Shared media-first card (the single triage/gallery view).
 * Media is the hero; the content card hugs its text and aligns to the top.
 * Videos autoplay muted (with controls, so they can be unmuted/scrubbed).
 */

/** Inline TikTok glyph (lucide ships none). */
function TikTokGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M19.589 6.686a4.793 4.793 0 0 1-3.77-4.245V2h-3.445v13.672a2.896 2.896 0 0 1-5.201 1.743 2.896 2.896 0 0 1 2.342-4.585c.28 0 .55.04.808.115V9.435a6.327 6.327 0 0 0-.808-.051 6.272 6.272 0 0 0-6.272 6.272A6.272 6.272 0 0 0 9.515 22h.005a6.272 6.272 0 0 0 6.272-6.272V8.687a8.182 8.182 0 0 0 4.773 1.526V6.78a4.795 4.795 0 0 1-.976-.094z" />
    </svg>
  )
}

/** Clear "which platform" wordmark, top-right of the card. */
function PlatformWordmark({ platform }: { platform?: FeedItem['platform'] }) {
  if (platform === 'instagram') {
    return (
      <span className="flex items-center gap-1 font-semibold text-gray-900 dark:text-white">
        <Instagram className="w-4 h-4" /> Instagram
      </span>
    )
  }
  if (platform === 'tiktok') {
    return (
      <span className="flex items-center gap-1 font-semibold text-gray-900 dark:text-white">
        <TikTokGlyph className="w-4 h-4" /> TikTok
      </span>
    )
  }
  return (
    <span className="flex items-center gap-0.5 font-bold text-gray-900 dark:text-white">
      <XIcon className="w-3.5 h-3.5" />
      <span>.com</span>
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

function QuotedPreview({ item }: { item: FeedItem }) {
  const q = item.quotedTweet
  const qc = item.quoteContext
  if (!q && !qc) return null
  const name = q?.authorName || q?.author || qc?.authorName || qc?.author || 'unknown'
  const handle = q?.author || qc?.author || ''
  const text = q?.text || qc?.text || ''
  const thumb = quoteThumb(item)
  const href = q?.tweetUrl || (handle ? `https://x.com/${handle}/status/${qc?.tweetId ?? ''}` : undefined)
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex gap-2 p-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
    >
      {thumb && (
        <img
          src={thumb}
          alt=""
          className="w-14 h-14 rounded-lg object-cover flex-shrink-0 bg-gray-200 dark:bg-gray-700"
          referrerPolicy="no-referrer"
        />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-gray-900 dark:text-white truncate">
          {name} {handle && <span className="text-gray-400 font-normal">@{handle}</span>}
        </p>
        {text && <p className="text-xs text-gray-600 dark:text-gray-300 line-clamp-3 mt-0.5">{text}</p>}
      </div>
    </a>
  )
}

/** The poster image to use as the hero when there's no first-class media. */
function heroImageUrl(item: FeedItem): string | null {
  if (item.media?.[0]?.thumbnailUrl) return item.media[0].thumbnailUrl
  if (item.articlePreview?.imageUrl) return item.articlePreview.imageUrl
  return null
}

function MediaPanel({ item }: { item: FeedItem }) {
  const primary = item.media?.[0]
  const isVideo = primary?.mediaType === 'video' || primary?.mediaType === 'animated_gif'
  const heightClass = 'max-h-[50vh] lg:max-h-[84vh]'

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
        className={`max-w-full w-auto ${heightClass} rounded-2xl object-contain bg-black`}
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
            className={`snap-center ${heightClass} w-auto max-w-full object-contain rounded-2xl bg-black flex-shrink-0`}
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
        className={`max-w-full w-auto ${heightClass} rounded-2xl object-contain bg-black`}
        referrerPolicy="no-referrer"
      />
    </a>
  )
}

export function MediaCard({ item }: { item: FeedItem }) {
  const hasMedia = !!heroImageUrl(item)
  const text = stripMediaUrls(item.text || '', !!item.media?.[0])
  const hasQuote = !!(item.isQuote && (item.quotedTweet || item.quoteContext))
  const article = item.articlePreview
  // Show an article block when this is an X Article / link-article and we
  // aren't already showing its text as the body.
  const showArticle = !!(article && (article.title || article.description))
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
    // items-start so the content card's top lines up with the media's top.
    <div className="w-full flex flex-col lg:flex-row gap-3 lg:gap-4 items-center lg:items-start justify-center">
      {hasMedia && (
        <div className="flex-1 min-w-0 w-full flex items-start justify-center">
          <MediaPanel item={item} />
        </div>
      )}

      <article
        className={`w-full ${hasMedia ? 'lg:w-[340px]' : 'lg:max-w-xl'} flex-shrink-0 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl flex flex-col max-h-[32vh] lg:max-h-[84vh] overflow-hidden`}
      >
        <header className="flex items-start gap-3 p-4 pb-2 flex-shrink-0">
          <AuthorAvatar src={item.authorProfileImageUrl} author={item.author} size="md" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-gray-900 dark:text-white truncate">
              {item.authorName || item.author}
            </p>
            <p className="text-sm text-gray-500 truncate">@{item.author}</p>
          </div>
          <a
            href={item.tweetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-sm hover:opacity-80 flex-shrink-0"
            title="Open source"
          >
            <PlatformWordmark platform={item.platform} />
            <ExternalLink className="w-3.5 h-3.5 text-gray-400" />
          </a>
        </header>

        <div className="overflow-y-auto px-4 pb-4 flex flex-col gap-3">
          {text && (
            <p className="text-[15px] leading-relaxed text-gray-800 dark:text-gray-100 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
              {renderTextWithLinks(text)}
            </p>
          )}

          {showArticle && (
            <a
              href={article!.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-xl border border-gray-200 dark:border-gray-700 p-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
            >
              <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-1">
                <FileText className="w-3.5 h-3.5" />
                {article!.domain || 'Article'}
              </div>
              {article!.title && (
                <p className="font-semibold text-gray-900 dark:text-white leading-snug">{article!.title}</p>
              )}
              {article!.description && (
                <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-3 mt-1">
                  {article!.description}
                </p>
              )}
            </a>
          )}

          {hasQuote && <QuotedPreview item={item} />}

          {item.summary && (
            <div className="flex items-start gap-2 p-2.5 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <Sparkles className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-gray-700 dark:text-gray-300">{item.summary}</p>
            </div>
          )}

          {created && (
            <p className="text-xs text-gray-400 dark:text-gray-500 border-t border-gray-100 dark:border-gray-800 pt-2">
              {created}
            </p>
          )}

          {item.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {item.tags.map((t) => (
                <span
                  key={t}
                  className="px-2 py-0.5 text-xs rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300"
                >
                  #{t}
                </span>
              ))}
            </div>
          )}
        </div>
      </article>
    </div>
  )
}
