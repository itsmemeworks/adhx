'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { Check, Mail } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AdhxFace } from '../loader'
import { Gob } from '../Gob'
import { NxImage, XLogo } from '../primitives'
import { postCoverSrc } from '../post'
import type { FeedItem } from '@/components/feed/types'
import { autoPlayHref } from '../theater/queue'
import { learningSummary, useLearningStatus } from './learning'
import { useXSync } from './useXSync'

/**
 * Getting started (redesign phase 6, `/start`): sign up or in with an email
 * link (no password; same box for both), then bring your X bookmarks, watching
 * them arrive and become searchable. New accounts pick a name on the existing
 * `/welcome` step the email link already routes through.
 */

interface Account {
  authenticated: boolean
  user?: { username: string }
  xConnected?: boolean
}

const RESEND_SECONDS = 60

function Card({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      role="dialog"
      aria-label={label}
      className="fixed inset-x-0 bottom-0 z-10 flex max-h-[92dvh] flex-col gap-4 overflow-y-auto rounded-t-[24px] bg-[#1c1b19] px-[18px] pb-[max(28px,env(safe-area-inset-bottom))] pt-3 md:absolute md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:w-[480px] md:-translate-x-1/2 md:-translate-y-1/2 md:gap-[18px] md:rounded-[26px] md:p-[30px] md:shadow-[0_30px_80px_rgba(0,0,0,0.6)]"
    >
      <span aria-hidden className="mx-auto h-1 w-9 shrink-0 rounded-full bg-[#555] md:hidden" />
      {children}
    </div>
  )
}

/** `admin`: no email service here; whoever runs this ADHX passes the link on. */
type Delivery = 'email' | 'admin' | 'log'

function EmailStep({
  returnTo,
  onSent,
}: {
  returnTo: string
  onSent: (email: string, delivery: Delivery) => void
}) {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/email/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, returnTo }),
      })
      const data = (await res.json().catch(() => null)) as {
        error?: string
        delivery?: Delivery
      } | null
      if (!res.ok) throw new Error(data?.error ?? 'Couldn’t send the link. Try again.')
      onSent(email.trim(), data?.delivery ?? 'email')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t send the link. Try again.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card label="Sign in">
      <div className="flex items-center gap-3.5">
        <AdhxFace size={56} />
        <span className="flex flex-col gap-1">
          <h1 className="m-0 font-nx-serif text-[28px] font-normal leading-none md:text-[34px]">
            Keep this forever
          </h1>
          <span className="text-sm text-white/65">Save it. Lose it. Find it.</span>
        </span>
      </div>
      <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
        <label htmlFor="nx-email" className="text-sm text-white/65">
          Your email. We’ll send a link, no password.
        </label>
        <input
          id="nx-email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-[54px] rounded-[14px] border-[1.5px] border-nx-accent bg-black px-4 text-[17px] text-white outline-none"
        />
        {error && (
          <p role="alert" className="m-0 text-sm text-[#ff8a7a]">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="h-[54px] rounded-full bg-nx-accent text-[17px] font-extrabold text-black disabled:opacity-70"
        >
          {busy ? 'Sending…' : 'Send me a link'}
        </button>
      </form>
      <span className="text-center text-xs text-white/50">
        Already have an account? Same box, same link.
      </span>
    </Card>
  )
}

