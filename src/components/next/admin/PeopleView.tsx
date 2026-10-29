'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import type { AdminMember, PeopleBoard } from '@/lib/admin/boards/people'
import type { JoinRequest } from '@/lib/auth/approval'
import { cn } from '@/lib/utils'
import { useAdminAction } from './actions'
import {
  BTN,
  Card,
  Chip,
  Face,
  LABEL,
  PRIMARY_BTN,
  PageTitle,
  TD,
  TH,
  TableBox,
  WaitingFace,
  agoShort,
  displayName,
  fmt,
  plural,
  seenLabel,
  shortDate,
} from './parts'

export const MODE_LINE: Record<PeopleBoard['inviteMode'], string> = {
  admin: 'Only admins make invite links',
  approve: 'Anyone with a link, I approve new faces',
  anyone: 'Anyone can invite, no approval',
}

/** "benji is waiting to join", with Decline and Let them in. */
export function JoinBanner({ request }: { request: JoinRequest }) {
  const { run, busy, error } = useAdminAction()
  const decide = (decision: 'approve' | 'decline') =>
    run(decision, `/api/people/requests/${encodeURIComponent(request.id)}`, { body: { decision } })
  const inviter = request.invitedBy ? request.invitedBy.name || request.invitedBy.username : null
  const by = inviter
    ? request.viaGroupLink
      ? `Joined with ${inviter}’s group link`
      : `Invited by ${inviter}`
    : null
  return (
    <Card accent className="flex flex-wrap items-center gap-3.5 px-4 py-3.5">
      <WaitingFace />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[15px] font-extrabold">{`${request.username} is waiting to join`}</span>
        <span className="text-[13px] text-nx-ink-soft" suppressHydrationWarning>
          {[by, agoShort(request.askedAt), 'new faces need your OK on this server']
            .filter(Boolean)
            .join(' · ')}
        </span>
        {error && <span className="text-[13px] text-nx-danger">{error}</span>}
      </span>
      <span className="flex gap-2.5">
        <button
          type="button"
          className={BTN}
          disabled={!!busy}
          onClick={() => void decide('decline')}
        >
          Decline
        </button>
        <button
          type="button"
          className={PRIMARY_BTN}
          disabled={!!busy}
          onClick={() => void decide('approve')}
        >
          Let them in
        </button>
      </span>
    </Card>
  )
}

/** The ⋯ menu on a person's row. */
function MemberMenu({ member, lastAdmin }: { member: AdminMember; lastAdmin: boolean }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const { run, busy, error } = useAdminAction()
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (
        e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)
      )
        setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])
  const name = displayName(member)
  const item =
    'flex h-10 w-full items-center whitespace-nowrap rounded-xl px-3 text-left text-sm font-semibold hover:bg-white/10 disabled:opacity-50'
  return (
    <div ref={box} className="relative inline-block">
      <button
        type="button"
        aria-label={`More for ${name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="h-10 w-10 rounded-full bg-nx-plate text-base font-extrabold text-nx-ink hover:bg-nx-plate-hover"
      >
        <span aria-hidden>⋯</span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-11 z-30 flex w-56 flex-col gap-0.5 rounded-2xl border border-white/10 bg-nx-surface p-1.5 shadow-nx-toast"
        >
          <Link
            role="menuitem"
            href={`/admin/people/${encodeURIComponent(member.username)}`}
            className={item}
          >
            {`Open ${name}`}
          </Link>
          {member.role === 'admin' ? (
            <button
              type="button"
              role="menuitem"
              className={item}
              disabled={!!busy || lastAdmin}
              title={lastAdmin ? 'Every ADHX needs an admin' : undefined}
              onClick={() =>
                void run('role', `/api/admin/people/${encodeURIComponent(member.username)}`, {
                  body: { role: 'user' },
                }).then(() => setOpen(false))
              }
            >
              {member.isYou ? 'Stop being an admin' : 'Remove admin'}
            </button>
          ) : (
            !member.banned && (
              <button
                type="button"
                role="menuitem"
                className={item}
                disabled={!!busy}
                onClick={() =>
                  void run('role', `/api/admin/people/${encodeURIComponent(member.username)}`, {
                    body: { role: 'admin' },
                  }).then(() => setOpen(false))
                }
              >
                Make admin
              </button>
            )
          )}
          {!member.isYou && member.role !== 'admin' && (
            <button
              type="button"
              role="menuitem"
              className={cn(item, !member.banned && 'text-nx-danger')}
              disabled={!!busy}
              onClick={() => {
                if (
                  !member.banned &&
                  !window.confirm(
                    `Keep ${name} out? They're signed out everywhere and their saves are hidden.`,
                  )
                )
                  return
                void run('ban', '/api/admin/users', {
                  body: { username: member.username, banned: !member.banned },
                }).then(() => setOpen(false))
              }}
            >
              {member.banned ? 'Let back in' : 'Keep out'}
            </button>
          )}
          {error && <span className="px-3 py-1 text-xs text-nx-danger">{error}</span>}
        </div>
      )}
    </div>
  )
}

