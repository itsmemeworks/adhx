'use client'

/**
 * Shared-preview lead while FxTwitter / a mirror / oEmbed is still in flight.
 * The theater chrome is already up — this is only the stage, so a cold
 * external link paints ADHX immediately instead of waiting on the proxy.
 */

import { MatterLogo } from '@/components/matter'

export function StageResolving({ handle }: { handle?: string | null }) {
  const who = handle?.replace(/^@+/, '')
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-5 bg-[#08070a] px-6 text-center"
      data-testid="stage-resolving"
    >
      <MatterLogo size={22} className="[&>span]:text-white" />
      <p className="text-[13px] text-white/45">
        <span>{who ? `Loading @${who}'s post` : 'Loading post'}</span>
      </p>
    </div>
  )
}
