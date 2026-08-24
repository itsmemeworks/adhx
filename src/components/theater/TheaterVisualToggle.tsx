'use client'

/**
 * Live-queue lens: videos and photos only. Same frost circle as paste.
 * Clay when on, like Repeat. Saved / playlists do not mount this.
 */

import { Images } from 'lucide-react'
import { cn } from '@/lib/utils'

export function TheaterVisualToggle({
  visualOnly,
  onToggle,
}: {
  visualOnly: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={visualOnly}
      aria-label={
        visualOnly ? 'Showing videos and photos. Show every post' : 'Show videos and photos only'
      }
      title={visualOnly ? 'Videos and photos' : 'Show videos and photos only'}
      data-theater-action="visual"
      className={cn(
        'inline-flex h-10 w-10 flex-none items-center justify-center rounded-full border border-white/25 bg-white/10 text-white backdrop-blur-md transition-colors hover:bg-white/20',
        visualOnly && 'border-clay text-clay hover:text-clay',
      )}
    >
      <Images size={16} />
    </button>
  )
}
