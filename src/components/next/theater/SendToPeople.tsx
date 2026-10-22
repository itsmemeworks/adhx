'use client'

import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { NOTE_MAX, noteLength } from '@/lib/people/note-text'
import { NxAvatar } from '../primitives'
import { namesOf } from '../moments/people'

/**
 * "Or straight to your people" (board j4-4): a row of faces in the Share
 * sheet. Tapping one sends the post to that member (with the note, when
 * there is one) and ticks the face. Someone who already has it is dimmed,
 * with "Jo already has it." Only members ever see this; the server answers
 * 404 for a post you can't see, and `sendable: false` when it's only your
 * own private save.
 */

export interface SendPerson {
  username: string
  name: string | null
  avatarUrl: string | null
  has: boolean
  sent: boolean
}

type Loaded = { sendable: boolean; people: SendPerson[] }

function nameOf(p: SendPerson): string {
  return p.name?.trim() || p.username
}

/** "Jo already has it.", "Jo and Mum already have it." */
export function alreadyLine(people: readonly SendPerson[]): string {
  const names = people.filter((p) => p.has).map(nameOf)
  if (names.length === 0) return ''
  return `${namesOf(names)} already ${names.length === 1 ? 'has' : 'have'} it.`
}

export function SendToPeople({
  platform,
  id,
  className,
}: {
  platform: string
  id: string
  className?: string
}) {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    setLoaded(null)
    void fetch(
      `/api/posts/send?platform=${encodeURIComponent(platform)}&id=${encodeURIComponent(id)}`,
      { cache: 'no-store' },
    )
      .then(async (res) => (res.ok ? ((await res.json()) as Loaded) : null))
      .catch(() => null)
      .then((body) => {
        if (live && body) setLoaded(body)
      })
    return () => {
      live = false
    }
  }, [platform, id])

  if (!loaded) return null
  if (!loaded.sendable) {
    return (
      <p className={cn('m-0 text-[13px] text-white/60', className)}>
        Just for you. Share it first to send it.
      </p>
    )
  }
  if (loaded.people.length === 0) return null

  const send = async (person: SendPerson) => {
    if (person.has || person.sent || busy) return
    setBusy(person.username)
    setFailed(false)
    try {
      const res = await fetch('/api/posts/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform,
          id,
          to: [person.username],
          ...(note.trim() ? { note: note.trim() } : {}),
        }),
      })
      const body = res.ok
        ? ((await res.json()) as {
            sent: string[]
            skipped: { username: string; reason: string }[]
          })
        : null
      if (!body) {
        setFailed(true)
        return
      }
      const skipped = new Map(body.skipped.map((s) => [s.username, s.reason]))
      setLoaded((prev) =>
        prev
          ? {
              ...prev,
              people: prev.people.map((p) =>
                body.sent.includes(p.username) || skipped.get(p.username) === 'sent'
                  ? { ...p, sent: true }
                  : skipped.get(p.username) === 'has'
                    ? { ...p, has: true }
                    : p,
              ),
            }
          : prev,
      )
    } catch {
      setFailed(true)
    } finally {
      setBusy(null)
    }
  }

  const already = alreadyLine(loaded.people)
  const over = noteLength(note) > NOTE_MAX
  return (
    <section
      aria-label="Or straight to your people"
      className={cn('flex flex-col gap-2.5', className)}
    >
      <span className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-white/55">
        Or straight to your people
      </span>
      <label className="sr-only" htmlFor="nx-send-note">
        A note with it (optional)
      </label>
      <input
        id="nx-send-note"
        value={note}
        maxLength={NOTE_MAX * 2}
        placeholder="Add a note (optional)"
        onChange={(e) => setNote(e.currentTarget.value)}
        className={cn(
          'h-10 w-full rounded-[var(--nx-nest,10px)] bg-white/[0.08] px-3 text-base text-white/90 outline-none placeholder:text-white/40 focus:ring-2 focus:ring-nx-accent sm:text-[13px]',
          over && 'ring-2 ring-red-400',
        )}
      />
      <ul className="m-0 flex list-none flex-wrap gap-x-2.5 gap-y-2 p-0">
        {loaded.people.map((p) => {
          const done = p.sent
          const dim = p.has
          return (
            <li key={p.username}>
              <button
                type="button"
                disabled={dim || done || busy !== null || over}
                aria-label={
                  dim
                    ? `${nameOf(p)} already has it`
                    : done
                      ? `Sent to ${nameOf(p)}`
                      : `Send to ${nameOf(p)}`
                }
                onClick={() => void send(p)}
                className={cn(
                  'flex w-[52px] flex-col items-center gap-1 disabled:cursor-default',
                  dim && 'opacity-40',
                )}
              >
                <span className="relative block">
                  <NxAvatar
                    author={{ avatarUrl: p.avatarUrl, handle: p.username, name: nameOf(p) }}
                    size={48}
                    className={cn(busy === p.username && 'animate-pulse')}
                  />
                  {done && (
                    <span
                      aria-hidden
                      className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-nx-accent text-black ring-2 ring-[#1c1b19]"
                    >
                      <Check className="h-3 w-3" strokeWidth={3} />
                    </span>
                  )}
                </span>
                <span className="max-w-full truncate text-[12px] font-semibold">{nameOf(p)}</span>
              </button>
            </li>
          )
        })}
      </ul>
      {already && <span className="text-[12px] leading-tight text-white/55">{already}</span>}
      {failed && (
        <span role="status" className="text-[13px] text-white/70">
          That didn’t send. Try again.
        </span>
      )}
    </section>
  )
}