function SentStep({
  email,
  delivery,
  onChange,
  onResend,
}: {
  email: string
  delivery: Delivery
  onChange: () => void
  onResend: () => void
}) {
  const handed = delivery === 'admin'
  const [left, setLeft] = useState(RESEND_SECONDS)
  useEffect(() => {
    if (left <= 0) return
    const t = window.setTimeout(() => setLeft((n) => n - 1), 1000)
    return () => window.clearTimeout(t)
  }, [left])
  return (
    <Card label={handed ? 'Ask for your link' : 'Check your email'}>
      <div className="flex flex-col items-center gap-3 pt-1.5 text-center">
        <span
          aria-hidden
          className="flex h-14 w-[72px] animate-nx-bounce items-center justify-center rounded-xl bg-nx-accent text-black"
        >
          <Mail className="h-8 w-8" strokeWidth={2} />
        </span>
        <span className="font-nx-serif text-[32px] leading-none md:text-[36px]">
          {handed ? 'Ask for your link' : 'Check your inbox'}
        </span>
        {handed ? (
          <span className="text-[15px] leading-[1.45] text-white/80">
            <span>This ADHX doesn’t send email. Ask whoever runs it for the sign-in link for </span>
            <span className="font-bold text-white">{email}</span>
            <span>. Open it in this browser and this page signs you in.</span>
          </span>
        ) : (
          <span className="text-[15px] leading-[1.45] text-white/80">
            <span>We sent a link to </span>
            <span className="font-bold text-white">{email}</span>
            <span>. Open it in this browser and this page signs you in.</span>
          </span>
        )}
      </div>
      <span
        role="status"
        className="flex h-[52px] items-center justify-center gap-2 rounded-full border border-[#555] text-[15px] font-bold"
      >
        <span
          aria-hidden
          className="block h-4 w-4 animate-nx-spin rounded-full border-2 border-[#444] border-t-nx-accent"
        />
        <span>Waiting for you to open it…</span>
      </span>
      <div className="flex items-center justify-between text-[13px] text-white/55">
        <button type="button" onClick={onChange} className="py-2 text-white/80 underline">
          Use a different email
        </button>
        {left > 0 ? (
          <span>{`${handed ? 'New link' : 'Resend'} in 0:${String(left).padStart(2, '0')}`}</span>
        ) : (
          <button
            type="button"
            onClick={() => {
              setLeft(RESEND_SECONDS)
              onResend()
            }}
            className="py-2 text-white/80 underline"
          >
            {handed ? 'Make a new link' : 'Send it again'}
          </button>
        )}
      </div>
    </Card>
  )
}

interface MadeForYou {
  slug: string
  name: string
  covers: { post: FeedItem }[]
}

