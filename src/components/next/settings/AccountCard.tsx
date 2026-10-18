'use client'

import { useState, type FormEvent } from 'react'
import { LogOut } from 'lucide-react'
import { usePreferences } from '@/lib/preferences-context'
import {
  generateAvatarDataUri,
  resolveAccountAvatarSrc,
  usableAvatarUrl,
} from '@/lib/avatar/generated-avatar'
import { UsernameChooser } from '@/components/auth/UsernameChooser'
import { MAX_USERNAME_CHANGES } from '@/lib/auth/username-rules'
import { cn } from '@/lib/utils'
import { INPUT, PRIMARY, SECONDARY, SettingsCard } from './parts'

export interface AuthMe {
  authenticated: boolean
  user: {
    id: string
    username: string
    displayName: string
    avatarUrl: string
    usernameChosen: boolean
    usernameChangeCount: number
  } | null
  identities: {
    x: { username: string; avatarUrl?: string | null } | null
    email: { email: string } | null
  }
  xConnected: boolean
  /** This ADHX can connect X (it has an X app). */
  xAvailable?: boolean
  isAdmin?: boolean
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-t border-white/10 pt-4 first:border-0 first:pt-0">
      {children}
    </div>
  )
}

function RowLabel({ children }: { children: string }) {
  return (
    <span className="text-xs font-bold uppercase tracking-[0.08em] text-white/45">{children}</span>
  )
}

function AvatarRow({ me }: { me: AuthMe }) {
  const { preferences, updatePreference } = usePreferences()
  const [xBroken, setXBroken] = useState(false)
  const username = me.user?.username || 'adhx'
  const xPhoto = !xBroken ? usableAvatarUrl(me.identities.x?.avatarUrl) : null
  const generated = generateAvatarDataUri(username)
  const selected = preferences.avatarSource === 'generated' || !xPhoto ? 'generated' : 'x'
  const currentSrc = resolveAccountAvatarSrc({
    avatarSource: selected,
    xAvatarUrl: xPhoto,
    username,
  })

  const choice = (on: boolean) =>
    cn(
      'h-11 w-11 overflow-hidden rounded-full ring-offset-2 ring-offset-nx-surface',
      on ? 'ring-2 ring-nx-accent' : 'ring-1 ring-white/20 hover:ring-white/50',
    )

  return (
    <Row>
      <div className="flex items-center gap-3">
        <img
          src={currentSrc}
          alt=""
          referrerPolicy="no-referrer"
          className="h-14 w-14 shrink-0 rounded-full object-cover"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <RowLabel>Picture</RowLabel>
          <span className="text-sm text-white/70">
            {xPhoto ? 'Use your X photo or one made from your username' : 'Made from your username'}
          </span>
        </div>
        {xPhoto && (
          <div className="flex shrink-0 items-center gap-2.5">
            <button
              type="button"
              aria-pressed={selected === 'x'}
              aria-label="Use X photo"
              onClick={() => updatePreference('avatarSource', 'x')}
              className={choice(selected === 'x')}
            >
              <img
                src={xPhoto}
                alt=""
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
                onError={() => setXBroken(true)}
              />
            </button>
            <button
              type="button"
              aria-pressed={selected === 'generated'}
              aria-label="Use generated avatar"
              onClick={() => updatePreference('avatarSource', 'generated')}
              className={choice(selected === 'generated')}
            >
              <img src={generated} alt="" className="h-full w-full object-cover" />
            </button>
          </div>
        )}
      </div>
    </Row>
  )
}

