'use client'

import { useState } from 'react'
import Image from 'next/image'
import { UsernameChooser, type UsernameClaimSuccess } from '@/components/auth/UsernameChooser'
import { StarterCollections } from '@/components/onboarding/StarterCollections'
import { sanitizeUsername } from '@/lib/auth/username-rules'
import { cn } from '@/lib/utils'

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
  // Second step: once the username is claimed, offer starter collections
  // instead of navigating straight to `returnTo` — a brand-new collection is
  // otherwise empty on day one. `null` = still on step 1.
  const [claimedUsername, setClaimedUsername] = useState<string | null>(null)

  function handleSuccess(result: UsernameClaimSuccess) {
    setClaimedUsername(result.username)
  }

  function finish() {
    window.location.assign(returnTo)
  }

  const onStarterStep = claimedUsername !== null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ backgroundColor: STAGE_BG }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={onStarterStep ? 'Start your collection' : 'Choose your username'}
        className={cn(
          'w-full rounded-2xl border p-7 shadow-2xl transition-[max-width]',
          onStarterStep ? 'max-w-[720px]' : 'max-w-[420px]',
        )}
        style={{ backgroundColor: PANEL, borderColor: BORDER }}
      >
        <div className="mb-6 flex items-center gap-2">
          <Image
            src="/adhx-cloud.png"
            alt=""
            aria-hidden
            width={23}
            height={26}
            style={{ height: 26, width: 'auto' }}
          />
          <span className="font-indie-flower leading-none" style={{ fontSize: 22, color: INK }}>
            ADHX
          </span>
        </div>

        {onStarterStep ? (
          <>
            <h1 className="font-serif text-2xl leading-tight" style={{ color: INK }}>
              You&rsquo;re in, @{claimedUsername}
            </h1>
            <p className="mt-2 text-[13.5px] leading-snug" style={{ color: MUTED }}>
              Start with a full collection someone else already built, or skip and add your own.
            </p>

            <div className="mt-6">
              <StarterCollections />
            </div>

            <div className="mt-6 flex flex-col gap-3">
              <button
                type="button"
                onClick={finish}
                className="h-12 w-full rounded-full text-[14.5px] font-semibold text-white transition-transform hover:scale-[1.01]"
                style={{ background: 'linear-gradient(135deg,#e88a5e,#d26b40)' }}
              >
                Continue to your collection
              </button>
              <button
                type="button"
                onClick={finish}
                className="w-full text-center text-[13px] underline underline-offset-2"
                style={{ color: MUTED }}
              >
                Skip — I&rsquo;ll add my own
              </button>
            </div>
          </>
        ) : (
          <>
            <h1 className="font-serif text-2xl leading-tight" style={{ color: INK }}>
              Choose your username
            </h1>
            <p className="mt-2 text-[13.5px] leading-snug" style={{ color: MUTED }}>
              This is your public handle on shared collections — adhx.com/t/
              {sanitized || 'username'}. You can only set it once.
            </p>

            <UsernameChooser
              suggestedUsername={suggestedUsername}
              onSuccess={handleSuccess}
              theme="dark"
              showKeepSuggestion
              onSanitizedChange={setSanitized}
            />
          </>
        )}
      </div>
    </div>
  )
}
