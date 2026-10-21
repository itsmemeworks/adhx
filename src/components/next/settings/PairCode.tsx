'use client'

import { useCallback, useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { QrCode, RefreshCw } from 'lucide-react'
import { PRIMARY } from './parts'

/**
 * Connecting the phone app, shared by Settings → Phone app and /invite/done:
 * a one-time code from `POST /api/app/pairing` (createPairCode), shown as a QR
 * code holding `adhx://pair?server=<this address>&code=<code>` and as
 * `ABCD-EFGH` text, with the minutes it has left.
 */

export interface PairCode {
  code: string
  expiresAt: string
  /** What the QR code holds: this address and the code. */
  link: string
  qr: string
}

const IOS_SET = !!process.env.NEXT_PUBLIC_IOS_APP_URL
const ANDROID_SET = !!process.env.NEXT_PUBLIC_ANDROID_APP_URL

/** Where to get the apps. `configured` is false for the build-it-yourself READMEs. */
export const APP_DOWNLOADS = {
  ios: {
    url:
      process.env.NEXT_PUBLIC_IOS_APP_URL ||
      'https://github.com/itsmemeworks/adhx/blob/main/apps/ios/README.md',
    label: IOS_SET ? 'iPhone (TestFlight)' : 'iPhone (build it)',
    configured: IOS_SET,
  },
  android: {
    url:
      process.env.NEXT_PUBLIC_ANDROID_APP_URL ||
      'https://github.com/itsmemeworks/adhx/blob/main/apps/android/README.md',
    label: ANDROID_SET ? 'Android (APK)' : 'Android (build it)',
    configured: ANDROID_SET,
  },
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '0.0.0.0'])

/** `ABCDEFGH` → `ABCD-EFGH`, easier to read off the screen. */
export const spacedPairCode = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`

/** What the QR code holds. The phone app reads both halves. */
export function pairLink(origin: string, code: string): string {
  return `adhx://pair?server=${encodeURIComponent(origin)}&code=${code}`
}

function minutesLeft(expiresAt: string, now: number): number {
  return Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 60_000))
}

/** True when this page's address is one a phone can't reach (localhost). */
export function useLocalOnly(): boolean {
  const [localOnly, setLocalOnly] = useState(false)
  useEffect(() => setLocalOnly(LOCAL_HOSTS.has(window.location.hostname)), [])
  return localOnly
}

export interface PairCodeState {
  pairing: PairCode | null
  expired: boolean
  /** Minutes the code has left. */
  left: number
  busy: boolean
  error: string | null
  /** Make a fresh code (any earlier one stops working). True when it worked. */
  show: () => Promise<boolean>
  /** Put the code away (the phone connected). */
  clear: () => void
}

export function usePairCode(): PairCodeState {
  const [pairing, setPairing] = useState<PairCode | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const expired = pairing ? Date.parse(pairing.expiresAt) <= now : false

  useEffect(() => {
    if (!pairing || expired) return
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(tick)
  }, [pairing, expired])

  const show = useCallback(async (): Promise<boolean> => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/app/pairing', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || typeof data.code !== 'string') throw new Error()
      const link = pairLink(window.location.origin, data.code)
      const qr = await QRCode.toDataURL(link, {
        margin: 0,
        width: 336,
        // High: the "You're in" page puts Gob over the middle.
        errorCorrectionLevel: 'H',
        color: { dark: '#000000', light: '#ffffff' },
      })
      setNow(Date.now())
      setPairing({ code: data.code, expiresAt: data.expiresAt, link, qr })
      return true
    } catch {
      setError('Couldn’t make a code. Try again.')
      return false
    } finally {
      setBusy(false)
    }
  }, [])

  const clear = useCallback(() => setPairing(null), [])

  return {
    pairing,
    expired,
    left: pairing ? minutesLeft(pairing.expiresAt, now) : 0,
    busy,
    error,
    show,
    clear,
  }
}

/** The QR code and its text, or a button to make one. */
export function PairCodeBox({
  state,
  onShow,
}: {
  state: PairCodeState
  /** Instead of `state.show`, when the caller needs to do more around it. */
  onShow?: () => void
}) {
  const { pairing, expired, left, busy, show } = state
  return (
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
            {spacedPairCode(pairing.code)}
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
            onClick={() => (onShow ? onShow() : void show())}
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
  )
}

/** The "can't reach this address" warning under the scan step. */
export function LocalOnlyWarning() {
  return (
    <span className="text-[13px] leading-relaxed text-[#ffb59a]">
      Your phone can’t reach this address. Open ADHX at one it can reach (your computer’s network
      address, or your ADHX’s web address) and make the code there.
    </span>
  )
}

export function Step({ n }: { n: number }) {
  return (
    <span
      aria-hidden
      className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-nx-accent text-[13px] font-extrabold text-black"
    >
      {n}
    </span>
  )
}
