'use client'

import Link from 'next/link'
import type { PersonBoard } from '@/lib/admin/boards/people'
import { useAdminAction } from './actions'
import {
  BTN,
  BTN_SM,
  Bars,
  Card,
  CardHead,
  Face,
  FaceStack,
  Kpi,
  KpiRow,
  Thumb,
  agoShort,
  displayName,
  fmt,
  names,
  plural,
  seenLabel,
  shortDate,
} from './parts'

function phoneKind(p: PersonBoard['phones'][number]): string {
  return p.platform === 'ios' ? 'iPhone' : p.platform === 'android' ? 'Android' : p.name
}

export function PersonView({ data }: { data: PersonBoard }) {
  const { run, busy, error } = useAdminAction()
  const m = data.member
  const name = displayName(m)
  const pronounSaves = m.isYou ? 'Your shared saves' : `${name}’s shared saves`
  const lastSeen = seenLabel(m.lastSeenAt)
  const role = m.banned ? 'Kept out' : m.role === 'admin' ? 'Admin' : 'Member'
  const days = data.days
  return (
    <>
      <div className="flex flex-wrap items-center gap-[18px]">
        <Link
          href="/admin/people"
          className="inline-flex h-10 items-center gap-1.5 rounded-full bg-[#1a1814] pl-2.5 pr-3.5 text-sm font-extrabold text-[#f4f1ea] hover:bg-[#262320]"
        >
          <svg
            aria-hidden
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M15 6l-6 6 6 6" />
          </svg>
          <span>People</span>
        </Link>
        <Face who={m} size={72} />
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="m-0 font-nx-serif text-[44px] font-normal leading-none">{name}</h2>
          <span className="text-sm text-[#a39b8b]" suppressHydrationWarning>
            {[
              `@${m.username}`,
              role,
              `joined ${shortDate(m.joinedAt)}`,
              m.invitedBy ? `invited by ${displayName(m.invitedBy)}` : null,
              `last seen ${lastSeen === 'Now' || lastSeen === 'Never' || lastSeen === 'Yesterday' ? lastSeen.toLowerCase() : lastSeen}`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
          {error && <span className="text-sm text-[#ff8a7a]">{error}</span>}
        </div>
        <span className="flex gap-2.5 md:ml-auto">
          {m.role === 'admin' ? (
            <button
              type="button"
              className={BTN}
              disabled={!!busy || data.lastAdmin}
              title={
                data.lastAdmin
                  ? 'Every ADHX needs an admin. Make someone else one first.'
                  : undefined
              }
              onClick={() =>
                void run('role', `/api/admin/people/${encodeURIComponent(m.username)}`, {
                  body: { role: 'user' },
                })
              }
            >
              {m.isYou ? 'Stop being an admin' : 'Remove admin'}
            </button>
          ) : (
            !m.banned && (
              <button
                type="button"
                className={BTN}
                disabled={!!busy}
                onClick={() =>
                  void run('role', `/api/admin/people/${encodeURIComponent(m.username)}`, {
                    body: { role: 'admin' },
                  })
                }
              >
                Make admin
              </button>
            )
          )}
          {!m.isYou && (
            <button
              type="button"
              className={BTN}
              disabled={!!busy || (m.role === 'admin' && !m.banned)}
              title={m.role === 'admin' && !m.banned ? 'Remove their admin first' : undefined}
              onClick={() => {
                if (
                  !m.banned &&
                  !window.confirm(
                    `Keep ${name} out? They're signed out everywhere and their saves are hidden.`,
                  )
                )
                  return
                void run('ban', '/api/admin/users', {
                  body: { username: m.username, banned: !m.banned },
                })
              }}
            >
              {m.banned ? 'Let back in' : 'Keep out'}
            </button>
          )}
        </span>
      </div>

      <KpiRow>
        <Kpi label="Saves" value={fmt(m.saves)} foot={`${fmt(m.privateSaves)} Just for me`} />
        <Kpi label="Notes" value={fmt(m.notes)} foot="on shared saves" />
        <Kpi label="Sends" value={fmt(m.sends)} foot={`${fmt(data.sendsWatched)} watched`} />
        <Kpi
          label="Reactions"
          value={fmt(m.reactions)}
          foot={data.topReaction ? `mostly ${data.topReaction}` : 'None yet'}
        />
        <Kpi label="Channels" value={fmt(m.channels)} foot={`${fmt(data.publicChannels)} public`} />
        <Kpi label="Watched" value={fmt(data.watched30d)} foot="posts this month" />
      </KpiRow>

      <div className="grid flex-1 grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_320px]">
        <Card className="flex flex-col gap-3 px-[18px] py-4">
          <CardHead title="Saves, last 30 days" />
          <Bars
            values={days.map((d) => d.shared)}
            second={days.map((d) => d.private)}
            height={120}
            highlightFrom={days.length - 7}
            label={`${name}'s saves per day, last 30 days`}
          />
          {data.habits && <span className="text-[13px] text-[#a39b8b]">{data.habits}</span>}
        </Card>
        <Card className="flex flex-col gap-3 px-[18px] py-4">
          <CardHead title={pronounSaves} note="newest first" />
          {data.sharedSaves.length ? (
            <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
              {data.sharedSaves.slice(0, 5).map((s) => (
                <li key={`${s.platform}:${s.id}`} className="flex min-w-0 items-center gap-3">
                  <Thumb src={s.thumbnail} />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <Link
                      href={s.openPath}
                      className="truncate text-sm font-extrabold text-[#f4f1ea] hover:underline"
                    >
                      {s.title}
                    </Link>
                    <span className="truncate text-xs text-[#a39b8b]" suppressHydrationWarning>
                      {`${s.network} · ${s.note ? `“${s.note}”` : agoShort(s.savedAt)}`}
                    </span>
                  </span>
                  <FaceStack faces={s.savers.slice(0, 3)} size={22} />
                  <span className="w-7 text-right text-sm font-extrabold">{s.savers.length}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="m-0 text-sm text-[#a39b8b]">No shared saves.</p>
          )}
          <span className="text-xs text-[#a39b8b]">
            Just for me saves are counted above, never listed.
          </span>
        </Card>
        <div className="flex min-w-0 flex-col gap-4 self-start">
          <Card className="flex flex-col gap-2.5 px-[18px] py-4">
            <CardHead title="Phones" note={String(data.phones.length)} />
            {data.phones.length ? (
              data.phones.map((p) => (
                <div key={p.id} className="flex items-center gap-2.5">
                  <svg
                    aria-hidden
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#c9bfab"
                    strokeWidth="2"
                    strokeLinecap="round"
                    className="shrink-0"
                  >
                    <rect x="6" y="2" width="12" height="20" rx="3" />
                    <path d="M11 18h2" />
                  </svg>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-sm font-extrabold">{`${phoneKind(p)} · ends ${p.hint}`}</span>
                    <span className="text-xs text-[#a39b8b]" suppressHydrationWarning>
                      {`Paired ${shortDate(p.createdAt)}${p.lastUsedAt ? ` · used ${agoShort(p.lastUsedAt)}` : ''}`}
                    </span>
                  </span>
                  <button
                    type="button"
                    className={BTN_SM}
                    disabled={!!busy}
                    onClick={() => {
                      if (
                        !window.confirm(
                          `Remove ${name}'s ${phoneKind(p)}? It stops working at once.`,
                        )
                      )
                        return
                      void run(
                        `phone:${p.id}`,
                        `/api/admin/people/${encodeURIComponent(m.username)}/phones/${encodeURIComponent(p.id)}`,
                        { method: 'DELETE' },
                      )
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))
            ) : (
              <p className="m-0 text-sm text-[#a39b8b]">No phones connected.</p>
            )}
          </Card>
          <Card className="flex flex-col gap-2.5 px-[18px] py-4">
            <CardHead title="Brought in" />
            {data.broughtIn.length ? (
              <span className="flex items-center gap-2.5">
                <FaceStack faces={data.broughtIn.slice(0, 4)} size={28} />
                <span className="text-sm font-extrabold">
                  {data.broughtIn.length > 4
                    ? plural(data.broughtIn.length, 'person', 'people')
                    : names(data.broughtIn.map(displayName))}
                </span>
              </span>
            ) : (
              <p className="m-0 text-sm text-[#a39b8b]">Nobody yet.</p>
            )}
            <span className="text-xs text-[#a39b8b]">
              {data.waitingInvites.length
                ? `${plural(data.waitingInvites.length, 'invite link')} waiting (${data.waitingInvites.join(', ')})`
                : 'No invite links waiting'}
            </span>
          </Card>
        </div>
      </div>
    </>
  )
}
