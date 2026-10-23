'use client'

import { useEffect, useState } from 'react'
import { Users } from 'lucide-react'
import { useAuthMe } from '@/components/auth'

export const SHARED_SAVES_NOTICE_KEY = 'adhx:notice:shared-saves'

function dismissed(): boolean {
  try {
    return window.localStorage.getItem(SHARED_SAVES_NOTICE_KEY) === '1'
  } catch {
    return false
  }
}

function remember(): void {
  try {
    window.localStorage.setItem(SHARED_SAVES_NOTICE_KEY, '1')
  } catch {
    // Storage blocked: it just shows again next time.
  }
}

/**
 * Once, for signed-in members: saves are shared with your people now (they
 * joined the shared feed on upgrade), and how to keep one to yourself.
 */
export function SharedSavesNotice() {
  const { me } = useAuthMe()
  // Read storage after mount so the server render and hydration agree.
  const [hidden, setHidden] = useState(true)
  useEffect(() => setHidden(dismissed()), [])
  if (hidden || !me?.authenticated) return null
  const close = () => {
    remember()
    setHidden(true)
  }
  return (
    <div
      role="note"
      className="mb-5 flex items-center gap-3.5 rounded-[22px] bg-nx-paper py-2.5 pl-[18px] pr-2.5 text-nx-paper-ink md:min-h-16"
    >
      <span
        aria-hidden
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-nx-paper-ink/[0.08]"
      >
        <Users className="h-5 w-5" strokeWidth={2} />
      </span>
      <p className="m-0 min-w-0 flex-1 text-[15px] leading-[1.35]">
        <span className="font-extrabold">Your saves are now shared with your people.</span>
        <span>{' Make any of them private from the post’s ⋯ menu.'}</span>
      </p>
      <button
        type="button"
        onClick={close}
        // 22 px corners, 10 px in: 12 px.
        className="flex h-11 shrink-0 items-center whitespace-nowrap rounded-[12px] bg-nx-paper-ink px-[22px] text-[15px] font-extrabold text-nx-cream"
      >
        Got it
      </button>
    </div>
  )
}
