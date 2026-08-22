'use client'

import { Archive as ArchiveIcon, Clock, ExternalLink, Tag as TagIcon, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { StageIconButton } from './stage-primitives'
import type { TheaterPersonalChrome } from './types'

const DESKTOP_GLASS =
  'inline-flex h-11 items-center justify-center gap-1.5 rounded-full border border-white/25 bg-white/[0.14] px-4 text-[12.5px] font-semibold text-white transition-colors hover:bg-white/20 disabled:opacity-60'
const DESKTOP_PRIMARY =
  'inline-flex h-11 items-center justify-center gap-1.5 rounded-full bg-clay-grad px-5 text-[12.5px] font-semibold text-white shadow-glow transition-opacity hover:opacity-90 disabled:opacity-60'
const MOBILE_PILL =
  'inline-flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl border border-white/25 bg-white/[0.14] text-[11px] font-semibold text-white'

/**
 * Collection-tab Later / Tag / Delete / Archive (+ Open). Same wiring on
 * both chromes; layouts stay different (glass row vs 44px stacked pills).
 */
export function TheaterCollectionActions({
  collection,
  tagCount,
  openUrl,
  platformLabel,
  variant,
}: {
  collection: TheaterPersonalChrome
  tagCount: number
  openUrl: string | null
  platformLabel: string
  variant: 'desktop' | 'mobile'
}) {
  const desktop = variant === 'desktop'
  const icon = desktop ? 14 : 16

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={collection.onLater}
        className={desktop ? DESKTOP_GLASS : MOBILE_PILL}
      >
        <Clock size={icon} />
        <span>Later</span>
      </button>
      <button
        type="button"
        onClick={collection.onTag}
        className={
          desktop
            ? cn(DESKTOP_GLASS, tagCount > 0 && 'border-clay/50 text-clay')
            : cn(
                'inline-flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl border bg-white/10 text-[11px] font-semibold backdrop-blur-md',
                tagCount > 0 ? 'border-clay/50 text-clay' : 'border-white/25 text-white',
              )
        }
      >
        <TagIcon size={icon} fill={tagCount > 0 ? 'currentColor' : 'none'} />
        <span>{tagCount > 0 ? `Tag · ${tagCount}` : 'Tag'}</span>
      </button>
      <button
        type="button"
        onClick={collection.onDelete}
        className={desktop ? DESKTOP_GLASS : MOBILE_PILL}
      >
        <Trash2 size={icon} />
        <span>Delete</span>
      </button>
      <button
        type="button"
        onClick={collection.onDone}
        title="Archive — take it out of your collection queue"
        className={
          desktop
            ? DESKTOP_PRIMARY
            : 'inline-flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl bg-done/25 text-[11px] font-semibold text-done'
        }
      >
        <ArchiveIcon size={icon} />
        <span>Archive</span>
      </button>
      {openUrl &&
        (desktop ? (
          <a
            href={openUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={`Open on ${platformLabel}`}
            className={DESKTOP_GLASS}
          >
            <ExternalLink size={14} />
            <span>Open</span>
          </a>
        ) : (
          <StageIconButton
            href={openUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open on ${platformLabel}`}
          >
            <ExternalLink size={16} />
          </StageIconButton>
        ))}
    </div>
  )
}
