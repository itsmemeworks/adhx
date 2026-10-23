'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Download, RefreshCw, ScanLine, Smartphone, Timer } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FeedItem } from '@/components/feed/types'
import { NxHeader } from '@/components/next/channels/ChannelParts'
import { Gob } from '@/components/next/Gob'
import { namesOf } from '@/components/next/moments/people'
import { postCoverSrc } from '@/components/next/post'
import { NxAvatar, NxImage } from '@/components/next/primitives'
import { PRIMARY } from '@/components/next/settings/parts'
import {
  APP_DOWNLOADS,
  LocalOnlyWarning,
  spacedPairCode,
  useLocalOnly,
  usePairCode,
} from '@/components/next/settings/PairCode'

interface Person {
  username: string
  name: string | null
  avatarUrl: string | null
}

interface Friend extends Person {
  size: number
  covers: { post: FeedItem }[]
}

const nameOf = (p: Person) => p.name?.trim() || p.username

/**
 * A phone step: 22 px corners, a 1 px border and 18 px padding, so its buttons
 * and code box sit at the 8 px floor (22 − 18 − 1 = 3).
 */
const STEP_CARD =
  'flex flex-col gap-3 rounded-[22px] border border-white/[0.08] bg-nx-surface p-[18px] [--nx-nest:8px]'

/** "Ana’s", "James’" */
function possessive(name: string): string {
  return name.endsWith('s') ? `${name}’` : `${name}’s`
}

/**
 * Straight after joining by invite: "You're in, Ben." with the phone pairing
 * code already up, so the new member can scan it from the app right away.
 * The page notices the phone and moves on; skipping goes to the feed and
 * Settings → Phone app has the same code later.
 */
