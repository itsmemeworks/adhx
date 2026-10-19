'use client'

import { useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { PRIMARY, SECONDARY } from '@/components/next/settings/parts'
import {
  APP_DOWNLOADS,
  LocalOnlyWarning,
  PairCodeBox,
  Step,
  useLocalOnly,
  usePairCode,
} from '@/components/next/settings/PairCode'

/**
 * Straight after joining by invite: "You're in." with the phone pairing code
 * already up, so the new member can scan it from the app right away. Skipping
 * goes to the feed; Settings → Phone app has the same code later.
 */
export function InviteDoneClient({ username, hasEmail }: { username: string; hasEmail: boolean }) {
  const pair = usePairCode()
  const localOnly = useLocalOnly()
  const [connected, setConnected] = useState<string | null>(null)
  const { pairing, expired, show, clear } = pair
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    void show()
  }, [show])

  // A brand-new account has no phones, so the first one to show up is this one.
  useEffect(() => {
    if (!pairing || expired) return
    const poll = setInterval(async () => {
      try {
        const res = await fetch('/api/app/phones', { cache: 'no-store' })
        const data = await res.json()
        const phone = Array.isArray(data.phones) ? data.phones[0] : null
        if (phone?.name) {
          setConnected(phone.name)
          clear()
        }
      } catch {
        // Try again on the next tick.
      }
    }, 3000)
    return () => clearInterval(poll)
  }, [pairing, expired, clear])

  const apps = [APP_DOWNLOADS.ios, APP_DOWNLOADS.android].filter((app) => app.configured)

  return (
    <div className="min-h-dvh bg-nx-ink font-nx-sans text-nx-cream">
      <main className="mx-auto flex w-full max-w-[560px] flex-col gap-6 px-4 py-10 md:py-16">
        <div className="flex flex-col gap-2">
          <h1 className="m-0 font-nx-serif text-[44px] font-normal leading-none md:text-[56px]">
            You’re in.
          </h1>
          <p className="m-0 text-[15px] leading-snug text-white/70">
            {`Welcome, @${username}. Put ADHX on your phone and saving is one tap from any app.`}
          </p>
        </div>

        <section
          aria-label="Connect your phone"
          className="flex flex-col gap-5 rounded-[22px] bg-nx-surface p-4 md:p-6"
        >
          {connected ? (
            <div
              role="status"
              className="flex items-center gap-3 rounded-2xl bg-[#7ddc8a]/12 px-4 py-3 text-[15px] font-semibold text-[#7ddc8a]"
            >
              <Check aria-hidden className="h-5 w-5 shrink-0" strokeWidth={3} />
              <span>{`${connected} is connected. Share a post to try it.`}</span>
            </div>
          ) : (
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
              <ol className="m-0 flex min-w-0 flex-1 list-none flex-col gap-4 p-0">
                <li className="flex items-start gap-3">
                  <Step n={1} />
                  <div className="flex flex-col gap-2">
                    <span className="text-[15px] font-bold">Install the app</span>
                    {apps.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {apps.map((app) => (
                          <a
                            key={app.url}
                            href={app.url}
                            target="_blank"
                            rel="noreferrer"
                            className={SECONDARY}
                          >
                            {app.label}
                          </a>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[13px] leading-relaxed text-white/65">
                        Ask whoever invited you where to get it.
                      </span>
                    )}
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <Step n={2} />
                  <div className="flex flex-col gap-1">
                    <span className="text-[15px] font-bold">Open it and scan this code</span>
                    <span className="text-[13px] leading-relaxed text-white/65">
                      Or type the code in. It works once, for 10 minutes.
                    </span>
                    {localOnly && <LocalOnlyWarning />}
                  </div>
                </li>
              </ol>
              <PairCodeBox state={pair} />
            </div>
          )}
          {pair.error && (
            <p role="alert" className="m-0 text-[13px] text-[#ff8a7a]">
              {pair.error}
            </p>
          )}
        </section>

        {!hasEmail && (
          <p className="m-0 text-[13px] leading-relaxed text-white/55">
            {'To sign in on another browser later, add an email in '}
            <a href="/settings#account" className="underline underline-offset-2 hover:text-white">
              Settings
            </a>
            .
          </p>
        )}

        <a href="/" className={connected ? PRIMARY : SECONDARY}>
          {connected ? 'Go to the feed' : 'Skip, take me to the feed'}
        </a>
      </main>
    </div>
  )
}
