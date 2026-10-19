'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { Check, QrCode, RefreshCw, Smartphone, Trash2 } from 'lucide-react'
import { PRIMARY, SECONDARY, SettingsCard, timeSince } from './parts'

interface Phone {
  id: string
  name: string
  createdAt: string
  lastUsedAt: string | null
}

interface PairCode {
  code: string
  expiresAt: string
  /** What the QR code holds: this address and the code. */
  link: string
  qr: string
}

const IOS_URL =
  process.env.NEXT_PUBLIC_IOS_APP_URL ||
  'https://github.com/itsmemeworks/adhx/blob/main/apps/ios/README.md'
const ANDROID_URL =
  process.env.NEXT_PUBLIC_ANDROID_APP_URL ||
  'https://github.com/itsmemeworks/adhx/blob/main/apps/android/README.md'
const IOS_LABEL = process.env.NEXT_PUBLIC_IOS_APP_URL ? 'iPhone (TestFlight)' : 'iPhone (build it)'
const ANDROID_LABEL = process.env.NEXT_PUBLIC_ANDROID_APP_URL
  ? 'Android (APK)'
  : 'Android (build it)'

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '0.0.0.0'])

/** `ABCDEFGH` → `ABCD-EFGH`, easier to read off the screen. */
const spaced = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`

function minutesLeft(expiresAt: string, now: number): number {
  return Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 60_000))
}

/**
 * Settings → Phone app: install ADHX Share, scan a one-time code to connect
 * it, and see or remove the phones that can save here.
 */
export function PhoneAppCard() {
  const [phones, setPhones] = useState<Phone[] | null>(null)
  const [pairing, setPairing] = useState<PairCode | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [connected, setConnected] = useState<string | null>(null)
  const [localOnly, setLocalOnly] = useState(false)
  const knownIds = useRef<Set<string> | null>(null)

  const load = useCallback(async (): Promise<Phone[] | null> => {
    try {
      const res = await fetch('/api/app/phones', { cache: 'no-store' })
      if (!res.ok) throw new Error()
      const data = await res.json()
      const list: Phone[] = Array.isArray(data.phones) ? data.phones : []
      setPhones(list)
      return list
    } catch {
      setPhones((p) => p ?? [])
      setError('Couldn’t load your phones. Refresh to try again.')
      return null
    }
  }, [])

  useEffect(() => {
    void load()
    setLocalOnly(LOCAL_HOSTS.has(window.location.hostname))
  }, [load])

  const expired = pairing ? Date.parse(pairing.expiresAt) <= now : false

  // While a code is up: tick the minutes down and watch for the phone arriving.
  useEffect(() => {
    if (!pairing || expired) return
    const tick = setInterval(() => setNow(Date.now()), 1000)
    const poll = setInterval(async () => {
      const list = await load()
      const known = knownIds.current
      const fresh = list?.find((p) => known && !known.has(p.id))
      if (fresh) {
        setConnected(fresh.name)
        setPairing(null)
      }
    }, 3000)
    return () => {
      clearInterval(tick)
      clearInterval(poll)
    }
  }, [pairing, expired, load])

  async function showCode() {
    setBusy(true)
    setError(null)
    setConnected(null)
    try {
      const res = await fetch('/api/app/pairing', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || typeof data.code !== 'string') throw new Error()
      const link = `adhx://pair?server=${encodeURIComponent(window.location.origin)}&code=${data.code}`
      const qr = await QRCode.toDataURL(link, {
        margin: 0,
        width: 336,
        errorCorrectionLevel: 'M',
        color: { dark: '#000000', light: '#ffffff' },
      })
      knownIds.current = new Set((phones ?? []).map((p) => p.id))
      setNow(Date.now())
      setPairing({ code: data.code, expiresAt: data.expiresAt, link, qr })
    } catch {
      setError('Couldn’t make a code. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function remove(phone: Phone) {
    if (!window.confirm(`Remove “${phone.name}”? It won’t be able to save here any more.`)) return
    setError(null)
    const res = await fetch(`/api/app/phones/${encodeURIComponent(phone.id)}`, {
      method: 'DELETE',
    })
    if (!res.ok) setError('Couldn’t remove that phone. Try again.')
    await load()
  }

  const left = pairing ? minutesLeft(pairing.expiresAt, now) : 0

  return (
    <SettingsCard
      id="phone-app"
      title="Phone app"
      sub="Share posts to your ADHX from X, TikTok, YouTube and every other app, straight from the share menu."
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <ol className="m-0 flex min-w-0 flex-1 list-none flex-col gap-4 p-0">
          <li className="flex items-start gap-3">
            <Step n={1} />
            <div className="flex flex-col gap-2">
              <span className="text-[15px] font-bold">Install the app</span>
              <div className="flex flex-wrap gap-2">
                <a href={IOS_URL} target="_blank" rel="noreferrer" className={SECONDARY}>
                  {IOS_LABEL}
                </a>
                <a href={ANDROID_URL} target="_blank" rel="noreferrer" className={SECONDARY}>
                  {ANDROID_LABEL}
                </a>
              </div>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <Step n={2} />
            <div className="flex flex-col gap-1">
              <span className="text-[15px] font-bold">Open it and scan this code</span>
              <span className="text-[13px] leading-relaxed text-white/65">
                The code connects the app to this ADHX. It works once, for 10 minutes.
              </span>
              {localOnly && (
                <span className="text-[13px] leading-relaxed text-[#ffb59a]">
                  Your phone can’t reach this address. Open ADHX at one it can reach (your
                  computer’s network address, or your ADHX’s web address) and make the code there.
                </span>
              )}
            </div>
          </li>
        </ol>

        <div className="flex shrink-0 flex-col items-center gap-2 sm:w-[196px]">
          {pairing && !expired ? (
            <>
              <img
                src={pairing.qr}
                alt="QR code to connect the phone app"
                width={196}
                height={196}
                className="h-[196px] w-[196px] rounded-2xl bg-white p-3.5"
              />
              <span className="font-mono text-[17px] font-bold tracking-[0.12em] text-nx-cream">
                {spaced(pairing.code)}
              </span>
              <span className="text-xs text-white/55" role="status">
                {left === 1 ? '1 minute left' : `${left} minutes left`}
              </span>
            </>
          ) : (
            <div className="flex h-[196px] w-full flex-col items-center justify-center gap-3 rounded-2xl bg-black/40 p-4 text-center sm:w-[196px]">
              {pairing && expired && (
                <span className="text-[13px] text-white/65">That code ran out.</span>
              )}
              <button
                type="button"
                onClick={() => void showCode()}
                disabled={busy}
                className={`${PRIMARY} whitespace-nowrap px-4`}
              >
                {busy ? (
                  <RefreshCw aria-hidden className="h-4 w-4 animate-spin" />
                ) : (
                  <QrCode aria-hidden className="h-[18px] w-[18px]" />
                )}
                <span>{pairing ? 'New code' : 'Show the code'}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {connected && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-2xl bg-[#7ddc8a]/12 px-4 py-3 text-[15px] font-semibold text-[#7ddc8a]"
        >
          <Check aria-hidden className="h-5 w-5 shrink-0" strokeWidth={3} />
          <span>{`${connected} is connected. Share a post to try it.`}</span>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <span className="text-xs font-bold uppercase tracking-[0.08em] text-white/55">
          Connected phones
        </span>
        {phones === null ? (
          <span aria-hidden className="nx-shimmer animate-nx-shimmer block h-14 rounded-2xl" />
        ) : phones.length === 0 ? (
          <span className="text-[13px] text-white/55">None yet.</span>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {phones.map((phone) => (
              <li
                key={phone.id}
                className="flex items-center gap-3 rounded-2xl bg-black/40 px-4 py-3 text-sm"
              >
                <Smartphone aria-hidden className="h-4 w-4 shrink-0 text-white/55" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-bold">{phone.name}</span>
                  <span className="text-xs text-white/55">
                    {`Connected ${timeSince(phone.createdAt)} · ${phone.lastUsedAt ? `last used ${timeSince(phone.lastUsedAt)}` : 'not used yet'}`}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => void remove(phone)}
                  className={SECONDARY}
                  aria-label={`Remove ${phone.name}`}
                >
                  <Trash2 aria-hidden className="h-4 w-4" />
                  <span>Remove</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && (
        <p role="alert" className="m-0 text-[13px] text-[#ff8a7a]">
          {error}
        </p>
      )}
    </SettingsCard>
  )
}

function Step({ n }: { n: number }) {
  return (
    <span
      aria-hidden
      className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-nx-accent text-[13px] font-extrabold text-black"
    >
      {n}
    </span>
  )
}
