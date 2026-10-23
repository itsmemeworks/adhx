'use client'

import { useState } from 'react'
import { UsernameChooser, type UsernameClaimSuccess } from '@/components/auth/UsernameChooser'
import { MAX_USERNAME_CHANGES, sanitizeUsername } from '@/lib/auth/username-rules'
import { useSiteHost } from '@/lib/routes/use-host'

export interface WelcomeClientProps {
  suggestedUsername: string
  returnTo: string
}

/**
 * A brand-new account's first screen: pick the name your public channels
 * live under, then carry on to where you were going (usually /start, which
 * brings in your X bookmarks). One step; there's nothing to pick before
 * your own saves exist, and Made for you fills Channels once they do.
 */
export function WelcomeClient({ suggestedUsername, returnTo }: WelcomeClientProps) {
  const host = useSiteHost()
  const [sanitized, setSanitized] = useState(sanitizeUsername(suggestedUsername))

  function handleSuccess(_result: UsernameClaimSuccess) {
    window.location.assign(returnTo)
  }

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-black font-nx-sans text-nx-ink">
      <div className="flex min-h-full items-center justify-center p-4 py-6">
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Choose your username"
          className="flex w-full max-w-[480px] flex-col gap-5 rounded-[26px] bg-nx-sheet p-6 shadow-[0_30px_80px_rgba(0,0,0,0.6)] md:p-[30px]"
        >
          <span className="flex items-center gap-3.5">
            <span
              aria-hidden
              className="flex h-12 w-12 shrink-0 items-center justify-center gap-1.5 rounded-[14px] bg-nx-accent"
            >
              <span className="h-2 w-2 rounded-full bg-black" />
              <span className="h-2 w-2 rounded-full bg-black" />
            </span>
            <h1 className="m-0 font-nx-serif text-[32px] font-normal leading-none">
              Pick your name
            </h1>
          </span>
          <p className="m-0 text-[15px] leading-snug text-nx-ink/70">
            {`Channels you make public live at ${host}/t/${sanitized || 'username'}. You can change it ${MAX_USERNAME_CHANGES} times later in Settings.`}
          </p>
          <UsernameChooser
            suggestedUsername={suggestedUsername}
            onSuccess={handleSuccess}
            theme="next"
            showKeepSuggestion
            onSanitizedChange={setSanitized}
          />
        </div>
      </div>
    </div>
  )
}