export function PeopleView({ data, server }: { data: PeopleBoard; server: string }) {
  const count = data.members.filter((m) => !m.banned).length
  const lastAdmin = data.admins <= 1
  return (
    <>
      <PageTitle
        title="People"
        sub={`${plural(count, 'person', 'people')} on ${server}. Members see each other; nobody outside does.`}
        right={
          <Link href="/admin/invites" className={PRIMARY_BTN}>
            Invite someone
          </Link>
        }
      />
      {data.requests.map((r) => (
        <JoinBanner key={r.id} request={r} />
      ))}
      <Card className="overflow-hidden">
        <TableBox>
          <table className="w-full min-w-[920px] border-collapse">
            <thead>
              <tr>
                <th scope="col" className={cn(TH, 'pl-4')}>
                  Person
                </th>
                <th scope="col" className={TH}>
                  Role
                </th>
                <th scope="col" className={TH}>
                  Joined
                </th>
                <th scope="col" className={TH}>
                  Last seen
                </th>
                {['Saves', 'Notes', 'Sends', 'Reactions', 'Channels', 'Phones'].map((h) => (
                  <th key={h} scope="col" className={cn(TH, 'text-right')}>
                    {h}
                  </th>
                ))}
                <th scope="col" className={TH}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.members.map((m) => (
                <tr key={m.username}>
                  <td className={cn(TD, 'h-[60px] pl-4')}>
                    <Link
                      href={`/admin/people/${encodeURIComponent(m.username)}`}
                      className="flex items-center gap-2.5 text-nx-ink hover:underline"
                    >
                      <Face who={m} size={34} />
                      <span className="flex flex-col gap-px">
                        <span className="font-extrabold">{`${displayName(m)}${m.isYou ? ' (you)' : ''}`}</span>
                        <span className="text-xs text-nx-ink-faint">
                          {`@${m.username} · invited by ${m.invitedBy ? displayName(m.invitedBy) : 'nobody'}`}
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td className={cn(TD, 'h-[60px]')}>
                    {m.banned ? (
                      <Chip tone="warn">Kept out</Chip>
                    ) : m.role === 'admin' ? (
                      <Chip tone="admin">Admin</Chip>
                    ) : (
                      <span className="text-[13px] text-nx-ink-soft">Member</span>
                    )}
                  </td>
                  <td className={cn(TD, 'h-[60px] text-nx-ink-soft')}>{shortDate(m.joinedAt)}</td>
                  <td className={cn(TD, 'h-[60px] text-nx-ink-soft')} suppressHydrationWarning>
                    {seenLabel(m.lastSeenAt)}
                  </td>
                  <td className={cn(TD, 'h-[60px] text-right')}>
                    <span className="font-extrabold">{fmt(m.saves)}</span>
                    <span className="block text-xs text-nx-ink-faint">{`${fmt(m.privateSaves)} Just for me`}</span>
                  </td>
                  <td className={cn(TD, 'h-[60px] text-right')}>{fmt(m.notes)}</td>
                  <td className={cn(TD, 'h-[60px] text-right')}>{fmt(m.sends)}</td>
                  <td className={cn(TD, 'h-[60px] text-right')}>{fmt(m.reactions)}</td>
                  <td className={cn(TD, 'h-[60px] text-right')}>{fmt(m.channels)}</td>
                  <td className={cn(TD, 'h-[60px] text-right')}>{fmt(m.phones)}</td>
                  <td className={cn(TD, 'h-[60px] pr-2.5 text-right')}>
                    <MemberMenu member={m} lastAdmin={lastAdmin && m.role === 'admin'} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableBox>
      </Card>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-3">
        <Card className="flex flex-col gap-1.5 px-4 py-3.5">
          <span className={LABEL}>Who can join</span>
          <span className="text-[15px] font-extrabold">{MODE_LINE[data.inviteMode]}</span>
          <Link
            href="/admin/invites"
            className="text-sm font-extrabold text-nx-accent underline hover:text-nx-ink"
          >
            Change
          </Link>
        </Card>
        <Card className="flex flex-col gap-1.5 px-4 py-3.5">
          <span className={LABEL}>Invites</span>
          <span className="text-[15px] font-extrabold">
            {`${fmt(data.invites.waiting)} waiting to be used · ${fmt(data.invites.used)} used`}
          </span>
          <span className="font-mono text-[13px] text-nx-ink-soft">
            {data.invites.codes.length ? data.invites.codes.join(' · ') : 'No links waiting'}
          </span>
        </Card>
        <Card className="flex flex-col gap-1.5 px-4 py-3.5">
          <span className={LABEL}>Phones paired</span>
          <span className="text-[15px] font-extrabold">
            {[
              plural(data.phones.total, 'phone'),
              [
                data.phones.ios ? `${data.phones.ios} iPhone` : null,
                data.phones.android ? `${data.phones.android} Android` : null,
              ]
                .filter(Boolean)
                .join(', '),
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
          <span className="text-[13px] text-nx-ink-soft">Remove one from the person’s page</span>
        </Card>
      </div>
    </>
  )
}
