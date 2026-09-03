'use client'

import { TvMinimalPlay } from 'lucide-react'
import { cn } from '@/lib/utils'
import { StageGlass } from './StageGlass'
import { StageIconButton } from './stage-primitives'

const GLASS =
  'inline-flex h-11 items-center justify-center gap-1.5 rounded-full px-4 text-[12.5px] font-semibold text-white transition-colors disabled:opacity-60'

export interface QuoteArticleToggleProps {
  onToggle: () => void
  iconOnly?: boolean
  className?: string
}

/**
 * Read mode's route back to full-bleed playback. Watch is a TV, not Film —
 * Film is Download. Opening Read is handled by tapping the media caption.
 */
export function QuoteArticleToggle({
  onToggle,
  iconOnly = false,
  className,
}: QuoteArticleToggleProps) {
  if (iconOnly) {
    return (
      <StageIconButton
        onClick={onToggle}
        aria-label="Watch"
        title="Back to watching"
        className={className}
        data-theater-action="read"
      >
        <TvMinimalPlay size={16} />
      </StageIconButton>
    )
  }

  return (
    <StageGlass
      as="button"
      type="button"
      onClick={onToggle}
      title="Back to watching"
      className={cn(GLASS, className)}
      data-theater-action="read"
    >
      <TvMinimalPlay size={14} />
      <span>Watch</span>
    </StageGlass>
  )
}
