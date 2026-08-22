'use client'

import { Archive as ArchiveIcon } from 'lucide-react'
import type { TheaterPersonalChrome } from './types'

const DESKTOP_PRIMARY =
  'inline-flex h-11 items-center justify-center gap-1.5 rounded-full bg-clay-grad px-5 text-[12.5px] font-semibold text-white shadow-glow transition-opacity hover:opacity-90 disabled:opacity-60'
const MOBILE_PRIMARY =
  'inline-flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl bg-done/25 text-[11px] font-semibold text-done'

/**
 * Collection-tab Archive — the one extra action vs Live (Download / Link /
 * Tag / Open live in the shared chrome row).
 */
export function TheaterCollectionActions({
  collection,
  variant,
}: {
  collection: TheaterPersonalChrome
  variant: 'desktop' | 'mobile'
}) {
  const desktop = variant === 'desktop'
  return (
    <button
      type="button"
      onClick={collection.onDone}
      title="Archive — take it out of your collection queue"
      className={desktop ? DESKTOP_PRIMARY : MOBILE_PRIMARY}
    >
      <ArchiveIcon size={desktop ? 14 : 16} />
      <span>Archive</span>
    </button>
  )
}
