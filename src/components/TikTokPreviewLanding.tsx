'use client'

import { useState } from 'react'
import { ExternalLink, Play, Search, Sparkles, Zap } from 'lucide-react'
import { PlatformGlyph } from '@/components/matter'
import { formatCompactRelativeTime } from '@/lib/utils/format'
import { MediaShareOverlayButton } from '@/components/previews/MediaShareOverlayButton'
import { PreviewAnotherLink } from '@/components/PreviewAnotherLink'
import {
  PreviewShell,
  PreviewCta,
  ValueCard,
  useAddToCollection,
  useConnect,
} from '@/components/previews/PreviewShell'
import { cn } from '@/lib/utils'

/**
 * TikTok video IDs are Snowflake-style: the high 32 bits are the Unix creation
 * time (seconds). Derive the post date from the id — no metadata fetch needed.
 */
function tiktokDateFromId(id: string): string | null {
  try {
    const secs = Number(BigInt(id) >> BigInt(32))
    if (secs < 1_400_000_000 || secs > 4_000_000_000) return null // ~2014–2096 sanity check
    return new Date(secs * 1000).toISOString()
  } catch {
    return null
  }
}

interface TikTokPreviewLandingProps {
  username: string
  videoId: string
  authorName?: string
  author?: string
  description?: string
  hasVideo: boolean
  isAuthenticated?: boolean
}

