'use client'

/**
 * Graceful "this post is gone" lead for shared-mode preview pages whose
 * source tweet couldn't be resolved (FxTwitter 401/404 — deleted, private,
 * or suspended; TASK 3, owner screenshot report). Replaces the legacy
 * off-brand `QuickAddLanding` "Connect with X to save" dead end, which was
 * wrong on every axis: X isn't required to use ADHX (magic link exists),
 * it wasn't the theater, and it led nowhere actionable.
 *
 * Deliberately NOT `Stage.tsx`'s `StagePoster` (the generic "anything
 * unresolvable" fallback for a normal pulse item) — that one links out via
 * `StageCTA` ("Open preview"), which here would just point back at the very
 * page already showing this dead end. No retry (the source is genuinely
 * gone, not a transient failure), no save CTA, no X-connect CTA — there is
 * nothing behind this item to act on. `TheaterShell.isSharedItemUnavailable`
 * swaps this in for the shared lead only; the stub item's `contentType:
 * 'text'` (see `tweetToTheaterItem`'s caller in the status page) gives it
 * the normal 'timed' progress kind, and the shared-post-repeat pin is never
 * armed for it (see `sharedPinned`'s init), so the existing 10s dwell + clay
 * progress line auto-advance the queue into the live pulse for free.
 */

import { PlatformGlyph } from '@/components/matter'
import { StageFrame, StageHeadline } from './stage-primitives'
import type { TheaterItem } from './types'

export function StageUnavailable({ item }: { item: TheaterItem }) {
  return (
    <StageFrame>
      <div className="relative flex max-w-xl flex-col items-center gap-4 px-6 text-center">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-md">
          <PlatformGlyph platform={item.platform} size={20} />
        </span>
        {item.author && <p className="text-sm text-white/50">@{item.author}</p>}
        <StageHeadline>This post is no longer available on X</StageHeadline>
      </div>
    </StageFrame>
  )
}
