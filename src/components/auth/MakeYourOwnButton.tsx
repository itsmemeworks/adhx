'use client'

import { useState } from 'react'
import { SignInModal } from './SignInModal'

export interface MakeYourOwnButtonProps {
  /** Full className string for the trigger — callers style this as either
   * the top-bar ghost pill or the footer clay CTA; the button itself carries
   * no default look. */
  className: string
  children: React.ReactNode
  /** Path to land on after auth. Default: `/`. */
  returnTo?: string
}

/**
 * Sign-in trigger for the public curator profile's "Make your own
 * collection" CTAs (`/t/{username}`'s top-right pill and footer CTA block).
 * Opens `SignInModal` IN PLACE instead of navigating to `/?start=1` — per
 * owner review, a signed-out visitor shouldn't be bounced off the profile
 * just to see the sign-in options.
 */
export function MakeYourOwnButton({ className, children, returnTo = '/' }: MakeYourOwnButtonProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {children}
      </button>
      <SignInModal
        open={open}
        onClose={() => setOpen(false)}
        title="Make your own collection"
        subtitle="Sign up and start saving — anything you save can be tagged into collections like this one."
        returnTo={returnTo}
      />
    </>
  )
}
