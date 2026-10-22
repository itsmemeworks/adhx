'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Copy, KeyRound, RefreshCw, Trash2 } from 'lucide-react'
import { IN_CARD, INPUT, PRIMARY, SECONDARY, SettingsCard, timeSince } from './parts'

interface AccessKey {
  id: string
  name: string
  hint: string
  createdAt: string
  lastUsedAt: string | null
}

/** Clipboard API, or the older select-and-copy where it's blocked. */
async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    return
  } catch {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    area.remove()
    if (!ok) throw new Error('copy failed')
  }
}

/** Shown once, straight after it's made. */
interface NewKey extends AccessKey {
  key: string
}

/**
 * Access keys for the adhx skill: Claude (or any tool you trust) can search
 * your own saves with one. Keys only read, and only their last four characters
 * are shown after they're made.
 */
export function AccessKeysCard() {
  const [keys, setKeys] = useState<AccessKey[] | null>(null)
  const [max, setMax] = useState(5)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fresh, setFresh] = useState<NewKey | null>(null)
  const [copied, setCopied] = useState(false)
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/access-keys')
      if (!res.ok) throw new Error()
      const data = await res.json()
      setKeys(Array.isArray(data.keys) ? data.keys : [])
      if (typeof data.max === 'number') setMax(data.max)
    } catch {
      setKeys([])
      setError('Couldn’t load your keys. Refresh to try again.')
    }
  }, [])

  useEffect(() => {
    void load()
    return () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current)
    }
  }, [load])

  async function make() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/access-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Couldn’t make a key. Try again.')
      setFresh(data)
      setCopied(false)
      setName('')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t make a key. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function remove(key: AccessKey) {
    if (!window.confirm(`Remove “${key.name}”? Anything using it stops working.`)) return
    setError(null)
    const res = await fetch(`/api/access-keys/${encodeURIComponent(key.id)}`, { method: 'DELETE' })
    if (!res.ok) setError('Couldn’t remove that key. Try again.')
    if (fresh?.id === key.id) setFresh(null)
    await load()
  }

  async function copy() {
    if (!fresh) return
    try {
      await copyText(fresh.key)
      setError(null)
      setCopied(true)
      if (copiedTimer.current) clearTimeout(copiedTimer.current)
      copiedTimer.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Couldn’t copy. Select the key and copy it yourself.')
    }
  }

  return (
    <SettingsCard
      id="access-keys"
      title="Search from Claude"
      sub="Give Claude a key and it can search your saves for you, pictures and videos included. A key can only look; it can’t change anything."
    >
      {fresh && (
        <div className={`flex flex-col gap-3 bg-black p-4 ${IN_CARD}`} role="status">
          <span className="text-[15px] font-bold">Copy your key now. You won’t see it again.</span>
          <code className="block select-all break-all rounded-[8px] bg-white/5 px-3 py-2.5 font-mono text-[13px] text-nx-cream">
            {fresh.key}
          </code>
          <button type="button" onClick={() => void copy()} className={PRIMARY}>
            {copied ? (
              <Check aria-hidden className="h-[18px] w-[18px]" strokeWidth={3} />
            ) : (
              <Copy aria-hidden className="h-[18px] w-[18px]" />
            )}
            <span>{copied ? 'Copied' : 'Copy key'}</span>
          </button>
          <span className="text-[13px] leading-relaxed text-white/65">
            In Claude, add the adhx skill and set this key as ADHX_API_KEY. Then ask things like
            “find my saved videos with a frog in them”.
          </span>
        </div>
      )}

      {keys === null ? (
        <span aria-hidden className={`nx-shimmer animate-nx-shimmer block h-14 ${IN_CARD}`} />
      ) : (
        keys.length > 0 && (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {keys.map((key) => (
              <li
                key={key.id}
                className={`flex items-center gap-3 bg-black/40 px-4 py-3 text-sm ${IN_CARD}`}
              >
                <KeyRound aria-hidden className="h-4 w-4 shrink-0 text-white/55" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-bold">{`${key.name} · …${key.hint}`}</span>
                  <span className="text-xs text-white/55">
                    {`Made ${timeSince(key.createdAt)} · ${key.lastUsedAt ? `used ${timeSince(key.lastUsedAt)}` : 'not used yet'}`}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => void remove(key)}
                  className={SECONDARY}
                  aria-label={`Remove ${key.name}`}
                >
                  <Trash2 aria-hidden className="h-4 w-4" />
                  <span>Remove</span>
                </button>
              </li>
            ))}
          </ul>
        )
      )}

      {keys !== null && keys.length < max && (
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault()
            void make()
          }}
        >
          <label htmlFor="nx-key-name" className="sr-only">
            Key name
          </label>
          <input
            id="nx-key-name"
            className={INPUT}
            placeholder="Name it, e.g. Claude on my laptop"
            maxLength={40}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button type="submit" disabled={busy} className={`${PRIMARY} shrink-0`}>
            {busy && <RefreshCw aria-hidden className="h-4 w-4 animate-spin" />}
            <span>Make a key</span>
          </button>
        </form>
      )}

      {error && (
        <p role="alert" className="m-0 text-[13px] text-[#ff8a7a]">
          {error}
        </p>
      )}
    </SettingsCard>
  )
}
