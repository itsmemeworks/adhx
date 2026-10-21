'use client'

import { useState } from 'react'
import type { InvitesBoard } from '@/lib/admin/boards/moderation'
import { cn } from '@/lib/utils'
import { copyText, useAdminAction } from './actions'
import {
  BTN_SM,
  Card,
  CardHead,
  Chip,
  Face,
  PRIMARY_BTN,
  PRIMARY_SM,
  PageTitle,
  TD,
  TH,
  TableBox,
  WaitingFace,
  agoShort,
  displayName,
  names,
} from './parts'

const MODES: { id: InvitesBoard['mode']; label: string; hint: (admins: string) => string }[] = [
  { id: 'admin', label: 'Only admins', hint: (admins) => admins || 'Admins only' },
  { id: 'approve', label: 'Anyone, I approve', hint: () => 'New faces wait for an admin' },
  { id: 'anyone', label: 'Anyone', hint: () => 'Straight in, no approval' },
]

function expiresIn(ms: number, now = Date.now()): string {
  const days = Math.round((ms - now) / (24 * 60 * 60_000))
  if (days >= 2) return `in ${days} days`
  const hours = Math.max(1, Math.round((ms - now) / 3_600_000))
  return hours >= 24 ? 'in a day' : hours === 1 ? 'in an hour' : `in ${hours} hours`
}

function lastsFor(ms: number, now = Date.now()): string {
  const mins = Math.max(1, Math.round((ms - now) / 60_000))
  return `lasts ${mins} more min`
}

