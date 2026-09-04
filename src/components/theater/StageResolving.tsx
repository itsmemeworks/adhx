'use client'

/**
 * Shared-preview lead while FxTwitter / a mirror / oEmbed is still in flight.
 * The theater chrome is already up — this is only the stage, so a cold
 * external link paints GOB immediately instead of waiting on the proxy.
 */

import { PostLoader } from '@/components/PostLoader'

export function StageResolving({
  handle,
  failed = false,
  onRetry,
}: {
  handle?: string | null
  failed?: boolean
  onRetry?: () => void
}) {
  const who = handle?.replace(/^@+/, '')
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-5 bg-[#08070a] px-6 text-center"
      data-testid={failed ? 'stage-resolving-error' : 'stage-resolving'}
    >
      <PostLoader
        variant="dark"
        size={88}
        caption={failed ? 'load stalled' : 'grabbing it…'}
        label={
          failed
            ? who
              ? `Saved @${who}'s post, but loading stalled`
              : 'Saved post, but loading stalled'
            : who
              ? `Loading @${who}'s post`
              : 'Loading post'
        }
      />
      {failed && onRetry ? (
        <>
          <p className="max-w-sm text-sm text-white/55">
            <span>The post was saved, but its display data could not be loaded.</span>
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/15"
          >
            <span>Retry loading</span>
          </button>
        </>
      ) : null}
    </div>
  )
}
