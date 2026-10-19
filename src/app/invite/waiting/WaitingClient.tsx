'use client'

import { useEffect, useState } from 'react'
import { NxLogo } from '@/components/next/PrimaryNav'

type Approval = 'pending' | 'declined'

const POLL_MS = 5_000

/**
 * "Waiting for Ana to let you in." Asks `/api/auth/approval` every few
 * seconds while the page is showing, and moves on to /invite/done (pair your
 * phone) the moment an admin says yes.
 */
export function WaitingClient({
  username,
  admin,
  inviter,
  initial,
}: {
  username: string
  admin: string | null
  inviter: string | null
  initial: Approval
}) {
  const [approval, setApproval] = useState<Approval>(initial)

  useEffect(() => {
    if (approval === 'declined') return
    let timer: number | null = null
    let stopped = false
    const check = async () => {
      if (timer) window.clearTimeout(timer)
      try {
        const res = await fetch('/api/auth/approval', { cache: 'no-store' })
        const data = (await res.json().catch(() => ({}))) as { approval?: string | null }
        if (data.approval === 'approved') {
          window.location.assign('/invite/done')
          return
        }
        if (data.approval === 'declined') {
          setApproval('declined')
          return
        }
      } catch {
        // Try again on the next tick.
      }
      if (!stopped && !document.hidden) timer = window.setTimeout(() => void check(), POLL_MS)
    }
    const onVisible = () => {
      if (!document.hidden) void check()
    }
    timer = window.setTimeout(() => void check(), POLL_MS)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      stopped = true
      if (timer) window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [approval])

  const who = admin ?? 'whoever runs this ADHX'

  return (
    <div className="min-h-dvh bg-black font-nx-sans text-white">
      <header className="flex items-center px-4 py-3 md:px-7 md:py-[18px]">
        <NxLogo />
      </header>
      <main className="mx-auto flex w-full max-w-[560px] flex-col gap-6 px-4 py-10 md:py-16">
        {approval === 'pending' ? (
          <>
            <div className="flex flex-col gap-3">
              <h1 className="m-0 font-nx-serif text-[44px] font-normal leading-none md:text-[56px]">
                {`Waiting for ${who} to let you in.`}
              </h1>
              <p className="m-0 text-[15px] leading-snug text-white/70">
                {`${inviter ? `${inviter} invited you. ` : ''}Here, ${who} says yes first. This page moves on by itself.`}
              </p>
            </div>
            <div
              role="status"
              className="flex items-center gap-3 rounded-2xl bg-nx-surface px-4 py-4 text-[15px]"
            >
              <span
                aria-hidden
                className="block h-[18px] w-[18px] shrink-0 animate-nx-spin rounded-full border-[3px] border-[#333] border-t-nx-accent"
              />
              <span>{username ? `You’re @${username}. Hang tight.` : 'Hang tight.'}</span>
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-3">
            <h1 className="m-0 font-nx-serif text-[44px] font-normal leading-none md:text-[56px]">
              Not this time.
            </h1>
            <p className="m-0 text-[15px] leading-snug text-white/70">
              {inviter
                ? `${who} didn’t let this account in. Ask ${inviter} if that’s a mistake.`
                : `${who} didn’t let this account in.`}
            </p>
          </div>
        )}
      </main>
    </div>
  )
}
