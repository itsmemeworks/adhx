/**
 * Utility functions for feed components
 *
 * This file is a re-exporting facade over the split-out modules below so
 * every existing `@/components/feed/utils` import keeps working unchanged:
 * - `./media-actions` — share/copy/download actions for media + preview links
 * - `./device` — touch/iOS device detection
 * - `./text-rendering` — clickable-link text, Bionic Reading, article blocks
 */
import React from 'react'
import { Monitor } from 'lucide-react'
import { formatFileSize } from './media-actions'

export {
  previewUrlForItem,
  copyPreviewLink,
  sharePreviewLink,
  fallbackToOriginal,
  isMediaAvailable,
  handleDownloadMedia,
  formatFileSize,
  handleShareMedia,
  type ShareMediaResult,
} from './media-actions'

export { isTouchDevice, isIOSDevice } from './device'

export {
  toBionicText,
  renderTextWithLinks,
  renderBionicTextWithLinks,
  stripMediaUrls,
  decodeHtmlEntities,
  renderStyledText,
  renderArticleBlock,
} from './text-rendering'

/**
 * Message shown when mobile user tries to download a video that's too large.
 */
interface VideoDownloadBlockedProps {
  estimatedSize: number
  onDismiss: () => void
  /** Compact mode for smaller containers (preview page) */
  compact?: boolean
  /** CSS aspect ratio for container sizing */
  aspectRatio?: string
}

/**
 * The warm "this one is new" glow. Already the language for posts newer than
 * the last sync (FeedCard) and for the leaderboard's number one, so a
 * just-pasted post reuses it rather than introducing a third idiom — and it
 * replaces the transient "Added" pill, which announced the same thing by
 * pushing the whole grid down (owner: "the added notification pushes all the
 * content down… just something subtle").
 *
 * It is the `shadow-glow` TOKEN, not an arbitrary value. The arbitrary version
 * this replaced was inlined in FeedCard, and moving it into this constant
 * silently broke it: Tailwind generates utilities it finds as class literals,
 * so a class assembled from a JS constant got applied to the element with no
 * rule behind it — the class was in the DOM and the computed shadow was empty.
 * `shadow-glow` is already generated, theme-aware (see `--m-glow`), and is the
 * same accent the leaderboard's number one uses, which is the treatment the
 * owner asked for by name.
 */
export const RECENT_GLOW = 'shadow-glow'

export function VideoDownloadBlocked({
  estimatedSize,
  onDismiss,
  compact = false,
  aspectRatio,
}: VideoDownloadBlockedProps): React.ReactElement {
  return (
    <div
      style={aspectRatio ? { aspectRatio } : undefined}
      className={`flex flex-col items-center justify-center gap-4 bg-inset w-full ${
        compact ? 'p-6 rounded-xl' : 'p-8 rounded-xl lg:rounded-2xl max-w-md mx-auto'
      }`}
    >
      <div
        className={`rounded-full bg-clay/15 flex items-center justify-center ${
          compact ? 'w-16 h-16' : 'w-20 h-20'
        }`}
      >
        <Monitor className={compact ? 'w-8 h-8 text-clay' : 'w-10 h-10 text-clay'} />
      </div>
      <div className="text-center">
        <p className={`text-white font-medium ${compact ? 'text-lg' : 'text-xl'}`}>
          Whoa there, data hoarder! 📱
        </p>
        <p className={`text-ink-3 ${compact ? 'mt-1' : 'mt-2'}`}>
          ~{formatFileSize(estimatedSize)}
        </p>
      </div>
      <p className={`text-ink-3 text-center ${compact ? 'text-sm max-w-xs' : ''}`}>
        This chunky boi is too thicc for your phone. Pop open your laptop for instant downloads with
        a progress bar and everything.
      </p>
      <button
        onClick={onDismiss}
        className={`mt-2 bg-clay-grad shadow-glow rounded-lg text-white font-medium transition-colors ${
          compact ? 'px-5 py-2 text-sm' : 'px-6 py-2'
        }`}
      >
        Fine, I&apos;ll watch it instead
      </button>
    </div>
  )
}