export function InvitesView({ data }: { data: InvitesBoard }) {
  const { run, busy, error } = useAdminAction()
  const [made, setMade] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const admins = names(data.admins.map(displayName))

  async function copy(key: string, url: string) {
    if (await copyText(url)) {
      setCopied(key)
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 2000)
    } else {
      setMade(url)
    }
  }

  async function makeLink() {
    const res = await run('make', '/api/invites', { body: {} })
    if (res && typeof res.url === 'string') {
      setMade(res.url)
      await copy('made', res.url)
    }
  }

  async function copyInvite(id: string) {
    const res = await run(`link:${id}`, `/api/invites/${encodeURIComponent(id)}/link`, { body: {} })
    if (res && typeof res.url === 'string') await copy(id, res.url)
  }

  return (
    <>
      <PageTitle
        title="Invites"
        sub="Everyone joins with a link. Links are single use and last 7 days."
        right={
          <button
            type="button"
            className={PRIMARY_BTN}
            disabled={!!busy}
            onClick={() => void makeLink()}
          >
            {copied === 'made' ? 'Link copied' : 'Make an invite link'}
          </button>
        }
      />
      {(made || error) && (
        <Card accent className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
          {error ? (
            <span className="text-[#ff8a7a]">{error}</span>
          ) : (
            <>
              <span className="text-[#c9bfab]">New link, works once:</span>
              <span className="min-w-0 flex-1 truncate font-mono text-[13px]">{made}</span>
              <button
                type="button"
                className={BTN_SM}
                onClick={() => made && void copy('made', made)}
              >
                {copied === 'made' ? 'Copied' : 'Copy link'}
              </button>
            </>
          )}
        </Card>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="flex flex-col gap-3 px-[18px] py-4">
          <CardHead title="Who can invite" />
          <div
            role="radiogroup"
            aria-label="Who can invite"
            className="grid grid-cols-[minmax(0,1fr)] gap-2.5 sm:grid-cols-3"
          >
            {MODES.map((m) => {
              const on = data.mode === m.id
              return (
                <label
                  key={m.id}
                  className={cn(
                    'flex cursor-pointer flex-col gap-1 rounded-2xl border-[1.5px] bg-[#262320] px-3.5 py-3',
                    on ? 'border-nx-accent' : 'border-transparent',
                  )}
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="who-can-invite"
                      checked={on}
                      disabled={!!busy}
                      onChange={() =>
                        void run('mode', '/api/people', {
                          method: 'PATCH',
                          body: { inviteMode: m.id },
                        })
                      }
                      className="accent-nx-accent"
                    />
                    <span className="text-sm font-extrabold">{m.label}</span>
                  </span>
                  <span className="text-xs text-[#a39b8b]">{m.hint(admins)}</span>
                </label>
              )
            })}
          </div>
        </Card>
        <Card accent={data.requests.length > 0} className="flex flex-col gap-2.5 px-[18px] py-4">
          <CardHead title="Waiting for you" note={String(data.requests.length)} />
          {data.requests.length ? (
            data.requests.map((r) => (
              <div key={r.id} className="flex flex-col gap-2.5">
                <div className="flex items-center gap-2.5">
                  <WaitingFace />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-sm font-extrabold">{r.username}</span>
                    <span className="text-xs text-[#a39b8b]" suppressHydrationWarning>
                      {[
                        r.invitedBy
                          ? `Invited by ${r.invitedBy.name || r.invitedBy.username}`
                          : null,
                        agoShort(r.askedAt),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                </div>
                <span className="flex gap-2">
                  <button
                    type="button"
                    className={BTN_SM}
                    disabled={!!busy}
                    onClick={() =>
                      void run('decline', `/api/people/requests/${encodeURIComponent(r.id)}`, {
                        body: { decision: 'decline' },
                      })
                    }
                  >
                    Decline
                  </button>
                  <button
                    type="button"
                    className={PRIMARY_SM}
                    disabled={!!busy}
                    onClick={() =>
                      void run('approve', `/api/people/requests/${encodeURIComponent(r.id)}`, {
                        body: { decision: 'approve' },
                      })
                    }
                  >
                    Let them in
                  </button>
                </span>
              </div>
            ))
          ) : (
            <p className="m-0 text-sm text-[#a39b8b]">Nobody’s waiting.</p>
          )}
        </Card>
      </div>

      <div className="grid flex-1 grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="min-w-0 overflow-hidden">
          <div className="px-4 pb-1.5 pt-3.5">
            <CardHead title="Links" note={`${data.waiting} waiting · ${data.used} used`} />
          </div>
          <TableBox>
            <table className="w-full min-w-[640px] border-collapse">
              <thead>
                <tr>
                  <th scope="col" className={cn(TH, 'pl-4')}>
                    Code
                  </th>
                  <th scope="col" className={TH}>
                    Made by
                  </th>
                  <th scope="col" className={TH}>
                    Made
                  </th>
                  <th scope="col" className={TH}>
                    Expires
                  </th>
                  <th scope="col" className={TH}>
                    State
                  </th>
                  <th scope="col" className={cn(TH, 'pr-4')}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.links.map((l) => (
                  <tr key={l.id}>
                    <td className={cn(TD, 'pl-4')}>
                      <span
                        className={cn(
                          'font-mono text-base font-extrabold tracking-[0.08em]',
                          l.state !== 'waiting' && 'text-[#a39b8b]',
                        )}
                      >
                        {l.code}
                      </span>
                    </td>
                    <td className={TD}>
                      {l.by ? (
                        <span className="inline-flex items-center gap-2">
                          <Face who={l.by} size={24} />
                          <span>{displayName(l.by)}</span>
                        </span>
                      ) : (
                        <span className="text-[#a39b8b]">Someone who left</span>
                      )}
                    </td>
                    <td className={cn(TD, 'text-[#c9bfab]')} suppressHydrationWarning>
                      {agoShort(l.createdAt)}
                    </td>
                    <td className={cn(TD, 'text-[#c9bfab]')} suppressHydrationWarning>
                      {l.state === 'waiting'
                        ? expiresIn(l.expiresAt)
                        : l.state === 'used'
                          ? 'Used'
                          : l.state === 'expired'
                            ? 'Expired'
                            : 'Cancelled'}
                    </td>
                    <td className={TD}>
                      {l.state === 'waiting' ? (
                        <Chip>Waiting</Chip>
                      ) : l.usedBy && l.usedByWaiting ? (
                        <Chip tone="accent">{`${l.usedBy.username} is waiting`}</Chip>
                      ) : l.usedBy ? (
                        <Chip>{`${displayName(l.usedBy)} joined`}</Chip>
                      ) : (
                        <Chip>{l.state === 'expired' ? 'Expired' : 'Cancelled'}</Chip>
                      )}
                    </td>
                    <td className={cn(TD, 'pr-4 text-right')}>
                      {l.state === 'waiting' && (
                        <span className="inline-flex gap-2">
                          <button
                            type="button"
                            className={BTN_SM}
                            disabled={!!busy}
                            title="Makes a fresh link (the old one stops working)"
                            onClick={() => void copyInvite(l.id)}
                          >
                            {copied === l.id ? 'Copied' : 'Copy link'}
                          </button>
                          <button
                            type="button"
                            className={BTN_SM}
                            disabled={!!busy}
                            onClick={() =>
                              void run(
                                `cancel:${l.id}`,
                                `/api/invites/${encodeURIComponent(l.id)}`,
                                {
                                  method: 'DELETE',
                                },
                              )
                            }
                          >
                            Cancel
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {!data.links.length && (
                  <tr>
                    <td colSpan={6} className={cn(TD, 'pl-4 text-[#a39b8b]')}>
                      No invite links yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </TableBox>
        </Card>
        <Card className="flex flex-col gap-2.5 px-[18px] py-4">
          <CardHead title="Sign-in links" note="held for an admin" />
          <span className="text-[13px] text-[#a39b8b]">
            {data.signIn.delivery === 'admin'
              ? 'This server has no email set up, so sign-in links wait here for you to pass on. Anyone holding one can sign in as that person.'
              : data.signIn.delivery === 'email'
                ? 'Sign-in links go out by email on this server, so none wait here.'
                : 'Sign-in links are printed in the server’s log on this server.'}
          </span>
          {data.signIn.links.map((s) => (
            <div
              key={s.tokenHash}
              className="flex items-center gap-2.5 rounded-[14px] bg-[#262320] p-2.5"
            >
              {s.face ? <Face who={s.face} size={32} /> : <WaitingFace size={32} />}
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-sm font-extrabold">
                  {`${s.face ? displayName(s.face) : s.email} asked to sign in`}
                </span>
                <span className="text-xs text-[#a39b8b]" suppressHydrationWarning>
                  {`${agoShort(s.createdAt)} · ${lastsFor(s.expiresAt)}`}
                </span>
              </span>
              <button
                type="button"
                className={BTN_SM}
                onClick={() => void copy(s.tokenHash, s.url)}
              >
                {copied === s.tokenHash ? 'Copied' : 'Copy link'}
              </button>
            </div>
          ))}
        </Card>
      </div>
    </>
  )
}
