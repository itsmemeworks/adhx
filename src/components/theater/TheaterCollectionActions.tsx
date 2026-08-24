'use client'

import { Archive as ArchiveIcon } from 'lucide-react'
import { StageIconButton } from './stage-primitives'
import type { TheaterPersonalChrome } from './types'

const DESKTOP_PRIMARY =
  'inline-flex h-11 items-center justify-center gap-1.5 rounded-full bg-clay-grad px-5 text-[12.5px] font-semibold text-white shadow-glow transition-opacity hover:opacity-90 disabled:opacity-60'

/**
 * Collection-tab Archive — the one extra action vs Live (Download / Link /
 * Tag / Open live in the shared chrome row). Mobile matches Tag/Share/Open
 * (44px glass circle). Desktop keeps the labelled clay pill.
 */
export function TheaterCollectionActions({
  collection,
  variant,
}: {
  collection: TheaterPersonalChrome
  variant: 'desktop' | 'mobile'
}) {
  if (variant === 'mobile') {
    return (
      <StageIconButton
        onClick={() => collection.onDone()}
        aria-label="Archive"
        data-theater-action="archive"
      >
        <ArchiveIcon size={16} />
      </StageIconButton>
    )
  }
  return (
    <button
      type="button"
      onClick={collection.onDone}
      title="Archive — take it out of Saved"
      className={DESKTOP_PRIMARY}
      data-theater-action="archive"
    >
      <ArchiveIcon size={14} />
      <span>Archive</span>
    </button>
  )
}
