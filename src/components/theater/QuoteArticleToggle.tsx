'use client'

import { BookOpen, TvMinimalPlay } from 'lucide-react'
import { cn } from '@/lib/utils'
import { StageGlass } from './StageGlass'
import { StageIconButton } from './stage-primitives'

const GLASS =
  'inline-flex h-11 items-center justify-center gap-1.5 rounded-full px-4 text-[12.5px] font-semibold text-white transition-colors disabled:opacity-60'

export interface QuoteArticleToggleProps {
  articleMode: boolean
  onToggle: () => void
  iconOnly?: boolean
  className?: string
}

/**
 * Watch ↔ Read. Theater default is full-bleed parent media with a 2-line
 * caption; Read opens the article (full text + quote). Watch is a TV, not
 * Film — Film is Download.
 */
export function QuoteArticleToggle({
  articleMode,
  onToggle,
  iconOnly = false,
  className,
}: QuoteArticleToggleProps) {
  const label = articleMode ? 'Watch' : 'Read'
  const Icon = articleMode ? TvMinimalPlay : BookOpen
  const title = articleMode ? 'Back to watching' : 'Read the full post'

  if (iconOnly) {
    return (
      <StageIconButton onClick={onToggle} aria-label={label} title={title} className={className}>
        <Icon size={16} />
      </StageIconButton>
    )
  }

  return (
    <StageGlass
      as="button"
      type="button"
      onClick={onToggle}
      title={title}
      className={cn(GLASS, className)}
    >
      <Icon size={14} />
      <span>{label}</span>
    </StageGlass>
  )
}
