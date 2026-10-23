'use client'

import { useState } from 'react'
import { Check, RefreshCw } from 'lucide-react'
import { DANGER, INPUT, SECONDARY, SettingRow, SettingsCard, Sheet } from './parts'

type Action = 'clear' | 'delete'

const WORD: Record<Action, string> = { clear: 'CLEAR', delete: 'DELETE' }

/**
 * Clear all data (keeps sign-in) and delete account, each behind a typed
 * confirmation word.
 */
export function DangerZone({
  onCleared,
  onError,
}: {
  onCleared: () => void
  onError: (text: string) => void
}) {
  const [open, setOpen] = useState<Action | null>(null)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)

  const close = () => {
    if (busy) return
    setOpen(null)
    setTyped('')
  }

  async function clearData() {
    setBusy(true)
    try {
      const res = await fetch('/api/account/clear', { method: 'POST' })
      if (!res.ok) throw new Error('clear')
      setOpen(null)
      setTyped('')
      onCleared()
    } catch {
      onError('Couldn’t clear your data. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function deleteAccount() {
    setBusy(true)
    try {
      const res = await fetch('/api/account', { method: 'DELETE' })
      if (!res.ok) throw new Error('delete')
      window.location.href = '/?deleted=true'
    } catch {
      onError('Couldn’t delete your account. Try again.')
      setBusy(false)
    }
  }

  return (
    <SettingsCard id="danger" title="Danger zone" sub="These can’t be undone." tone="danger">
      <SettingRow
        label="Clear all data"
        hint="Deletes every save and your sync history. You stay signed in."
      >
        <button type="button" onClick={() => setOpen('clear')} className={DANGER}>
          Clear data
        </button>
      </SettingRow>
      <SettingRow label="Delete account" hint="Deletes everything, including how you sign in.">
        <button
          type="button"
          onClick={() => setOpen('delete')}
          className="inline-flex min-h-[44px] items-center justify-center whitespace-nowrap rounded-[var(--nx-nest)] bg-nx-danger-fill px-4 text-sm font-bold text-nx-ink hover:bg-[#]"
        >
          Delete account
        </button>
      </SettingRow>

      {open && (
        <Sheet
          label={open === 'clear' ? 'Clear all data' : 'Delete account'}
          onClose={close}
          tone="danger"
        >
          <p className="m-0 text-[15px] text-nx-ink/80">This deletes, for good:</p>
          <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-sm text-nx-ink/75">
            {open === 'clear' ? (
              <>
                <li>All your saves</li>
                <li>What you’ve archived</li>
                <li>Your sync history</li>
                <li>Your channels and preferences</li>
              </>
            ) : (
              <>
                <li>All your saves and data</li>
                <li>Your X and email sign-in</li>
                <li>All your settings</li>
              </>
            )}
          </ul>
          {open === 'clear' && (
            <p className="m-0 flex items-center gap-1.5 text-sm text-nx-good">
              <Check aria-hidden className="h-4 w-4 shrink-0" />
              <span>You stay signed in, and X stays connected if it is.</span>
            </p>
          )}
          <label className="flex flex-col gap-2 text-sm text-nx-ink/75">
            <span>
              <span>Type </span>
              <span className="rounded bg-white/10 px-1.5 py-0.5 font-bold text-nx-ink">
                {WORD[open]}
              </span>
              <span> to confirm</span>
            </span>
            <input
              type="text"
              autoFocus
              autoComplete="off"
              autoCapitalize="characters"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={WORD[open]}
              className={INPUT}
            />
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={close} disabled={busy} className={`${SECONDARY} flex-1`}>
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void (open === 'clear' ? clearData() : deleteAccount())}
              disabled={typed !== WORD[open] || busy}
              className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-[var(--nx-nest)] bg-nx-danger-fill px-4 text-sm font-bold text-nx-ink hover:bg-[#] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy && <RefreshCw aria-hidden className="h-4 w-4 animate-spin" />}
              <span>{open === 'clear' ? 'Clear data' : 'Delete account'}</span>
            </button>
          </div>
        </Sheet>
      )}
    </SettingsCard>
  )
}
