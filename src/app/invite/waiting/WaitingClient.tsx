'use client'

import { useEffect, useState } from 'react'
import { NxLogo } from '@/components/next/PrimaryNav'
import { Gob } from '@/components/next/Gob'
import { NxAvatar } from '@/components/next/primitives'

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
    <div className="min-h-dvh bg-nx-ink font-nx-sans text-nx-cream">
      <header className="flex h-16 items-center justify-between gap-3 border-b border-white/[0.08] px-4 md:h-[72px] md:px-8">
        <NxLogo />
        {username && (
          <span className="flex h-10 items-center gap-2 whitespace-nowrap rounded-full border border-white/[0.08] bg-nx-surface pl-1 pr-3.5 text-sm font-semibold">
            <NxAvatar author={{ avatarUrl: null, handle: username, name: username }} size={30} />
            <span>{username}</span>
          </span>
        )}
      </header>
      <main className="mx-auto flex w-full max-w-[560px] flex-col gap-6 px-6 py-10 md:py-16">
        {approval === 'pending' ? (
          <>
            <div className="flex items-start gap-4">
              <h1 className="m-0 min-w-0 flex-1 font-nx-serif text-[48px] font-normal leading-[0.98] tracking-[-0.01em] md:text-[64px]">
                {`Waiting for ${who} to let you in.`}
              </h1>
              <Gob size={72} mood="busy" className="mt-1 shrink-0" />
            </div>
            <p className="m-0 text-[17px] leading-[1.45] text-nx-soft">
              {`${inviter ? `${inviter} invited you. ` : ''}Here, ${who} says yes first. This page moves on by itself.`}
            </p>
            <div
              role="status"
              className="flex items-center gap-3.5 rounded-[22px] border border-white/[0.08] bg-nx-surface px-[18px] py-4 text-[15px]"
            >
              <span
                aria-hidden
                className="relative flex h-[22px] w-[22px] flex-none items-center justify-center"
              >
                <span className="absolute -inset-2 rounded-full bg-nx-accent/10" />
                <span className="absolute -inset-0.5 rounded-full bg-nx-accent/[0.22]" />
                <span className="relative h-3 w-3 rounded-full bg-nx-accent" />
              </span>
              <span className="font-semibold">
                {username ? `You’re @${username}. Hang tight.` : 'Hang tight.'}
              </span>
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-4">
              <h1 className="m-0 min-w-0 flex-1 font-nx-serif text-[48px] font-normal leading-[0.98] md:text-[64px]">
                Not this time.
              </h1>
              <Gob size={72} mood="shut" className="mt-1 shrink-0" />
            </div>
            <p className="m-0 text-[17px] leading-[1.45] text-nx-soft">
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
