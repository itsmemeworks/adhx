'use client'

import { Archive as ArchiveIcon } from 'lucide-react'
import { StageGlass } from './StageGlass'
import { StageIconButton } from './stage-primitives'
import type { TheaterPersonalChrome } from './types'

/** Same glass as Download / Link, distinguished by a clay border — not a filled CTA. */
const DESKTOP_OUTLINE =
  'inline-flex h-11 items-center justify-center gap-1.5 rounded-full border border-clay px-5 text-[12.5px] font-semibold text-white transition-colors hover:bg-white/10 disabled:opacity-60'

/**
 * Collection-tab Archive — the one extra action vs Live (Download / Link /
 * Tag / Open live in the shared chrome row). Sits left of Download.
 * Mobile is the 44px glass circle with a clay border; desktop is the
 * labelled outline pill.
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
        className="border-clay"
        data-theater-action="archive"
      >
        <ArchiveIcon size={16} />
      </StageIconButton>
    )
  }
  return (
    <StageGlass
      as="button"
      type="button"
      onClick={collection.onDone}
      title="Archive — take it out of Saved"
      className={DESKTOP_OUTLINE}
      data-theater-action="archive"
    >
      <ArchiveIcon size={14} />
      <span>Archive</span>
    </StageGlass>
  )
}
