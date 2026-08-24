'use client'

/**
 * "Save playlist · N" CTA shared by the desktop and mobile playlist-mode
 * chrome (`/t/{username}/{tag}` theater). State is owned by `TheaterShell`
 * (the clone POST + sign-in-modal orchestration lives there so it's a single
 * source of truth across both chromes) — this component is purely
 * presentational per `status`.
 */

import { Bookmark, Check, Loader2 } from 'lucide-react'
import type { SavePlaylistStatus } from './types'
import { StageIconButton } from './stage-primitives'
import { StageGlass } from './StageGlass'

export interface SavePlaylistButtonProps {
  count: number
  status: SavePlaylistStatus
  onSave: () => void
  /** Full button class string — callers own the visual style (both chromes pass their Save-outline style: clay border on glass). */
  className: string
  /** Mobile action row: icon + aria-label only (no room for the pill label). */
  iconOnly?: boolean
}

export function SavePlaylistButton({
  count,
  status,
  onSave,
  className,
  iconOnly,
}: SavePlaylistButtonProps) {
  // Saved state points at the LIBRARY (the grid), not `/` — the cloned posts
  // landed among the viewer's own saves, and `/` is the theater now. This is
  // deliberately not "playlist" wording: what they're being sent to is their
  // own collection of saved posts, not the playlist they just cloned.
  if (iconOnly) {
    if (status === 'saved') {
      return (
        <StageIconButton
          href="/library"
          aria-label="Saved · View in your library"
          className={className}
        >
          <Check size={16} />
        </StageIconButton>
      )
    }
    return (
      <StageIconButton
        onClick={onSave}
        disabled={status === 'saving'}
        aria-label={
          status === 'error'
            ? 'Try again'
            : status === 'saving'
              ? 'Saving playlist'
              : `Save playlist · ${count}`
        }
        className={className}
      >
        {status === 'saving' ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <Bookmark size={16} />
        )}
      </StageIconButton>
    )
  }

  if (status === 'saved') {
    return (
      <StageGlass as="a" href="/library" className={className}>
        <Check size={14} />
        <span>Saved &middot; View in your library</span>
      </StageGlass>
    )
  }

  return (
    <StageGlass
      as="button"
      type="button"
      onClick={onSave}
      disabled={status === 'saving'}
      className={className}
    >
      {status === 'saving' ? (
        <Loader2 size={14} className="animate-spin" />
      ) : (
        <Bookmark size={14} />
      )}
      <span>{status === 'error' ? 'Try again' : `Save playlist · ${count}`}</span>
    </StageGlass>
  )
}
