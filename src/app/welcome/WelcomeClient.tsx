'use client'

import { useState } from 'react'
import { UsernameChooser, type UsernameClaimSuccess } from '@/components/auth/UsernameChooser'
import { sanitizeUsername } from '@/lib/auth/username-rules'

// Always dark, like the theater / SignInModal — this is a brand-new
// account's very first screen, before any theme preference has loaded.
const INK = '#f3ece0'
const MUTED = '#857a69'
const PANEL = '#201b16'
const BORDER = '#322b23'
const STAGE_BG = '#08070a'

export interface WelcomeClientProps {
  suggestedUsername: string
  returnTo: string
}

export function WelcomeClient({ suggestedUsername, returnTo }: WelcomeClientProps) {
  // Live-sanitized preview of the input, mirrored from the shared chooser so
  // the description text below can show `adhx.com/t/{live value}` exactly as
  // before the form itself was extracted into UsernameChooser.
  const [sanitized, setSanitized] = useState(sanitizeUsername(suggestedUsername))

  function handleSuccess(_result: UsernameClaimSuccess) {
    window.location.assign(returnTo)
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ backgroundColor: STAGE_BG }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Choose your username"
        className="w-full max-w-[420px] rounded-2xl border p-7 shadow-2xl"
        style={{ backgroundColor: PANEL, borderColor: BORDER }}
      >
        <div className="mb-6 flex items-center gap-2">
          <img src="/adhx-cloud.png" alt="" aria-hidden style={{ height: 26 }} className="w-auto" />
          <span className="font-indie-flower leading-none" style={{ fontSize: 22, color: INK }}>
            ADHX
          </span>
        </div>

        <h1 className="font-serif text-2xl leading-tight" style={{ color: INK }}>
          Choose your username
        </h1>
        <p className="mt-2 text-[13.5px] leading-snug" style={{ color: MUTED }}>
          This is your public handle on shared collections — adhx.com/t/{sanitized || 'username'}.
          You can only set it once.
        </p>

        <UsernameChooser
          suggestedUsername={suggestedUsername}
          onSuccess={handleSuccess}
          theme="dark"
          showKeepSuggestion
          onSanitizedChange={setSanitized}
        />
      </div>
    </div>
  )
}