export function InviteDoneClient({
  username,
  displayName = null,
  avatarUrl = null,
  inviter = null,
  hasEmail,
}: {
  username: string
  displayName?: string | null
  avatarUrl?: string | null
  /** Whose invite it was: "on Ana's ADHX". */
  inviter?: Person | null
  hasEmail: boolean
}) {
  const pair = usePairCode()
  const localOnly = useLocalOnly()
  const [connected, setConnected] = useState<string | null>(null)
  const [friends, setFriends] = useState<Friend[]>([])
  const { pairing, expired, left, busy, show, clear } = pair
  const started = useRef(false)
  const first = (displayName?.trim() || username).split(/\s+/)[0]
  const greeting = first.charAt(0).toUpperCase() + first.slice(1)

  useEffect(() => {
    if (started.current) return
    started.current = true
    void show()
  }, [show])

  // Who is already here, for "38 saves from Ana, Mum and Jo are waiting".
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/channels', { signal: controller.signal, credentials: 'same-origin' })
      .then((r) => (r.ok ? (r.json() as Promise<{ friends?: Friend[] }>) : null))
      .then((d) => d?.friends && setFriends(d.friends.filter((f) => f.size > 0)))
      .catch(() => {})
    return () => controller.abort()
  }, [])

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

  const apps = [
    { ...APP_DOWNLOADS.ios, label: 'Get the iPhone app' },
    { ...APP_DOWNLOADS.android, label: 'Get the Android app' },
  ].filter((app) => app.configured)
  const waiting = friends.reduce((n, f) => n + f.size, 0)
  const waitingFaces = [...friends].sort((a, b) => b.size - a.size).slice(0, 3)
  const peek = friends
    .flatMap((f) => f.covers.map((c) => postCoverSrc(c.post)))
    .find((src): src is string => !!src)

  return (
    <div className="min-h-dvh bg-nx-bg font-nx-sans text-nx-cream">
      <NxHeader current={null} />
      <main className="mx-auto grid w-full max-w-[1280px] grid-cols-1 gap-10 px-4 py-8 md:px-14 md:py-10 lg:min-h-[calc(100dvh-72px)] lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-14">
        <section aria-labelledby="in-h" className="flex min-w-0 flex-col justify-center">
          <span className="flex h-9 items-center gap-2.5 self-start whitespace-nowrap rounded-full border border-white/[0.08] bg-nx-surface pl-1 pr-3.5 text-sm">
            <span className="flex">
              <NxAvatar
                author={{ avatarUrl, handle: username, name: greeting }}
                size={28}
                className="relative z-[2]"
                style={{ boxShadow: '0 0 0 2px rgb(var(--nx-surface))' }}
              />
              {inviter && (
                <NxAvatar
                  author={{
                    avatarUrl: inviter.avatarUrl,
                    handle: inviter.username,
                    name: nameOf(inviter),
                  }}
                  size={28}
                  className="-ml-[9px]"
                  style={{ boxShadow: '0 0 0 2px rgb(var(--nx-surface))' }}
                />
              )}
            </span>
            <span className="font-semibold">{`Signed in as ${username}`}</span>
            {inviter && (
              <span className="hidden text-nx-ink-faint sm:inline">{`on ${possessive(nameOf(inviter))} ADHX`}</span>
            )}
          </span>

          <h1
            id="in-h"
            className="m-0 mt-[22px] font-nx-serif text-[56px] font-normal leading-[0.95] tracking-[-0.015em] md:text-[96px]"
          >
            <span>{'You’re in, '}</span>
            <span className="text-nx-accent">{`${greeting}.`}</span>
          </h1>
          <p className="m-0 mt-3.5 text-[17px] leading-[1.45] text-nx-ink-soft md:text-[19px]">
            {connected
              ? `${connected} is connected. Share a post to try it.`
              : 'One last thing. Put ADHX on your phone, it connects itself.'}
          </p>

          {connected ? (
            <div
              role="status"
              className="mt-8 flex items-center gap-3 self-start rounded-2xl bg-nx-good/12 px-4 py-3 text-[15px] font-semibold text-nx-good"
            >
              <Check aria-hidden className="h-5 w-5 shrink-0" strokeWidth={3} />
              <span>{`${connected} is connected.`}</span>
            </div>
          ) : (
            <>
              <PhoneSteps
                apps={apps}
                link={pairing && !expired ? pairing.link : null}
                code={pairing && !expired ? spacedPairCode(pairing.code) : null}
                left={left}
                busy={busy}
                onNewCode={() => void show()}
              >
                {localOnly && <LocalOnlyWarning />}
                {pair.error && (
                  <p role="alert" className="m-0 text-[13px] text-nx-danger">
                    {pair.error}
                  </p>
                )}
              </PhoneSteps>
              <div className="mt-8 hidden flex-col gap-6 sm:flex sm:flex-row sm:items-center sm:gap-9">
                {/* 28 px frame, 14 px padding: the code inside curves at 14 px. */}
                <div className="flex-none self-start rounded-[28px] bg-nx-paper p-3.5 shadow-[0_30px_70px_rgba(0,0,0,0.55)] sm:self-auto">
                  {pairing && !expired ? (
                    <span className="relative block h-[240px] w-[240px] overflow-hidden rounded-[14px] bg-nx-ink p-3 md:h-[268px] md:w-[268px]">
                      <img
                        src={pairing.qr}
                        alt="QR code to connect your phone"
                        className="block h-full w-full mix-blend-multiply"
                      />
                      <span
                        aria-hidden
                        className="absolute left-1/2 top-1/2 flex h-[26%] w-[26%] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-lg bg-nx-ink"
                      >
                        <Gob size={64} className="h-[90%] w-[90%]" />
                      </span>
                    </span>
                  ) : (
                    <span className="flex h-[240px] w-[240px] flex-col items-center justify-center gap-3 rounded-[14px] bg-nx-ink p-4 text-center text-nx-bg md:h-[268px] md:w-[268px]">
                      {pairing && expired && <span className="text-sm">That code ran out.</span>}
                      <button
                        type="button"
                        onClick={() => void show()}
                        disabled={busy}
                        className={PRIMARY}
                      >
                        {busy && <RefreshCw aria-hidden className="h-4 w-4 animate-spin" />}
                        <span>{pairing ? 'New code' : 'Show the code'}</span>
                      </button>
                    </span>
                  )}
                </div>

                <div className="flex min-w-0 flex-col gap-[18px]">
                  <span className="flex items-center gap-3 text-[17px] font-semibold leading-[1.4]">
                    <span
                      aria-hidden
                      className="flex h-10 w-10 flex-none items-center justify-center rounded-full border border-white/[0.08] bg-nx-surface text-nx-accent"
                    >
                      <ScanLine className="h-[18px] w-[18px]" />
                    </span>
                    <span>Scan with the ADHX app, or your phone’s camera</span>
                  </span>
                  {pairing && !expired && (
                    <div className="flex flex-col gap-1.5 rounded-[22px] border border-white/[0.08] bg-nx-surface px-[22px] py-[18px]">
                      <span className="text-sm text-nx-ink-faint">
                        Or type this code in the app
                      </span>
                      <span className="whitespace-nowrap text-[32px] font-extrabold leading-[1.1] tracking-[0.1em] md:text-[40px]">
                        {spacedPairCode(pairing.code)}
                      </span>
                      <span
                        className="flex items-center gap-2 text-sm text-nx-ink-faint"
                        role="status"
                      >
                        <Timer aria-hidden className="h-3.5 w-3.5 shrink-0" />
                        <span>
                          {`Works once, for 10 minutes · ${left === 1 ? '1 minute' : `${left} minutes`} left`}
                        </span>
                      </span>
                    </div>
                  )}
                  {localOnly && <LocalOnlyWarning />}
                  {pair.error && (
                    <p role="alert" className="m-0 text-[13px] text-nx-danger">
                      {pair.error}
                    </p>
                  )}
                </div>
              </div>
            </>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3 sm:mt-8 sm:justify-start">
            {!connected &&
              apps.map((app) => (
                <a
                  key={app.url}
                  href={app.url}
                  target="_blank"
                  rel="noreferrer"
                  className="hidden h-12 items-center gap-2 whitespace-nowrap rounded-full border-[1.5px] border-nx-cream px-5 text-[15px] font-extrabold text-nx-cream sm:flex"
                >
                  <Download aria-hidden className="h-4 w-4" />
                  <span>{app.label}</span>
                </a>
              ))}
            {!connected && apps.length === 0 && (
              <span className="hidden text-sm text-nx-ink-faint sm:inline">
                No app link yet? Ask whoever invited you where to get it.
              </span>
            )}
            <a
              href="/"
              className={
                connected
                  ? PRIMARY
                  : 'flex h-12 items-center whitespace-nowrap px-3 text-[15px] font-semibold text-nx-ink-soft underline underline-offset-[3px] hover:text-nx-cream'
              }
            >
              {connected ? 'Go to the feed' : 'Skip, take me to the feed'}
            </a>
          </div>

          {!hasEmail && (
            <p className="m-0 mt-6 text-[13px] leading-relaxed text-nx-ink-faint">
              {'To sign in on another browser later, add an email in '}
              <a
                href="/settings#account"
                className="underline underline-offset-2 hover:text-nx-ink"
              >
                Settings
              </a>
              .
            </p>
          )}
        </section>

        <aside
          aria-labelledby="wait-h"
          className="relative hidden flex-col gap-5 overflow-hidden rounded-[28px] border border-white/[0.08] bg-nx-surface px-7 py-[26px] lg:flex"
        >
          <div className="flex items-center gap-3.5">
            <span
              aria-hidden
              className="relative flex h-[22px] w-[22px] flex-none items-center justify-center"
            >
              <span className="absolute -inset-2 rounded-full bg-nx-accent/10" />
              <span className="absolute -inset-0.5 rounded-full bg-nx-accent/[0.22]" />
              <span className="relative h-3 w-3 rounded-full bg-nx-accent" />
            </span>
            <span className="flex flex-col gap-0.5">
              <h2 id="wait-h" className="m-0 text-[19px] font-extrabold">
                {connected ? 'Your phone is connected' : 'Waiting for your phone…'}
              </h2>
              <span className="text-sm text-nx-ink-faint">
                {connected
                  ? 'Share a post to it to try it.'
                  : 'This page moves on by itself once you scan.'}
              </span>
            </span>
          </div>

          <div aria-hidden className="flex min-h-0 flex-1 items-center justify-center">
            <div className="relative h-[404px] w-[212px] overflow-hidden rounded-[40px] border-8 border-nx-plate bg-black shadow-[0_30px_60px_rgba(0,0,0,0.6)]">
              {peek && (
                <NxImage
                  src={peek}
                  alt=""
                  reveal="fade"
                  className="absolute inset-0 h-full w-full object-cover blur-[3px] brightness-50"
                />
              )}
              <span className="absolute left-7 top-[92px] h-[140px] w-[140px]">
                <span className="absolute left-0 top-0 h-[30px] w-[30px] rounded-tl-[14px] border-l-4 border-t-4 border-nx-accent" />
                <span className="absolute right-0 top-0 h-[30px] w-[30px] rounded-tr-[14px] border-r-4 border-t-4 border-nx-accent" />
                <span className="absolute bottom-0 left-0 h-[30px] w-[30px] rounded-bl-[14px] border-b-4 border-l-4 border-nx-accent" />
                <span className="absolute bottom-0 right-0 h-[30px] w-[30px] rounded-br-[14px] border-b-4 border-r-4 border-nx-accent" />
                <span className="absolute inset-x-3 top-[58%] h-0.5 bg-nx-accent shadow-[0_0_12px_rgb(var(--nx-accent))]" />
              </span>
              <span className="absolute inset-x-0 top-[30px] flex justify-center">
                <span className="flex h-[30px] items-center gap-1.5 rounded-full bg-black/55 px-3 text-xs font-semibold text-nx-ink backdrop-blur-md">
                  <Gob size={18} />
                  <span>Scan your code</span>
                </span>
              </span>
              <span className="absolute inset-x-0 bottom-0 h-[130px] bg-gradient-to-b from-transparent to-black/90" />
              <span className="absolute inset-x-4 bottom-[22px] text-center text-[13px] leading-[1.4] text-nx-ink">
                Point your phone at the code on your laptop
              </span>
            </div>
          </div>

          {waiting > 0 && (
            // Along the card's bottom: 28 − 28 − 1 leaves the 8 px floor.
            <div className="flex items-center gap-3.5 rounded-[8px] bg-nx-plate px-4 py-3.5">
              <span className="flex flex-none">
                {waitingFaces.map((f, i) => (
                  <NxAvatar
                    key={f.username}
                    author={{ avatarUrl: f.avatarUrl, handle: f.username, name: nameOf(f) }}
                    size={32}
                    className={i > 0 ? '-ml-[9px]' : undefined}
                    style={{ boxShadow: '0 0 0 2px #262320', zIndex: 3 - i }}
                  />
                ))}
              </span>
              <span className="flex-1 text-sm leading-[1.4]">
                <span className="font-extrabold">{`${waiting.toLocaleString('en-GB')} saves`}</span>
                <span>
                  {` from ${namesOf(waitingFaces.map(nameOf), friends.length)} ${friends.length === 1 ? 'is' : 'are'} waiting for you`}
                </span>
              </span>
            </div>
          )}
        </aside>
      </main>
    </div>
  )
}

/** On a phone there is nothing to scan: get the app, then connect this phone from it. */
function PhoneSteps({
  apps,
  link,
  code,
  left,
  busy,
  onNewCode,
  children,
}: {
  apps: { url: string; label: string }[]
  /** `adhx://pair?…`: opens the app with the code filled in. */
  link: string | null
  code: string | null
  left: number
  busy: boolean
  onNewCode: () => void
  children?: React.ReactNode
}) {
  const step = (n: number, filled: boolean) => (
    <span
      aria-hidden
      className={cn(
        'flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold',
        filled ? 'bg-nx-accent text-black' : 'border-2 border-nx-accent text-nx-accent',
      )}
    >
      {n}
    </span>
  )
  return (
    <div className="mt-6 flex flex-col gap-3.5 sm:hidden">
      <section className={STEP_CARD}>
        <h2 className="m-0 flex items-center gap-2.5 text-base font-extrabold">
          {step(1, true)}
          <span>Get the app</span>
        </h2>
        {apps.length > 0 ? (
          apps.map((app, i) => (
            <a
              key={app.url}
              href={app.url}
              target="_blank"
              rel="noreferrer"
              className={cn(
                'flex h-[52px] items-center justify-center gap-2 whitespace-nowrap rounded-[var(--nx-nest)] text-[17px] font-extrabold',
                i === 0
                  ? 'bg-nx-accent text-black'
                  : 'border-[1.5px] border-nx-cream text-nx-cream',
              )}
            >
              <Download aria-hidden className="h-[18px] w-[18px]" />
              <span>{app.label}</span>
            </a>
          ))
        ) : (
          <span className="text-sm text-nx-ink-faint">
            Ask whoever invited you where to get it.
          </span>
        )}
      </section>
      <section className={STEP_CARD}>
        <h2 className="m-0 flex items-center gap-2.5 text-base font-extrabold">
          {step(2, false)}
          <span>Got the app? Connect it</span>
        </h2>
        {link && code ? (
          <>
            <a
              href={link}
              className="flex h-[52px] items-center justify-center gap-2.5 whitespace-nowrap rounded-[var(--nx-nest)] bg-nx-cream text-[17px] font-extrabold text-black"
            >
              <Smartphone aria-hidden className="h-[18px] w-[18px]" />
              <span>Connect this phone</span>
            </a>
            <span className="flex items-center gap-3 text-[13px] text-nx-ink-faint">
              <span aria-hidden className="h-px flex-1 bg-white/[0.08]" />
              <span className="whitespace-nowrap">or type this code in the app</span>
              <span aria-hidden className="h-px flex-1 bg-white/[0.08]" />
            </span>
            <div className="flex items-center gap-3 rounded-[var(--nx-nest)] border-[1.5px] border-dashed border-white/[0.16] px-[18px] py-3.5">
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="whitespace-nowrap text-[28px] font-extrabold leading-[1.1] tracking-[0.08em]">
                  {code}
                </span>
                <span className="text-[13px] text-nx-ink-faint">Works once, for 10 minutes</span>
              </span>
              <span
                role="status"
                aria-label={left === 1 ? '1 minute left' : `${left} minutes left`}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-[3px] border-nx-accent text-xs font-extrabold"
              >
                {`${left}m`}
              </span>
            </div>
          </>
        ) : (
          <button type="button" onClick={onNewCode} disabled={busy} className={PRIMARY}>
            {busy && <RefreshCw aria-hidden className="h-4 w-4 animate-spin" />}
            <span>{code ? 'New code' : 'Show the code'}</span>
          </button>
        )}
        {children}
      </section>
    </div>
  )
}
