'use client'

/**
 * Graceful "this post is gone" lead for shared-mode preview pages.
 *
 * Two reasons, do not collapse them:
 *  - `source` — the origin network couldn't resolve it (FxTwitter 401/404:
 *    deleted, private, or suspended). Platform-named so a Short never
 *    claims it was "on X".
 *  - `hidden` — an admin removed it from ADHX. The source may still exist
 *    on YouTube / Instagram / TikTok / X; we just won't show it here.
 *
 * Replaces the legacy off-brand `QuickAddLanding` "Connect with X to save"
 * dead end. No retry, no save CTA, no X-connect CTA — there is nothing
 * behind this item to act on. `TheaterShell.isSharedItemUnavailable` swaps
 * this in for the shared lead only; the stub's `contentType: 'text'` gives
 * it the normal 'timed' progress kind, and the shared-post-repeat pin is
 * never armed (`sharedPinned` inits false), so the 10s dwell auto-advances
 * into the live pulse.
 */

import { PlatformGlyph } from '@/components/matter'
import { StageFrame, StageHeadline } from './stage-primitives'
import type { TheaterItem } from './types'

export type UnavailableReason = 'source' | 'hidden'

const SOURCE_NETWORK: Record<string, string> = {
  twitter: 'X',
  youtube: 'YouTube',
  instagram: 'Instagram',
  tiktok: 'TikTok',
}

export function unavailableHeadline(reason: UnavailableReason, platform?: string | null): string {
  if (reason === 'hidden') return 'This post was removed from ADHX'
  const network = platform ? SOURCE_NETWORK[platform] : undefined
  return network
    ? `This post is no longer available on ${network}`
    : 'This post is no longer available'
}

export function unavailableDetail(reason: UnavailableReason): string | null {
  if (reason === 'hidden') {
    return 'It no longer appears on preview pages or the live feed.'
  }
  return null
}

export function StageUnavailable({
  item,
  reason = 'source',
}: {
  item: TheaterItem
  reason?: UnavailableReason
}) {
  const detail = unavailableDetail(reason)
  return (
    <StageFrame>
      <div className="relative flex max-w-xl flex-col items-center gap-4 px-6 text-center">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-md">
          <PlatformGlyph platform={item.platform} size={20} />
        </span>
        {item.author && (
          <p className="text-sm text-white/50">
            <span>@{item.author}</span>
          </p>
        )}
        <StageHeadline>
          <span>{unavailableHeadline(reason, item.platform)}</span>
        </StageHeadline>
        {detail && (
          <p className="max-w-sm text-sm leading-relaxed text-white/50">
            <span>{detail}</span>
          </p>
        )}
      </div>
    </StageFrame>
  )
}
