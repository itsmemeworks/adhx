'use client'

/**
 * "Save collection · N" CTA shared by the desktop and mobile collection-mode
 * chrome (`/t/{username}/{tag}` theater). State is owned by `TheaterShell`
 * (the clone POST + sign-in-modal orchestration lives there so it's a single
 * source of truth across both chromes) — this component is purely
 * presentational per `status`.
 */

import { Bookmark, Check, Loader2 } from 'lucide-react'
import type { SaveCollectionStatus } from './types'

export interface SaveCollectionButtonProps {
  count: number
  status: SaveCollectionStatus
  onSave: () => void
  /** Full button class string — callers own the visual style (both chromes pass their Save-outline style: clay border on glass). */
  className: string
}

export function SaveCollectionButton({
  count,
  status,
  onSave,
  className,
}: SaveCollectionButtonProps) {
  if (status === 'saved') {
    return (
      <a href="/" className={className}>
        <Check size={14} />
        Saved &middot; View in your collection
      </a>
    )
  }

  return (
    <button type="button" onClick={onSave} disabled={status === 'saving'} className={className}>
      {status === 'saving' ? (
        <Loader2 size={14} className="animate-spin" />
      ) : (
        <Bookmark size={14} />
      )}
      {status === 'error' ? 'Try again' : `Save collection · ${count}`}
    </button>
  )
}
