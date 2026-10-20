'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { cleanNote, NOTE_MAX, noteLength } from '@/lib/people/note-text'

/** The counter shows from here (characters people see). */
const COUNT_FROM = NOTE_MAX - 20

/**
 * "Add a note" on your save (key it by post): a few words for your people, shown next to your
 * face to members only. Saves itself on Enter or when the field loses focus
 * (`PATCH /api/bookmarks/[id]/note`); clearing the words clears the note.
 * At most 140 characters (an emoji counts as one), with a counter near the end.
 */
export function NoteField({
  platform,
  id,
  initial,
  onSaved,
  className,
}: {
  platform: string
  id: string
  /** Your note as it stands. */
  initial: string | null | undefined
  onSaved?: (note: string | null) => void
  className?: string
}) {
  const field = useId()
  const [value, setValue] = useState(initial ?? '')
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')
  const saved = useRef<string | null>(initial ?? null)

  // A note changed elsewhere (not by this field): show it. Key the field by
  // post so moving to another post starts fresh.
  useEffect(() => {
    if ((initial ?? null) === saved.current) return
    saved.current = initial ?? null
    setValue(initial ?? '')
    setState('idle')
  }, [initial])

  const used = noteLength(value)

  const save = async () => {
    const next = cleanNote(value)
    if (next === saved.current) return
    setState('saving')
    try {
      const res = await fetch(`/api/bookmarks/${encodeURIComponent(id)}/note`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, note: next }),
      })
      const data = (await res.json().catch(() => null)) as { note?: string | null } | null
      if (!res.ok || !data || !('note' in data)) throw new Error('note failed')
      saved.current = data.note ?? null
      setValue(data.note ?? '')
      setState('saved')
      onSaved?.(data.note ?? null)
    } catch {
      setState('failed')
    }
  }

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <span className="flex items-baseline justify-between gap-2">
        <label htmlFor={field} className="text-[13px] font-bold text-white/70">
          Add a note
        </label>
        <span aria-live="polite" className="text-xs text-white/55">
          {state === 'saving' && <span>Saving…</span>}
          {state === 'saved' && <span>Saved</span>}
          {state === 'failed' && (
            <span className="text-[#ff8f8f]">Couldn’t save that. Try again.</span>
          )}
        </span>
      </span>
      <span className="relative flex">
        <input
          id={field}
          type="text"
          value={value}
          autoComplete="off"
          enterKeyHint="done"
          placeholder="Say why it’s for them"
          aria-describedby={used >= COUNT_FROM ? `${field}-count` : undefined}
          onChange={(e) => {
            const text = e.target.value
            // Cap at what people see, so an emoji counts once.
            setValue(noteLength(text) > NOTE_MAX ? (cleanNote(text) ?? '') : text)
            if (state !== 'saving') setState('idle')
          }}
          onBlur={() => void save()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void save()
            }
          }}
          className={cn(
            'h-12 w-full rounded-xl border border-white/10 bg-black/40 px-3.5 text-[15px] text-white outline-none placeholder:text-white/40 focus:border-nx-accent',
            used >= COUNT_FROM && 'pr-16',
          )}
        />
        {used >= COUNT_FROM && (
          <span
            id={`${field}-count`}
            className={cn(
              'pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold tabular-nums',
              used >= NOTE_MAX ? 'text-nx-accent' : 'text-white/55',
            )}
          >
            <span className="sr-only">Characters used: </span>
            <span>{`${used}/${NOTE_MAX}`}</span>
          </span>
        )}
      </span>
    </div>
  )
}
