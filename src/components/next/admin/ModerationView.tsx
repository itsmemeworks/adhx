'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import type { ModerationBoard } from '@/lib/admin/boards/moderation'
import { useAdminAction } from './actions'
import { PostLookup } from './PostLookup'
import {
  BTN_SM,
  Card,
  CardHead,
  FIELD,
  FIELD_INPUT,
  Face,
  GobMark,
  PageTitle,
  Thumb,
  agoShort,
  displayName,
  plural,
  shortDate,
} from './parts'

interface LookedUpPerson {
  username: string
  displayName: string | null
  createdAt: string | null
  isAdmin: boolean
  isSelf: boolean
  banned: boolean
  bookmarkCount: number
  notes?: number
  phones?: number
  invitedBy?: string | null
  avatarUrl?: string | null
}

/** Look up a person: counts, Clear notes, Keep out / Let back in. */
function PersonLookup({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial)
  const [person, setPerson] = useState<LookedUpPerson | null>(null)
  const [missing, setMissing] = useState(false)
  const { run, busy, error } = useAdminAction()

  async function look(q: string) {
    if (!q.trim()) return
    setMissing(false)
    const res = await fetch(`/api/admin/users?username=${encodeURIComponent(q.trim())}`, {
      cache: 'no-store',
    })
    if (!res.ok) {
      setPerson(null)
      setMissing(true)
      return
    }
    setPerson((await res.json()) as LookedUpPerson)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    await look(value)
  }

  const name = person ? person.displayName || person.username : ''
  const canBan = person && !person.isSelf && !person.isAdmin
  return (
    <div className="flex flex-col gap-2.5">
      <form onSubmit={(e) => void submit(e)} className={FIELD}>
        <label className="contents">
          <span className="sr-only">Username</span>
          <input
            type="text"
            value={value}
            autoCapitalize="none"
            autoCorrect="off"
            placeholder="A username"
            onChange={(e) => setValue(e.target.value)}
            className={FIELD_INPUT}
          />
        </label>
        <button type="submit" className="sr-only">
          Look up
        </button>
      </form>
      {missing && <span className="text-xs text-[#ffb59a]">No one by that name.</span>}
      {person && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-[#262320] p-2.5">
          <Face
            who={{
              username: person.username,
              name: person.displayName,
              avatarUrl: person.avatarUrl ?? null,
            }}
            size={44}
          />
          <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
            <Link
              href={`/admin/people/${encodeURIComponent(person.username)}`}
              className="text-sm font-extrabold text-[#f4f1ea] hover:underline"
            >
              {`${name} · ${person.banned ? 'Kept out' : person.isAdmin ? 'Admin' : 'Member'} since ${shortDate(person.createdAt)}`}
            </Link>
            <span className="text-xs text-[#c9bfab]">
              {[
                plural(person.bookmarkCount, 'save'),
                person.notes !== undefined ? plural(person.notes, 'note') : null,
                person.phones !== undefined ? plural(person.phones, 'phone') : null,
                person.invitedBy ? `invited by ${person.invitedBy}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
            {error && <span className="text-xs text-[#ff8a7a]">{error}</span>}
          </span>
          <span className="flex gap-2.5">
            <button
              type="button"
              className={BTN_SM}
              disabled={!!busy}
              onClick={() =>
                void run('notes', '/api/admin/users', {
                  body: { username: person.username, clearNotes: true },
                }).then(() => look(person.username))
              }
            >
              Clear notes
            </button>
            {canBan && (
              <button
                type="button"
                className={BTN_SM}
                disabled={!!busy}
                onClick={() => {
                  if (
                    !person.banned &&
                    !window.confirm(
                      `Keep ${name} out? They're signed out everywhere and their saves are hidden.`,
                    )
                  )
                    return
                  void run('ban', '/api/admin/users', {
                    body: { username: person.username, banned: !person.banned },
                  }).then(() => look(person.username))
                }}
              >
                {person.banned ? 'Let back in' : 'Keep out'}
              </button>
            )}
          </span>
        </div>
      )}
    </div>
  )
}

