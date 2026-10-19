'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { Image as ImageIcon, LogOut } from 'lucide-react'
import { generateAvatarDataUri, usableAvatarUrl } from '@/lib/avatar/generated-avatar'
import { UsernameChooser } from '@/components/auth/UsernameChooser'
import { MAX_USERNAME_CHANGES } from '@/lib/auth/username-rules'
import { cn } from '@/lib/utils'
import { AvatarDialog } from './AvatarDialog'
import { INPUT, PRIMARY, SECONDARY, SettingsCard, Switch } from './parts'

/** `user_preferences` key for "Just for me by default" (as in lib/bookmarks/privacy.ts). */
const PRIVATE_DEFAULT_KEY = 'save.privateDefault'

export interface AuthMe {
  authenticated: boolean
  user: {
    id: string
    username: string
    displayName: string
    /** The picture to show; null draws the face made from the username. */
    avatarUrl: string | null
    avatarSource?: 'upload' | 'gob' | 'x' | 'generated'
    usernameChosen: boolean
    usernameChangeCount: number
    /** "Just for me by default" is on. */
    privateDefault?: boolean
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

/** Your picture, and the dialog that changes it. */
function PictureRow({ me, refresh }: { me: AuthMe; refresh: () => void }) {
  const [open, setOpen] = useState(false)
  const [broken, setBroken] = useState(false)
  const username = me.user?.username || 'adhx'
  const shown = !broken ? usableAvatarUrl(me.user?.avatarUrl) : null
  const src = shown ?? generateAvatarDataUri(username)
  const xPicture = usableAvatarUrl(me.identities.x?.avatarUrl)
  return (
    <Row>
      <div className="flex items-center gap-4">
        <img
          src={src}
          alt="Your picture"
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
          className="h-24 w-24 shrink-0 rounded-full object-cover shadow-[0_0_0_3px_#1a1814,0_0_0_5px_rgba(255,255,255,0.12)]"
        />
        <span className="flex min-w-0 flex-col items-start gap-2">
          <button type="button" onClick={() => setOpen(true)} className={SECONDARY}>
            <ImageIcon aria-hidden className="h-4 w-4" />
            <span>Change picture</span>
          </button>
          <span className="text-[13px] text-white/55">Shows on your saves</span>
        </span>
      </div>
      {open && (
        <AvatarDialog
          username={username}
          displayName={me.user?.displayName ?? null}
          xPicture={me.xConnected ? xPicture : null}
          current={{ source: me.user?.avatarSource ?? 'generated', url: shown }}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setBroken(false)
            refresh()
          }}
        />
      )}
    </Row>
  )
}

/** The name your people see on your saves; empty shows your username. */
function DisplayNameRow({ me, refresh }: { me: AuthMe; refresh: () => void }) {
  const saved = me.user?.displayName ?? ''
  const [value, setValue] = useState(saved)
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  useEffect(() => setValue(saved), [saved])

  async function save() {
    if (value.trim() === saved.trim()) return
    setState('saving')
    try {
      const res = await fetch('/api/account/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: value }),
      })
      if (!res.ok) throw new Error()
      const data = (await res.json()) as { displayName: string | null }
      setValue(data.displayName ?? '')
      setState('saved')
      refresh()
    } catch {
      setState('error')
    }
  }

  const username = me.user?.username ?? ''
  return (
    <Row>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
        className="flex flex-col gap-1.5"
      >
        <label htmlFor="display-name" className="text-[13px] font-semibold text-white/70">
          Display name
        </label>
        <input
          id="display-name"
          type="text"
          value={value}
          maxLength={40}
          autoComplete="nickname"
          placeholder={username}
          onChange={(e) => {
            setValue(e.target.value)
            setState('idle')
          }}
          onBlur={() => void save()}
          className={INPUT}
        />
        <span
          role={state === 'error' ? 'alert' : 'status'}
          className={cn('text-[13px]', state === 'error' ? 'text-[#ff8a7a]' : 'text-white/55')}
        >
          {state === 'saving'
            ? 'Saving…'
            : state === 'error'
              ? 'Couldn’t save that. Try again.'
              : `Others see you as ${value.trim() || saved.trim() || username}`}
        </span>
      </form>
    </Row>
  )
}

/** "Just for me by default": new saves start private. */
function PrivateDefaultRow({ me }: { me: AuthMe }) {
  const [on, setOn] = useState(!!me.user?.privateDefault)
  const [busy, setBusy] = useState(false)
  useEffect(() => setOn(!!me.user?.privateDefault), [me.user?.privateDefault])

  async function toggle() {
    const next = !on
    setOn(next)
    setBusy(true)
    try {
      const res = await fetch('/api/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [PRIVATE_DEFAULT_KEY]: String(next) }),
      })
      if (!res.ok) throw new Error()
    } catch {
      setOn(!next)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Row>
      <div className="flex items-center gap-3">
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span id="private-default" className="text-[15px] font-extrabold">
            Just for me by default
          </span>
          <span className="text-[13px] leading-snug text-white/55">
            New saves start private. You can share any of them later.
          </span>
        </span>
        <Switch
          label="Just for me by default"
          checked={on}
          onChange={() => void toggle()}
          busy={busy}
        />
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

/** Settings → You: picture, display name, username, email, and "Just for me by default". */
export function AccountCard({ me, refresh }: { me: AuthMe; refresh: () => void }) {
  return (
    <SettingsCard
      id="you"
      title="You"
      right={
        <button type="button" onClick={signOut} className={SECONDARY}>
          <LogOut aria-hidden className="h-4 w-4" />
          <span>Sign out</span>
        </button>
      }
    >
      <PictureRow me={me} refresh={refresh} />
      <DisplayNameRow me={me} refresh={refresh} />
      <UsernameRow me={me} refresh={refresh} />
      <EmailRow me={me} />
      <PrivateDefaultRow me={me} />
    </SettingsCard>
  )
}