export function TikTokPreviewLanding({
  username,
  videoId,
  authorName,
  author,
  description,
  hasVideo,
  isAuthenticated = false,
}: TikTokPreviewLandingProps) {
  const [isPlaying, setIsPlaying] = useState(false)

  const handle = username.startsWith('@') ? username.slice(1) : username
  const tiktokUrl = `https://www.tiktok.com/@${handle}/video/${videoId}`
  const streamUrl = `/api/media/tiktok/video?username=${encodeURIComponent(handle)}&id=${encodeURIComponent(videoId)}`
  const downloadUrl = `/api/media/tiktok/video/download?username=${encodeURIComponent(handle)}&id=${encodeURIComponent(videoId)}`
  const posterUrl = `/api/media/tiktok/thumbnail?username=${encodeURIComponent(handle)}&id=${encodeURIComponent(videoId)}`
  const postedAt = tiktokDateFromId(videoId)

  const { connecting, connect } = useConnect()
  const { adding, addToCollection } = useAddToCollection({
    url: tiktokUrl,
    platform: 'tiktok',
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
        shareTitle={`TikTok @${handle} ${videoId}`}
        downloadUrl={downloadUrl}
        showDownload={hasVideo}
      />
      <PreviewAnotherLink className="mt-4" />
    </>
  )

  const hero = (
    <article
      data-content="tiktok-video"
      className="bg-surface rounded-card border border-hairline shadow-m-lg flex flex-col overflow-hidden min-h-[300px] w-full min-w-0"
    >
      <header className="px-4 pt-4 pb-3">
        <div className="flex items-center gap-3">
          <a
            href={tiktokUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 flex-1 min-w-0 group"
          >
            <div className="w-[42px] h-[42px] rounded-full flex items-center justify-center flex-shrink-0 bg-black">
              <TikTokGlyph className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-[15px] text-ink truncate group-hover:text-clay transition-colors">
                {authorName || author || `@${handle}`}
              </p>
              <p className="font-mono text-[12.5px] text-ink-3 truncate">
                {author || `@${handle}`}
              </p>
            </div>
          </a>
          <a
            href={tiktokUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[12.5px] font-semibold bg-inset text-ink-2 hover:text-clay transition-colors"
            title="View on TikTok"
          >
            {postedAt && <span className="font-mono">{formatCompactRelativeTime(postedAt)}</span>}
            <PlatformGlyph platform="tiktok" size={13} />
          </a>
        </div>
      </header>

      {description && (
        <div className="px-4 pb-3">
          <p
            className={cn(
              'text-[14.5px] text-ink-2 break-words leading-relaxed [overflow-wrap:anywhere]',
              hasVideo ? 'line-clamp-3' : 'whitespace-pre-wrap',
            )}
          >
            {description}
          </p>
        </div>
      )}

      {hasVideo && (
        <div className="px-4 pb-3">
          <div
            className="relative block rounded-2xl overflow-hidden bg-black group w-full"
            style={{ aspectRatio: '9 / 16' }}
          >
            {isPlaying ? (
              <video
                src={streamUrl}
                controls
                autoPlay
                playsInline
                className="w-full h-full object-contain bg-black"
              />
            ) : (
              <>
                {/* Glyph fallback sits behind the poster (shown if it fails to load). */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <TikTokGlyph className="w-20 h-20 opacity-30" />
                </div>
                <img
                  src={posterUrl}
                  alt={description || 'TikTok video'}
                  className="absolute inset-0 w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none'
                  }}
                />
                <button
                  onClick={() => setIsPlaying(true)}
                  className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors"
                  aria-label="Play video"
                >
                  <div className="w-[60px] h-[60px] bg-white/90 rounded-full flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                    <Play className="w-6 h-6 text-gray-900 ml-1" fill="currentColor" />
                  </div>
                </button>
              </>
            )}
            <div className="absolute top-3 right-3 pointer-events-auto">
              <MediaShareOverlayButton
                streamUrl={streamUrl}
                downloadUrl={downloadUrl}
                filename={`tiktok-${handle}-${videoId}.mp4`}
                title={`TikTok @${handle} ${videoId}`}
              />
            </div>
          </div>
        </div>
      )}

      {!hasVideo && !description && (
        <div className="px-4 pb-4 text-center text-ink-3 text-sm">
          <p className="mb-1">
            TikTok ID: <code className="font-mono">{videoId}</code>
          </p>
          <p className="text-xs">
            This TikTok couldn&apos;t be previewed — it may be private, removed, or the embed
            service is down.
          </p>
        </div>
      )}

      <footer className="px-4 py-3 flex items-center justify-between gap-3 min-w-0">
        <span className="flex items-center gap-2 text-[13px] font-medium text-ink-3">
          <PlatformGlyph platform="tiktok" size={14} />
          TikTok video
        </span>
        <a
          href={tiktokUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-[13px] font-semibold text-clay hover:opacity-80 transition-opacity"
          title="View on TikTok"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          View original
        </a>
      </footer>
    </article>
  )

  return <PreviewShell hero={hero} sidebar={sidebar} valueCard={<ValueCard rows={VALUE_ROWS} />} />
}

/** TikTok-specific value card copy. */
const VALUE_ROWS: Array<[React.ReactNode, string, string]> = [
  [
    <Sparkles key="s" className="w-[17px] h-[17px]" />,
    'One place for everything',
    'TikToks, Reels, Shorts, tweets & articles in one searchable home.',
  ],
  [
    <Zap key="z" className="w-[17px] h-[17px]" />,
    'Save it before it vanishes',
    'Preview any TikTok and save it to your collection — alongside your tweets and articles.',
  ],
  [
    <Search key="f" className="w-[17px] h-[17px]" />,
    'Actually find it later',
    'Full-text search across everything you save.',
  ],
]

/** TikTok brand glyph — inline SVG since lucide doesn't ship one. */
function TikTokGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        fill="#25F4EE"
        d="M19.589 6.686a4.793 4.793 0 0 1-3.77-4.245V2h-3.445v13.672a2.896 2.896 0 0 1-5.201 1.743 2.896 2.896 0 0 1 2.342-4.585c.28 0 .55.04.808.115V9.435a6.327 6.327 0 0 0-.808-.051 6.272 6.272 0 0 0-6.272 6.272A6.272 6.272 0 0 0 9.515 22h.005a6.272 6.272 0 0 0 6.272-6.272V8.687a8.182 8.182 0 0 0 4.773 1.526V6.78a4.795 4.795 0 0 1-.976-.094z"
      />
      <path
        fill="#FE2C55"
        d="M18.589 7.686a4.793 4.793 0 0 1-3.77-4.245V3h-3.445v13.672a2.896 2.896 0 0 1-5.201 1.743 2.896 2.896 0 0 1 2.342-4.585c.28 0 .55.04.808.115v-3.51a6.327 6.327 0 0 0-.808-.051 6.272 6.272 0 0 0-6.272 6.272A6.272 6.272 0 0 0 8.515 23h.005a6.272 6.272 0 0 0 6.272-6.272V9.687a8.182 8.182 0 0 0 4.773 1.526V7.78a4.795 4.795 0 0 1-.976-.094z"
      />
      <path
        fill="#fff"
        d="M19.045 7.236a4.793 4.793 0 0 1-3.77-4.245v-.5h-3.445v13.672a2.896 2.896 0 0 1-5.201 1.743 2.896 2.896 0 0 1 2.342-4.585c.28 0 .55.04.808.115v-3.51a6.327 6.327 0 0 0-.808-.051 6.272 6.272 0 0 0-6.272 6.272A6.272 6.272 0 0 0 8.97 22.5h.005a6.272 6.272 0 0 0 6.272-6.272V9.187a8.182 8.182 0 0 0 4.773 1.526V7.28a4.795 4.795 0 0 1-.976-.094z"
      />
    </svg>
  )
}
