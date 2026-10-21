'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Smartphone, Trash2 } from 'lucide-react'
import { SECONDARY, SettingsCard, timeSince } from './parts'
import {
  APP_DOWNLOADS,
  LocalOnlyWarning,
  PairCodeBox,
  Step,
  useLocalOnly,
  usePairCode,
} from './PairCode'

interface Phone {
  id: string
  name: string
  createdAt: string
  lastUsedAt: string | null
}

/**
 * Settings → Phone app: install ADHX Share, scan a one-time code to connect
 * it, and see or remove the phones that can save here.
 */
export function PhoneAppCard() {
  const [phones, setPhones] = useState<Phone[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [connected, setConnected] = useState<string | null>(null)
  const localOnly = useLocalOnly()
  const pair = usePairCode()
  const { pairing, expired, clear } = pair
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
  }, [load])

  // While a code is up, watch for the phone arriving.
  useEffect(() => {
    if (!pairing || expired) return
    const poll = setInterval(async () => {
      const list = await load()
      const known = knownIds.current
      const fresh = list?.find((p) => known && !known.has(p.id))
      if (fresh) {
        setConnected(fresh.name)
        clear()
      }
    }, 3000)
    return () => clearInterval(poll)
  }, [pairing, expired, load, clear])

  async function showCode() {
    setError(null)
    setConnected(null)
    const known = new Set((phones ?? []).map((p) => p.id))
    if (await pair.show()) knownIds.current = known
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
                <a
                  href={APP_DOWNLOADS.ios.url}
                  target="_blank"
                  rel="noreferrer"
                  className={SECONDARY}
                >
                  {APP_DOWNLOADS.ios.label}
                </a>
                <a
                  href={APP_DOWNLOADS.android.url}
                  target="_blank"
                  rel="noreferrer"
                  className={SECONDARY}
                >
                  {APP_DOWNLOADS.android.label}
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
              {localOnly && <LocalOnlyWarning />}
            </div>
          </li>
        </ol>

        <PairCodeBox state={pair} onShow={() => void showCode()} />
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

      {(error ?? pair.error) && (
        <p role="alert" className="m-0 text-[13px] text-[#ff8a7a]">
          {error ?? pair.error}
        </p>
      )}
    </SettingsCard>
  )
}