function SyncStep({ account, autoStart }: { account: Account; autoStart: boolean }) {
  const sync = useXSync()
  const { status } = useLearningStatus({ fast: sync.status === 'running' })
  const learning = learningSummary(status)
  const [channels, setChannels] = useState<MadeForYou[] | null>(null)
  const started = useRef(false)

  useEffect(() => {
    if (autoStart && account.xConnected && !started.current) {
      started.current = true
      sync.start()
    }
  }, [autoStart, account.xConnected, sync])

  useEffect(() => {
    if (sync.status !== 'done') return
    fetch('/api/channels', { credentials: 'same-origin' })
      .then((r) =>
        r.ok ? (r.json() as Promise<{ madeForYou: MadeForYou[] }>) : { madeForYou: [] },
      )
      .then((d) => setChannels(d.madeForYou.slice(0, 4)))
      .catch(() => setChannels([]))
  }, [sync.status])

  const words = learning.rows.find((r) => r.id === 'words')
  const searchable = words?.done ?? 0
  const imported = sync.processed
  const total = sync.total ?? Math.max(sync.found, imported)
  const pct = (n: number, of: number) => `${Math.round((n / Math.max(1, of)) * 100)}%`

  return (
    <Card label="Bring your X bookmarks">
      <div className="flex items-center gap-3">
        <span className="flex h-[34px] w-[34px] animate-nx-pop items-center justify-center rounded-full bg-nx-accent text-black">
          <Check aria-hidden className="h-4 w-4" strokeWidth={3.2} />
        </span>
        <span className="text-[17px] font-extrabold">{`You’re in, @${account.user?.username ?? 'you'}.`}</span>
      </div>

      <div className="flex flex-col gap-3.5 rounded-[18px] bg-black p-4 md:p-5">
        {sync.status === 'idle' && (
          <>
            <span className="font-nx-serif text-[28px] leading-[1.05]">Bring your X bookmarks</span>
            <span className="text-sm leading-[1.45] text-white/65">
              Every bookmark X gives us, made watchable and searchable by what’s in it. Read-only.
              We never post for you.
            </span>
            {account.xConnected ? (
              <button
                type="button"
                onClick={sync.start}
                className="flex h-[52px] items-center justify-center gap-2.5 rounded-full bg-white text-base font-extrabold text-black"
              >
                <span>Import my bookmarks</span>
                <XLogo className="h-4 w-4" />
              </button>
            ) : (
              <a
                href={`/api/auth/twitter?returnUrl=${encodeURIComponent('/start?sync=1')}`}
                className="flex h-[52px] items-center justify-center gap-2.5 rounded-full bg-white text-base font-extrabold text-black"
              >
                <span>Connect</span>
                <XLogo className="h-4 w-4" />
              </a>
            )}
          </>
        )}

        {(sync.status === 'running' || sync.status === 'done') && (
          <>
            <div className="flex items-baseline gap-2.5">
              <span className="font-nx-serif text-[56px] leading-[0.9] tabular-nums md:text-[64px]">
                {String(imported)}
              </span>
              <span className="text-sm text-white/65">
                {sync.status === 'done' ? 'bookmarks in' : 'bookmarks in so far'}
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="flex justify-between text-[13px]">
                <span className="font-bold">Importing from X</span>
                <span className="text-white/65">
                  {sync.status === 'done'
                    ? 'done'
                    : sync.total
                      ? `${imported} / ${sync.total}`
                      : `page ${Math.max(1, sync.pages)}`}
                </span>
              </span>
              <span aria-hidden className="block h-2 rounded bg-[#222]">
                <span
                  className="block h-2 rounded bg-white transition-[width]"
                  style={{ width: sync.status === 'done' ? '100%' : pct(imported, total) }}
                />
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="flex justify-between text-[13px]">
                <span className="font-bold">Making them searchable</span>
                <span className="text-white/65">
                  {words ? `${searchable} / ${words.total}` : '…'}
                </span>
              </span>
              <span aria-hidden className="block h-2 rounded bg-[#222]">
                <span
                  className="block h-2 rounded bg-nx-accent transition-[width]"
                  style={{ width: words ? pct(searchable, words.total) : '0%' }}
                />
              </span>
            </div>
            {sync.status === 'running' && sync.thumbs.length > 0 && (
              <div aria-hidden className="grid grid-cols-6 gap-1">
                {sync.thumbs.map((t) => (
                  <span
                    key={t.id}
                    className="relative block h-12 animate-nx-pop overflow-hidden rounded-md bg-[#1c1b19]"
                  >
                    {t.img && (
                      <NxImage
                        src={t.img}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    )}
                  </span>
                ))}
              </div>
            )}
            {sync.status === 'done' && channels && channels.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="text-sm text-white/65">
                  We grouped them into channels for you.
                </span>
                <div className="flex gap-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {channels.map((c) => {
                    const img = c.covers.map((x) => postCoverSrc(x.post)).find(Boolean) ?? null
                    return (
                      <Link
                        key={c.slug}
                        href={autoPlayHref(c.slug)}
                        className="flex w-[70px] shrink-0 flex-col items-center gap-1.5"
                      >
                        <span className="relative block h-[70px] w-[70px] rounded-full bg-nx-accent p-[3px]">
                          <span className="relative block h-full w-full overflow-hidden rounded-full border-2 border-black bg-[#1c1b19]">
                            {img && (
                              <NxImage
                                src={img}
                                alt=""
                                className="absolute inset-0 h-full w-full object-cover"
                              />
                            )}
                          </span>
                        </span>
                        <span className="line-clamp-2 text-center text-xs">{c.name}</span>
                      </Link>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {sync.status === 'error' && (
          <>
            <span className="font-nx-serif text-[26px] leading-[1.05]">
              That sync didn’t finish
            </span>
            <span className="text-sm text-white/70">{sync.error}</span>
            {sync.errorCode === 'reauth' ? (
              <a
                href={`/api/auth/twitter?returnUrl=${encodeURIComponent('/start?sync=1')}`}
                className="flex h-[52px] items-center justify-center gap-2.5 rounded-full bg-white text-base font-extrabold text-black"
              >
                <span>Reconnect</span>
                <XLogo className="h-4 w-4" />
              </a>
            ) : (
              <button
                type="button"
                onClick={sync.start}
                className="h-[52px] rounded-full bg-white text-base font-extrabold text-black"
              >
                Try again
              </button>
            )}
          </>
        )}
      </div>

      {sync.status === 'running' && (
        <span className="text-center text-sm text-white/75">
          Keep watching. We’ll finish in the background.
        </span>
      )}
      <Link
        href={sync.status === 'idle' || sync.status === 'error' ? '/now' : '/play?recent=1'}
        className={cn(
          'flex h-12 items-center justify-center rounded-full text-[15px]',
          sync.status === 'done' ? 'bg-nx-accent font-extrabold text-black' : 'text-white/80',
          sync.status === 'running' && 'border border-[#555] font-bold text-white',
        )}
      >
        {sync.status === 'done'
          ? 'Start watching'
          : sync.status === 'running'
            ? 'Start watching now'
            : 'Maybe later'}
      </Link>
      {sync.status === 'done' && (
        <span className="text-center text-xs text-white/45">
          New X bookmarks come in when you sync again.
        </span>
      )}
    </Card>
  )
}

export function StartScreen({ returnTo, autoSync }: { returnTo: string; autoSync: boolean }) {
  const [account, setAccount] = useState<Account | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [delivery, setDelivery] = useState<Delivery>('email')

  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'same-origin' })
      .then((r) => (r.ok ? (r.json() as Promise<Account>) : { authenticated: false }))
      .then(setAccount)
      .catch(() => setAccount({ authenticated: false }))
  }, [])

  // After the link is opened (in another tab of this browser), this page
  // notices the session and moves on by itself.
  useEffect(() => {
    if (!sentTo) return
    const t = window.setInterval(() => {
      fetch('/api/auth/me', { credentials: 'same-origin' })
        .then((r) => (r.ok ? (r.json() as Promise<Account>) : null))
        .then((a) => {
          if (a?.authenticated) {
            setAccount(a)
            setSentTo(null)
          }
        })
        .catch(() => {})
    }, 3000)
    return () => window.clearInterval(t)
  }, [sentTo])

  const resend = (email: string) =>
    void fetch('/api/auth/email/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, returnTo }),
    }).catch(() => {})

  return (
    <div className="relative min-h-dvh overflow-hidden bg-black font-nx-sans text-white">
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,rgba(255,210,63,0.12),transparent_55%),radial-gradient(ellipse_at_80%_70%,rgba(242,234,217,0.08),transparent_50%)]"
      />
      <header className="relative flex items-center gap-2.5 px-4 pt-[max(16px,env(safe-area-inset-top))] md:px-7 md:pt-5">
        <span className="gob-host flex items-center gap-2.5">
          <Gob size={32} />
          <span className="font-nx-serif text-2xl leading-none">adhx</span>
        </span>
      </header>
      {account === null ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <AdhxFace size={72} bounce />
        </div>
      ) : account.authenticated ? (
        <SyncStep account={account} autoStart={autoSync} />
      ) : sentTo ? (
        <SentStep
          email={sentTo}
          delivery={delivery}
          onChange={() => setSentTo(null)}
          onResend={() => resend(sentTo)}
        />
      ) : (
        <EmailStep
          returnTo={returnTo}
          onSent={(email, how) => {
            setDelivery(how)
            setSentTo(email)
          }}
        />
      )}
    </div>
  )
}