function EmailRow({ me }: { me: AuthMe }) {
  const current = me.identities.email?.email ?? null
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<string | null>(null)

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      // Adding and changing both go through change, so the email stays on this account.
      const res = await fetch('/api/auth/email/change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: value }),
      })
      if (res.ok) {
        setSent(`Check ${value}. We sent a link to confirm it.`)
        setEditing(false)
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Couldn’t send the link. Try again.')
      }
    } catch {
      setError('Couldn’t send the link. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const showForm = !current || editing

  return (
    <Row>
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <RowLabel>Email</RowLabel>
          {current ? (
            <span className="truncate text-[15px] font-bold">{current}</span>
          ) : (
            <span className="text-sm text-white/70">Add an email. It’s how you sign in.</span>
          )}
        </div>
        {current && !editing && (
          <button
            type="button"
            aria-label="Change email"
            onClick={() => {
              setValue('')
              setError(null)
              setSent(null)
              setEditing(true)
            }}
            className={SECONDARY}
          >
            Change
          </button>
        )}
      </div>
      {showForm && (
        <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-2.5">
          <input
            type="email"
            required
            autoFocus={editing}
            autoComplete="email"
            inputMode="email"
            aria-label={current ? 'New email' : 'Email'}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={current ? 'new@email.com' : 'you@email.com'}
            className={INPUT}
          />
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy} className={PRIMARY}>
              {busy ? 'Sending…' : current ? 'Send confirmation link' : 'Add email'}
            </button>
            {current && (
              <button type="button" onClick={() => setEditing(false)} className={SECONDARY}>
                Cancel
              </button>
            )}
          </div>
        </form>
      )}
      {error && (
        <p role="alert" className="m-0 text-[13px] text-[#ff8a7a]">
          {error}
        </p>
      )}
      {sent && <p className="m-0 text-[13px] text-[#7ddc8a]">{sent}</p>}
    </Row>
  )
}

/**
 * Every account gets a first free username claim, plus `MAX_USERNAME_CHANGES`
 * further changes; after that the row is read-only. Old names keep
 * redirecting (see `chooseUsername()` in `src/lib/auth/account.ts`).
 */
function UsernameRow({ me, refresh }: { me: AuthMe; refresh: () => void }) {
  const [editing, setEditing] = useState(false)
  if (!me.user) return null
  const { username, usernameChosen, usernameChangeCount } = me.user
  const changesRemaining = usernameChosen
    ? Math.max(0, MAX_USERNAME_CHANGES - usernameChangeCount)
    : MAX_USERNAME_CHANGES
  const canChange = !usernameChosen || changesRemaining > 0
  const hint = !usernameChosen
    ? 'Your name on channels you share'
    : changesRemaining > 0
      ? `${changesRemaining} change${changesRemaining === 1 ? '' : 's'} left`
      : 'No changes left'

  return (
    <Row>
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <RowLabel>Username</RowLabel>
          <span className="truncate text-[15px] font-bold">{`@${username}`}</span>
          <span className="text-[13px] text-white/55">{hint}</span>
        </div>
        {canChange && !editing && (
          <button
            type="button"
            aria-label={usernameChosen ? 'Change username' : 'Choose username'}
            onClick={() => setEditing(true)}
            className={SECONDARY}
          >
            {usernameChosen ? 'Change' : 'Choose'}
          </button>
        )}
      </div>
      {editing && (
        <UsernameChooser
          suggestedUsername={username}
          showKeepSuggestion={false}
          submitLabel="save"
          autoFocus
          onSuccess={() => {
            setEditing(false)
            refresh()
          }}
          onCancel={() => setEditing(false)}
        />
      )}
    </Row>
  )
}

export function signOut() {
  void fetch('/api/auth/logout', { method: 'POST' }).finally(() => window.location.assign('/'))
}

export function AccountCard({ me, refresh }: { me: AuthMe; refresh: () => void }) {
  return (
    <SettingsCard
      id="account"
      title="Account"
      sub="Your picture, email and username."
      right={
        <button type="button" onClick={signOut} className={SECONDARY}>
          <LogOut aria-hidden className="h-4 w-4" />
          <span>Sign out</span>
        </button>
      }
    >
      <AvatarRow me={me} />
      <EmailRow me={me} />
      <UsernameRow me={me} refresh={refresh} />
    </SettingsCard>
  )
}
