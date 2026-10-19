'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Copy, Link2, MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { generateAvatarDataUri, usableAvatarUrl } from '@/lib/avatar/generated-avatar'
import { useInvites, type PendingInvite } from './InviteCard'
import { PRIMARY, SECONDARY, SettingsCard } from './parts'
import { agoLabel, expiresLabel } from './when'

/**
 * Settings → Your people: who's waiting to be let in (admins), the members,
 * invite links still waiting to be used, and who can invite (admins).
 */

export type InviteMode = 'admin' | 'approve' | 'anyone'

export interface PersonRow {
  username: string
  name: string | null
  avatarUrl: string | null
  saves: number
  lastSavedAt: string | null
  role: 'owner' | 'admin' | 'member'
  banned: boolean
  isYou: boolean
}

export interface JoinRequestRow {
  id: string
  username: string
  name: string | null
  askedAt: string
  invitedBy: { username: string; name: string | null } | null
}

export interface PeopleData {
  members: PersonRow[]
  isAdmin: boolean
  canInvite: boolean
  inviteMode: InviteMode
  requests?: JoinRequestRow[]
}

const MODES: { id: InviteMode; label: string; hint: string }[] = [
  { id: 'admin', label: 'Only me', hint: 'Only you make invite links.' },
  { id: 'approve', label: 'Anyone, I approve', hint: 'You say yes before anyone gets in.' },
  { id: 'anyone', label: 'Anyone', hint: 'Anyone here can bring people in.' },
]

const ROLE_LABEL: Record<PersonRow['role'], string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
}

/** `/api/people`, refreshed on demand. */
export function usePeople() {
  const [data, setData] = useState<PeopleData | null>(null)
  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/people', { cache: 'no-store' })
      if (!res.ok) return
      const next = (await res.json()) as Partial<PeopleData>
      if (Array.isArray(next.members)) setData(next as PeopleData)
    } catch {
      // Keep what's shown.
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])
  return { data, reload: load }
}

function Face({
  username,
  url,
  size = 34,
}: {
  username: string
  url: string | null
  size?: number
}) {
  const [broken, setBroken] = useState(false)
  const src = (!broken && usableAvatarUrl(url)) || generateAvatarDataUri(username)
  return (
    <img
      src={src}
      alt=""
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
      className="shrink-0 rounded-full object-cover"
      style={{ width: size, height: size }}
    />
  )
}

const shownName = (p: { name: string | null; username: string }) => p.name?.trim() || p.username

function savesLine(p: PersonRow): string {
  const saves = `${p.saves} ${p.saves === 1 ? 'save' : 'saves'}`
  return p.lastSavedAt ? `${saves} · last saved ${agoLabel(p.lastSavedAt)}` : saves
}

