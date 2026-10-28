'use client'

import { useState } from 'react'
import { AdhxFace } from '../loader'
import { Gob } from '../Gob'
import { Card } from './StartScreen'

/**
 * `/setup`: the first screen of a fresh ADHX. The setup code from the server
 * log (or the host's dashboard) plus your email makes you its owner and signs
 * you in; then you pick your name on `/welcome`.
 */
export function SetupScreen({ initialCode, logHint }: { initialCode: string; logHint: string }) {
  const [code, setCode] = useState(initialCode)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, email }),
      })
      const data = (await res.json().catch(() => null)) as { error?: string; next?: string } | null
      if (!res.ok || !data?.next) throw new Error(data?.error ?? 'That didn’t work. Try again.')
      window.location.replace(data.next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That didn’t work. Try again.')
      setBusy(false)
    }
  }

  return (
    <div className="relative min-h-dvh overflow-hidden bg-black font-nx-sans text-nx-ink">
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
      <Card label="Set up ADHX">
        <div className="flex items-center gap-3.5">
          <AdhxFace size={56} />
          <span className="flex flex-col gap-1">
            <h1 className="m-0 font-nx-serif text-[28px] font-normal leading-none md:text-[34px]">
              Make this ADHX yours
            </h1>
            <span className="text-sm text-nx-ink/65">You’ll run it. Then invite your people.</span>
          </span>
        </div>
        <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
          <label htmlFor="nx-setup-code" className="text-sm text-nx-ink/65">
            Setup code
          </label>
          <input
            id="nx-setup-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            required
            placeholder="ABCD-EFGH-JKMN"
            className="h-[54px] rounded-[8px] border-[1.5px] border-[#555] bg-black px-4 font-mono text-[17px] tracking-wider text-nx-ink outline-none focus:border-nx-accent"
          />
          {!initialCode && (
            <span className="text-[13px] leading-snug text-nx-ink/55">{logHint}</span>
          )}
          <label htmlFor="nx-setup-email" className="mt-1 text-sm text-nx-ink/65">
            Your email
          </label>
          <input
            id="nx-setup-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            placeholder="you@example.com"
            className="h-[54px] rounded-[8px] border-[1.5px] border-nx-accent bg-black px-4 text-[17px] text-nx-ink outline-none"
          />
          {error && (
            <p role="alert" className="m-0 text-sm text-nx-danger">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="h-[54px] rounded-[8px] bg-nx-accent text-[17px] font-extrabold text-black disabled:opacity-70"
          >
            {busy ? 'Setting up…' : 'Make it mine'}
          </button>
        </form>
        <span className="text-center text-xs text-nx-ink/50">
          Your email is how you sign back in. Nothing is sent to it unless you set up email.
        </span>
      </Card>
    </div>
  )
}
