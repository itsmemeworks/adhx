'use client'

/**
 * Shared-preview lead while FxTwitter / a mirror / oEmbed is still in flight.
 * The theater chrome is already up — this is only the stage, so a cold
 * external link paints GOB immediately instead of waiting on the proxy.
 */

export function StageResolving({ handle }: { handle?: string | null }) {
  const who = handle?.replace(/^@+/, '')
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-5 bg-[#08070a] px-6 text-center"
      data-testid="stage-resolving"
      role="status"
      aria-label={who ? `Loading @${who}'s post` : 'Loading post'}
    >
      <img src="/gob-loader.svg" alt="" aria-hidden className="h-[88px] w-[88px]" />
      <p className="font-indie-flower text-[22px] text-[#F4F1EA]">
        <span>grabbing it…</span>
      </p>
    </div>
  )
}