export function ModerationView({ data }: { data: ModerationBoard }) {
  const { run, busy } = useAdminAction()
  return (
    <>
      <PageTitle
        title="Moderation"
        sub="Hide a post from every public page, clear a note, or keep someone out. Every action is logged."
      />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
        <Card className="flex flex-col gap-2.5 px-[18px] py-4">
          <CardHead title="Look up a post" />
          <PostLookup placeholder="Paste a post link" />
        </Card>
        <Card className="flex flex-col gap-2.5 px-[18px] py-4">
          <CardHead title="Look up a person" />
          <PersonLookup />
        </Card>
      </div>
      <div className="grid flex-1 grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-3">
        <Card className="flex flex-col gap-2.5 px-[18px] py-4">
          <CardHead title="Hidden posts" note={String(data.hidden.length)} />
          {data.hidden.length ? (
            <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
              {data.hidden.map((h) => (
                <li key={`${h.platform}:${h.id}`} className="flex items-center gap-2.5">
                  <Thumb src={h.thumbnail} size={40} radius={10} />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-sm font-extrabold">{h.title}</span>
                    <span className="text-xs text-[#a39b8b]">
                      {[
                        h.reason,
                        h.hiddenBy ? `hidden by ${displayName(h.hiddenBy)}` : null,
                        shortDate(h.hiddenAt),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  <button
                    type="button"
                    className={BTN_SM}
                    disabled={!!busy}
                    onClick={() =>
                      void run(`show:${h.id}`, '/api/admin/posts', {
                        body: { platform: h.platform, id: h.id, hidden: false },
                      })
                    }
                  >
                    Show
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 text-sm text-[#a39b8b]">Nothing hidden.</p>
          )}
        </Card>
        <Card className="flex min-h-[240px] flex-col gap-2.5 px-[18px] py-4">
          <CardHead title="Kept out" note={String(data.keptOut.length)} />
          {data.keptOut.length ? (
            <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
              {data.keptOut.map((k) => (
                <li key={k.face.username} className="flex items-center gap-2.5">
                  <Face who={k.face} size={32} />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-sm font-extrabold">{displayName(k.face)}</span>
                    <span className="text-xs text-[#a39b8b]">
                      {[k.reason, k.by ? `by ${displayName(k.by)}` : null, shortDate(k.at)]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  <button
                    type="button"
                    className={BTN_SM}
                    disabled={!!busy}
                    onClick={() =>
                      void run(`unban:${k.face.username}`, '/api/admin/users', {
                        body: { username: k.face.username, banned: false },
                      })
                    }
                  >
                    Let back in
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2.5 text-center">
              <GobMark />
              <span className="text-[15px] font-extrabold">Nobody’s been kept out</span>
              <span className="text-[13px] text-[#a39b8b]">
                Keeping someone out signs them out everywhere and hides their saves. You can let
                them back in.
              </span>
            </div>
          )}
        </Card>
        <Card className="flex flex-col gap-2.5 px-[18px] py-4">
          <CardHead title="Log" note="last 30 days" />
          {data.log.length ? (
            <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
              {data.log.slice(0, 12).map((l, i) => (
                <li key={i} className="flex items-center gap-2.5 text-sm">
                  {l.actor ? <Face who={l.actor} size={24} /> : <span className="block h-6 w-6" />}
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-extrabold">
                      {l.actor ? displayName(l.actor) : 'Someone'}
                    </span>
                    <span className="text-[#c9bfab]">{` ${l.verb} `}</span>
                    <span className="font-extrabold">{l.target}</span>
                  </span>
                  <span className="whitespace-nowrap text-[#a39b8b]" suppressHydrationWarning>
                    {agoShort(l.at).replace(/ ago$/, '') === 'just now' ? 'Now' : shortDate(l.at)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 text-sm text-[#a39b8b]">Nothing in the last 30 days.</p>
          )}
        </Card>
      </div>
    </>
  )
}
