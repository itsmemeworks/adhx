'use client'

import { useState } from 'react'
import { ExternalLink, Play, Search, Sparkles, Zap } from 'lucide-react'
import { PlatformGlyph } from '@/components/matter'
import { cn } from '@/lib/utils'
import { youtubeEmbedUrl, youtubeShortUrl, youtubeThumbnail } from '@/lib/media/youtube'
import { PreviewAnotherLink } from '@/components/PreviewAnotherLink'
import {
  PreviewShell,
  PreviewCta,
  ValueCard,
  useAddToCollection,
  useConnect,
} from '@/components/previews/PreviewShell'

interface YouTubePreviewLandingProps {
  videoId: string
  title?: string
  authorName?: string
  author?: string
  hasVideo: boolean
  isAuthenticated?: boolean
}

export function YouTubePreviewLanding({
  videoId,
  title,
  authorName,
  author,
  hasVideo,
  isAuthenticated = false,
}: YouTubePreviewLandingProps) {
  const [isPlaying, setIsPlaying] = useState(false)

  const shortUrl = youtubeShortUrl(videoId)
  const channel = author || (authorName ? authorName : '@youtube')

  const { connecting, connect } = useConnect()
  const { adding, addToCollection } = useAddToCollection({
    url: shortUrl,
    platform: 'youtube',
    id: videoId,
  })

  const sidebar = (
    <>
      <PreviewCta
        isAuthenticated={isAuthenticated}
        adding={adding}
        connecting={connecting}
        onAdd={addToCollection}
        onConnect={connect}
        canSave={hasVideo}
        shareTitle="YouTube Short — ADHX Preview"
      />
      <PreviewAnotherLink className="mt-4" />
    </>
  )

  const hero = (
    <article
      data-content="youtube-short"
      className="bg-surface rounded-card border border-hairline shadow-m-lg flex flex-col overflow-hidden min-h-[300px] w-full min-w-0"
    >
      <header className="px-4 pt-4 pb-3">
        <div className="flex items-center gap-3">
          <a
            href={shortUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 flex-1 min-w-0 group"
          >
            <div className="w-[42px] h-[42px] rounded-full flex items-center justify-center flex-shrink-0 bg-[#FF0000] text-white">
              <PlatformGlyph platform="youtube" size={22} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-[15px] text-ink truncate group-hover:text-clay transition-colors">
                {authorName || channel}
              </p>
              <p className="font-mono text-[12.5px] text-ink-3 truncate">{channel}</p>
            </div>
          </a>
          <a
            href={shortUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[12.5px] font-semibold bg-inset text-ink-2 hover:text-clay transition-colors"
            title="Watch on YouTube"
          >
            <PlatformGlyph platform="youtube" size={13} />
          </a>
        </div>
      </header>

      {title && (
        <div className="px-4 pb-3">
          <p
            className={cn(
              'text-[14.5px] text-ink-2 font-medium break-words leading-relaxed [overflow-wrap:anywhere]',
              hasVideo ? 'line-clamp-3' : '',
            )}
          >
            {title}
          </p>
        </div>
      )}

      {hasVideo && (
        <div className="px-4 pb-3">
          <div
            className="relative block rounded-2xl overflow-hidden bg-black group w-full mx-auto"
            style={{ aspectRatio: '9 / 16', maxWidth: 360 }}
          >
            {isPlaying ? (
              <iframe
                src={`${youtubeEmbedUrl(videoId)}?autoplay=1`}
                title={title || 'YouTube Short'}
                className="absolute inset-0 w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            ) : (
              <>
                <img
                  src={youtubeThumbnail(videoId)}
                  alt={title || 'YouTube Short thumbnail'}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
                <button
                  onClick={() => setIsPlaying(true)}
                  className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors"
                  aria-label="Play video"
                >
                  <div className="w-[60px] h-[60px] bg-[#FF0000] rounded-full flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                    <Play className="w-6 h-6 text-white ml-1" fill="currentColor" />
                  </div>
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {!hasVideo && (
        <div className="px-4 pb-4 text-center text-ink-3 text-sm">
          <p className="mb-1">
            YouTube ID: <code className="font-mono">{videoId}</code>
          </p>
          <p className="text-xs">
            This Short couldn&apos;t be previewed — it may be private, removed, or age-restricted.
          </p>
        </div>
      )}

      <footer className="px-4 py-3 flex items-center justify-between gap-3 min-w-0">
        <span className="flex items-center gap-2 text-[13px] font-medium text-ink-3">
          <PlatformGlyph platform="youtube" size={14} />
          YouTube Short
        </span>
        <a
          href={shortUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-[13px] font-semibold text-clay hover:opacity-80 transition-opacity"
          title="Watch on YouTube"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          View original
        </a>
      </footer>
    </article>
  )

  return <PreviewShell hero={hero} sidebar={sidebar} valueCard={<ValueCard rows={VALUE_ROWS} />} />
}

/** YouTube-specific value card copy. YouTube has no download. */
const VALUE_ROWS: Array<[React.ReactNode, string, string]> = [
  [
    <Sparkles key="s" className="w-[17px] h-[17px]" />,
    'One place for everything',
    'Shorts, TikToks, Reels, tweets & articles in one searchable home.',
  ],
  [
    <Zap key="z" className="w-[17px] h-[17px]" />,
    'Watch without the rabbit hole',
    'Play the Short right here — no recommendations, no doomscroll.',
  ],
  [
    <Search key="f" className="w-[17px] h-[17px]" />,
    'Actually find it later',
    'Full-text search across everything you save.',
  ],
]
