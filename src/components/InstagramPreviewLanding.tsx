'use client'

import { ExternalLink, Search, Sparkles, Zap } from 'lucide-react'
import { PlatformGlyph } from '@/components/matter'
import { VideoPlayer } from '@/components/feed/VideoPlayer'
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

interface InstagramPreviewLandingProps {
  reelId: string
  caption?: string
  description?: string
  imageUrl?: string
  author?: string
  authorName?: string
  isAuthenticated?: boolean
}

export function InstagramPreviewLanding({
  reelId,
  caption,
  description,
  imageUrl,
  author,
  authorName,
  isAuthenticated = false,
}: InstagramPreviewLandingProps) {
  const instagramUrl = `https://www.instagram.com/reel/${reelId}/`

  const { connecting, connect } = useConnect()
  const { adding, addToCollection } = useAddToCollection({
    url: instagramUrl,
    platform: 'instagram',
    id: reelId,
  })

  const sidebar = (
    <>
      <PreviewCta
        isAuthenticated={isAuthenticated}
        adding={adding}
        connecting={connecting}
        onAdd={addToCollection}
        onConnect={connect}
        shareTitle="Instagram — ADHX Preview"
        downloadUrl={`/api/media/instagram/video/download?id=${encodeURIComponent(reelId)}`}
        showDownload={!!imageUrl}
      />
      <PreviewAnotherLink className="mt-4" />
    </>
  )

  const hero = (
    <article
      data-content="instagram-reel"
      className="bg-surface rounded-card border border-hairline shadow-m-lg flex flex-col overflow-hidden min-h-[300px] w-full min-w-0"
    >
      <header className="px-4 pt-4 pb-3">
        <div className="flex items-center gap-3">
          <a
            href={instagramUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 flex-1 min-w-0 group"
          >
            <div
              className="w-[42px] h-[42px] rounded-full flex items-center justify-center flex-shrink-0 text-white"
              style={{
                background: 'linear-gradient(45deg, #F58529, #DD2A7B, #8134AF)',
              }}
            >
              <PlatformGlyph platform="instagram" size={22} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-[15px] text-ink truncate group-hover:text-clay transition-colors">
                {authorName || author || 'Instagram'}
              </p>
              <p className="font-mono text-[12.5px] text-ink-3 truncate">
                {author || `Reel · ${reelId}`}
              </p>
            </div>
          </a>
          <a
            href={instagramUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[12.5px] font-semibold bg-inset text-ink-2 hover:text-clay transition-colors"
            title="View on Instagram"
          >
            <PlatformGlyph platform="instagram" size={13} />
          </a>
        </div>
      </header>

      {/* Caption — placed above media to match X tweet text/media order.
          Auto-collapses to 3 lines when a poster is present. */}
      {(caption || description) && (
        <div className="px-4 pb-3">
          <p
            className={cn(
              'text-[14.5px] text-ink-2 break-words leading-relaxed [overflow-wrap:anywhere]',
              imageUrl ? 'line-clamp-3' : 'whitespace-pre-wrap',
            )}
          >
            {caption || description}
          </p>
        </div>
      )}

      {/* Inline Reel playback — streamed through the IG video proxy (mirror
          registry), with the poster as the loading image. Falls back to a
          link-out on a mirror miss (VideoPlayer's own error state). */}
      {imageUrl && (
        <div className="px-4 pb-3">
          <div className="group relative">
            <VideoPlayer
              author={author || 'instagram'}
              tweetId={reelId}
              platform="instagram"
              poster={imageUrl}
              tweetUrl={instagramUrl}
              className="w-full aspect-[9/16] object-contain rounded-2xl bg-black"
            />
            {/* Touch: share the video to another app; desktop: hover → download. */}
            <div className="pointer-events-auto absolute right-3 top-3 z-10">
              <MediaShareOverlayButton
                streamUrl={`/api/media/instagram/video?id=${encodeURIComponent(reelId)}`}
                downloadUrl={`/api/media/instagram/video/download?id=${encodeURIComponent(reelId)}`}
                title={`Instagram Reel ${reelId}`}
              />
            </div>
          </div>
        </div>
      )}

      {!imageUrl && !caption && !description && (
        <div className="px-4 pb-4 text-center text-ink-3 text-sm">
          <p className="mb-1">
            Reel ID: <code className="font-mono">{reelId}</code>
          </p>
          <p className="text-xs">
            We couldn&apos;t pull a preview for this Reel — open it on Instagram below. You can
            still save it to your collection.
          </p>
        </div>
      )}

      {/* Footer */}
      <footer className="px-4 py-3 flex items-center justify-between gap-3 min-w-0">
        <span className="flex items-center gap-2 text-[13px] font-medium text-ink-3">
          <PlatformGlyph platform="instagram" size={14} />
          Instagram post
        </span>
        <a
          href={instagramUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-[13px] font-semibold text-clay hover:opacity-80 transition-opacity"
          title="View on Instagram"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          View original
        </a>
      </footer>
    </article>
  )

  return <PreviewShell hero={hero} sidebar={sidebar} valueCard={<ValueCard rows={VALUE_ROWS} />} />
}

/** Instagram-specific value card copy. */
const VALUE_ROWS: Array<[React.ReactNode, string, string]> = [
  [
    <Sparkles key="s" className="w-[17px] h-[17px]" />,
    'One place for everything',
    'Reels, TikToks, Shorts, tweets & articles in one searchable home.',
  ],
  [
    <Zap key="z" className="w-[17px] h-[17px]" />,
    'Save it before it vanishes',
    'The full video, caption & poster — saved (and downloadable) in one tap.',
  ],
  [
    <Search key="f" className="w-[17px] h-[17px]" />,
    'Actually find it later',
    'Full-text search across everything you save.',
  ],
]
