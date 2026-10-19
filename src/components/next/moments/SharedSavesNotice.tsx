'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Users, X } from 'lucide-react'
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
      className="mb-4 flex items-start gap-3 rounded-2xl border border-white/10 bg-[#1c1b19] px-4 py-3.5 md:mb-6"
    >
      <Users aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-nx-accent" />
      <span className="flex min-w-0 flex-1 flex-col gap-1.5 text-[14px] leading-[1.45]">
        <span>
          Your saves are now shared with your people. Make any of them private from the post’s ⋯
          menu.
        </span>
        <Link
          href="/play?recent=1"
          onClick={remember}
          className="self-start text-[13px] font-bold text-nx-accent underline underline-offset-2"
        >
          Open my saves
        </Link>
      </span>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={close}
        className="-mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/70 hover:bg-white/10 hover:text-white"
      >
        <X aria-hidden className="h-4 w-4" />
      </button>
    </div>
  )
}
