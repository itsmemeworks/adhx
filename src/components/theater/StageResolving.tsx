'use client'

/**
 * Shared-preview lead while FxTwitter / a mirror / oEmbed is still in flight.
 * The theater chrome is already up — this is only the stage, so a cold
 * external link paints GOB immediately instead of waiting on the proxy.
 */

import { PostLoader } from '@/components/PostLoader'

export function StageResolving({ handle }: { handle?: string | null }) {
  const who = handle?.replace(/^@+/, '')
  return (
    <div
      className="flex h-full w-full items-center justify-center bg-[#08070a] px-6"
      data-testid="stage-resolving"
    >
      <PostLoader
        variant="dark"
        size={88}
        caption="grabbing it…"
        label={who ? `Loading @${who}'s post` : 'Loading post'}
      />
    </div>
  )
}