/** "Waiting for you": people a member invited, until an admin says yes. */
export function JoinQueue({
  requests,
  onDecided,
}: {
  requests: JoinRequestRow[]
  onDecided: () => void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function decide(r: JoinRequestRow, decision: 'approve' | 'not_now' | 'decline') {
    if (decision === 'decline' && !window.confirm(`Keep ${shownName(r)} out? They won’t get in.`))
      return
    setBusy(r.id)
    setError(null)
    try {
      const res = await fetch(`/api/people/requests/${encodeURIComponent(r.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      })
      if (!res.ok && res.status !== 404) throw new Error()
    } catch {
      setError('That didn’t go through. Try again.')
    } finally {
      setBusy(null)
      onDecided()
    }
  }

  if (requests.length === 0) return null
  return (
    <section aria-labelledby="waiting-title" className="flex flex-col gap-2.5">
      <h3
        id="waiting-title"
        className="m-0 flex flex-wrap items-center gap-2 text-[15px] font-extrabold"
      >
        <span>Waiting for you</span>
        <span className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-nx-accent px-[7px] text-xs font-extrabold text-black">
          {requests.length}
        </span>
        <span className="ml-auto text-[13px] font-normal text-white/55">
          Nobody gets in until you say yes.
        </span>
      </h3>
      <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2">
        {requests.map((r) => (
          <li
            key={r.id}
            className="flex min-w-0 flex-col gap-3 rounded-[20px] border border-nx-accent/30 bg-nx-accent/[0.06] p-3.5"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="relative shrink-0">
                <Face username={r.username} url={null} size={40} />
                {r.invitedBy && (
                  <span className="absolute -bottom-1 -right-1.5 block rounded-full shadow-[0_0_0_2px_#1f1c16]">
                    <Face username={r.invitedBy.username} url={null} size={18} />
                  </span>
                )}
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-[15px] font-extrabold">{shownName(r)}</span>
                <span className="truncate text-[13px] text-[#c9bfab]">
                  {`${r.invitedBy ? `invited by ${shownName(r.invitedBy)} · ` : ''}${agoLabel(r.askedAt)}`}
                </span>
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={busy === r.id}
                onClick={() => void decide(r, 'approve')}
                aria-label={`Let ${shownName(r)} in`}
                className="inline-flex h-11 items-center gap-1.5 rounded-full bg-nx-accent px-[18px] text-sm font-extrabold text-black disabled:opacity-50"
              >
                <Check aria-hidden className="h-4 w-4" strokeWidth={3} />
                <span>Approve</span>
              </button>
              <button
                type="button"
                disabled={busy === r.id}
                onClick={() => void decide(r, 'not_now')}
                className={SECONDARY}
              >
                Not now
              </button>
              <button
                type="button"
                disabled={busy === r.id}
                onClick={() => void decide(r, 'decline')}
                aria-label={`Decline ${shownName(r)}`}
                className="min-h-[44px] px-2 text-[13px] font-semibold text-white/60 underline-offset-2 hover:text-white hover:underline"
              >
                Decline
              </button>
            </div>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="m-0 text-[13px] text-[#ff8a7a]">
          {error}
        </p>
      )}
    </section>
  )
}

function MemberMenu({ person, onChanged }: { person: PersonRow; onChanged: () => void }) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  async function setBanned(banned: boolean) {
    const who = shownName(person)
    if (
      banned &&
      !window.confirm(
        `Ban ${who}? They’re signed out and their saves leave the feed. You can unban.`,
      )
    )
      return
    setOpen(false)
    setError(null)
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: person.username, banned }),
    }).catch(() => null)
    if (!res?.ok) {
      const data = (await res?.json().catch(() => ({}))) as { error?: string } | undefined
      setError(data?.error || 'That didn’t work. Try again.')
    }
    onChanged()
  }

  return (
    <div ref={root} className="relative shrink-0">
      <button
        type="button"
        aria-label={`More for ${shownName(person)}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-11 w-11 items-center justify-center rounded-full text-[#c9bfab] hover:bg-white/10"
      >
        <MoreHorizontal aria-hidden className="h-5 w-5" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-12 z-30 flex min-w-[180px] flex-col rounded-2xl bg-[#262320] p-1.5 shadow-xl"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => void setBanned(!person.banned)}
            className={cn(
              'flex min-h-[44px] items-center rounded-xl px-3 text-left text-sm font-bold hover:bg-white/10',
              !person.banned && 'text-[#ff8a7a]',
            )}
          >
            {person.banned ? `Unban ${shownName(person)}` : `Ban ${shownName(person)}`}
          </button>
        </div>
      )}
      {error && (
        <p
          role="alert"
          className="absolute right-0 top-12 m-0 w-56 text-right text-xs text-[#ff8a7a]"
        >
          {error}
        </p>
      )}
    </div>
  )
}

function InviteRow({
  invite,
  onCopy,
  onRevoke,
}: {
  invite: PendingInvite
  onCopy: (invite: PendingInvite) => Promise<'copied' | 'renewed' | 'cancelled' | 'failed'>
  onRevoke: (invite: PendingInvite) => void
}) {
  const [copied, setCopied] = useState<null | 'copied' | 'renewed'>(null)
  const code = invite.code ?? invite.id.replace(/^inv_/, '').slice(0, 4).toUpperCase()
  const maker = invite.mine ? 'you' : `@${invite.createdBy}`
  return (
    <li className="flex min-h-[64px] flex-wrap items-center gap-x-3.5 gap-y-2 border-t border-white/[0.08] py-2.5">
      <span
        aria-hidden
        className={cn(
          'flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full',
          invite.mine ? 'bg-nx-accent/15 text-nx-accent' : 'bg-[#262320] text-[#c9bfab]',
        )}
      >
        <Link2 className="h-4 w-4" />
      </span>
      <span className="flex min-w-0 flex-1 basis-[calc(100%-50px)] flex-col gap-1 sm:basis-0">
        <span className="font-mono text-base font-extrabold tracking-[0.08em]">
          <span>{code}</span>
          {invite.nameHint && (
            <span className="ml-2 font-nx-sans text-[13px] font-semibold tracking-normal text-white/60">
              {`for ${invite.nameHint}`}
            </span>
          )}
        </span>
        <span className="text-[13px] text-[#a39b8b]">
          {copied === 'renewed'
            ? 'New link copied. The old one stops working.'
            : `Made by ${maker} ${agoLabel(invite.createdAt)} · ${expiresLabel(invite.expiresAt)}`}
        </span>
      </span>
      <span className="flex gap-2 pl-12 sm:pl-0">
        <button
          type="button"
          aria-label={`Copy link for invite ${code}`}
          onClick={async () => {
            const result = await onCopy(invite)
            if (result === 'copied' || result === 'renewed') {
              setCopied(result)
              window.setTimeout(() => setCopied(null), 4000)
            }
          }}
          className={SECONDARY}
        >
          {copied ? (
            <Check aria-hidden className="h-4 w-4" />
          ) : (
            <Copy aria-hidden className="h-4 w-4" />
          )}
          <span>{copied ? 'Copied' : 'Copy link'}</span>
        </button>
        <button
          type="button"
          aria-label={`Revoke invite ${code}`}
          onClick={() => onRevoke(invite)}
          className={SECONDARY}
        >
          Revoke
        </button>
      </span>
    </li>
  )
}

export function PeopleCard({ data, reload }: { data: PeopleData | null; reload: () => void }) {
  const inv = useInvites()
  const [modeBusy, setModeBusy] = useState(false)
  const [modeError, setModeError] = useState<string | null>(null)

  if (!data) {
    return <span aria-hidden className="nx-shimmer animate-nx-shimmer block h-72 rounded-[22px]" />
  }

  const members = data.members
  const count = members.filter((m) => !m.banned).length

  async function setMode(mode: InviteMode) {
    if (!data || mode === data.inviteMode) return
    setModeBusy(true)
    setModeError(null)
    try {
      const res = await fetch('/api/people', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteMode: mode }),
      })
      if (!res.ok) throw new Error()
      reload()
    } catch {
      setModeError('Couldn’t change that. Try again.')
    } finally {
      setModeBusy(false)
    }
  }

  const modeHint = MODES.find((m) => m.id === data.inviteMode)?.hint ?? ''
  const showInvites = inv.canInvite || inv.invites.length > 0

  return (
    <SettingsCard
      id="people"
      title="Your people"
      right={
        <span className="shrink-0 pt-1 text-sm text-white/55">{`${count} on this server`}</span>
      }
    >
      {data.isAdmin && data.requests && (
        <JoinQueue
          requests={data.requests}
          onDecided={() => {
            reload()
          }}
        />
      )}

      <section aria-labelledby="members-title" className="flex flex-col">
        <h3 id="members-title" className="m-0 mb-1 text-[15px] font-extrabold">
          Members
        </h3>
        <ul className="m-0 list-none p-0">
          {members.map((p) => (
            <li
              key={p.username}
              className={cn(
                'flex min-h-[56px] items-center gap-3 border-t border-white/[0.08] py-1.5',
                p.banned && 'opacity-60',
              )}
            >
              <Face username={p.username} url={p.avatarUrl} />
              <span className="flex min-w-0 flex-1 flex-col gap-px">
                <span className="truncate text-[15px] font-extrabold">
                  <span>{shownName(p)}</span>
                  {p.isYou && <span className="font-normal text-white/55"> (you)</span>}
                </span>
                <span className="truncate text-[13px] text-white/55">{savesLine(p)}</span>
              </span>
              <span
                className={cn(
                  'inline-flex h-[26px] shrink-0 items-center rounded-full px-2.5 text-xs font-extrabold',
                  p.banned
                    ? 'bg-[#ff8a7a]/15 text-[#ff8a7a]'
                    : p.role === 'member'
                      ? 'bg-[#262320] text-[#c9bfab]'
                      : 'bg-nx-accent/15 text-nx-accent',
                )}
              >
                {p.banned ? 'Banned' : ROLE_LABEL[p.role]}
              </span>
              {data.isAdmin && !p.isYou && p.role === 'member' ? (
                <MemberMenu person={p} onChanged={reload} />
              ) : (
                data.isAdmin && <span aria-hidden className="w-11 shrink-0" />
              )}
            </li>
          ))}
        </ul>
      </section>

      {showInvites && (
        <section aria-labelledby="invites-title" className="flex flex-col">
          <h3
            id="invites-title"
            className="m-0 mb-1 flex items-center gap-2 text-[15px] font-extrabold"
          >
            <span>Pending invites</span>
            <span className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-[#262320] px-[7px] text-xs text-[#c9bfab]">
              {inv.invites.length}
            </span>
            {inv.canInvite && (
              <button
                type="button"
                disabled={inv.busy}
                onClick={() => void inv.create('')}
                className="ml-auto min-h-[44px] text-[13px] font-semibold text-nx-accent hover:text-white"
              >
                {inv.busy ? 'Making…' : 'Make a link'}
              </button>
            )}
          </h3>
          {inv.made && (
            <div className="mb-2 flex flex-col gap-2.5 rounded-2xl bg-black/40 p-4">
              <span className="text-[13px] text-white/65">
                Send it to one person. It works once, for 7 days, and it’s shown only now.
              </span>
              <code className="block select-all break-all rounded-xl bg-black px-3 py-2.5 font-mono text-[13px] text-nx-cream">
                {inv.made.url}
              </code>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void inv.copy()} className={PRIMARY}>
                  {inv.copied ? 'Copied' : 'Copy link'}
                </button>
                {inv.canShare && (
                  <button type="button" onClick={() => void inv.share()} className={SECONDARY}>
                    Share…
                  </button>
                )}
                <button type="button" onClick={inv.dismiss} className={SECONDARY}>
                  Done
                </button>
              </div>
            </div>
          )}
          {inv.invites.length === 0 ? (
            <p className="m-0 border-t border-white/[0.08] py-3 text-[13px] text-white/55">
              No links waiting. Make one and send it to a friend.
            </p>
          ) : (
            <ul className="m-0 list-none p-0">
              {inv.invites.map((invite) => (
                <InviteRow
                  key={invite.id}
                  invite={invite}
                  onCopy={inv.copyLink}
                  onRevoke={(i) => void inv.revoke(i)}
                />
              ))}
            </ul>
          )}
          {inv.error && (
            <p role="alert" className="m-0 text-[13px] text-[#ff8a7a]">
              {inv.error}
            </p>
          )}
        </section>
      )}

      {data.isAdmin && (
        <div
          role="group"
          aria-labelledby="who-title"
          className="flex flex-col gap-3 border-t border-white/[0.08] pt-3 lg:flex-row lg:items-center"
        >
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span id="who-title" className="text-[15px] font-extrabold">
              Who can invite
            </span>
            <span className="text-[13px] text-white/55">{modeHint}</span>
          </span>
          <div className="flex gap-0.5 self-start rounded-full border border-white/[0.08] bg-[#0f0e0c] p-1">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                aria-pressed={data.inviteMode === m.id}
                disabled={modeBusy}
                onClick={() => void setMode(m.id)}
                className={cn(
                  'h-11 whitespace-nowrap rounded-full px-3 text-[13px] sm:px-4 sm:text-sm',
                  data.inviteMode === m.id
                    ? 'bg-nx-accent font-extrabold text-black'
                    : 'font-semibold text-[#c9bfab] hover:text-white',
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
          {modeError && (
            <p role="alert" className="m-0 text-[13px] text-[#ff8a7a]">
              {modeError}
            </p>
          )}
        </div>
      )}
    </SettingsCard>
  )
}
