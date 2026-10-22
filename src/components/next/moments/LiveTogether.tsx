'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Smile } from 'lucide-react'
import type { FeedItem } from '@/components/feed/types'
import type { Saver } from '@/lib/people/types'
import {
  cleanReactionText,
  MAX_REACTION_TEXT,
  REACTION_EMOJI,
  type ReactionEmoji,
} from '@/lib/moments/reactions'
import { cn } from '@/lib/utils'
import { NxAvatar, NxImage } from '../primitives'
import { postCoverSrc } from '../post'
import { saverName } from '../savers'
import { arrivalLine, namesOf, personColour, watchingLine } from './people'

/**
 * Watching a moment together, with names (members only — strangers never get
 * the `savers`, `watchers` or reactions these show): faces, who's watching
 * with you, the arriving-save toast, the React button and picker, and
 * reactions rising up the stage. Motion is off under reduced motion (`animate-nx-*`, globals.css).
 */

/** Green: tuned in now. */
export const LIVE_RING = '#5ee38a'

/** Overlapping faces; `live` rings them green (tuned in now). Decorative: say the names next to it. */
export function Faces({
  people,
  size = 28,
  live = false,
  max = 3,
  ring = '#1a1814',
  className,
}: {
  people: readonly Saver[]
  size?: number
  live?: boolean
  max?: number
  /** The colour behind the faces, so each one reads as separate. */
  ring?: string
  className?: string
}) {
  const faces = people.slice(0, max)
  if (faces.length === 0) return null
  return (
    <span aria-hidden className={cn('flex shrink-0', className)}>
      {faces.map((p, i) => (
        <span
          key={p.username}
          className="block"
          style={{
            marginLeft: i === 0 ? 0 : live ? -4 : -Math.round(size / 3.5),
            zIndex: faces.length - i,
          }}
        >
          <NxAvatar
            author={{ avatarUrl: p.avatarUrl, handle: p.username, name: saverName(p) }}
            size={size}
            style={{
              boxShadow: live ? `0 0 0 2px ${ring}, 0 0 0 4px ${LIVE_RING}` : `0 0 0 2px ${ring}`,
            }}
          />
        </span>
      ))}
    </span>
  )
}

/** "Ana and Ben are watching with you", green-ringed faces. Nothing when nobody else is in. */
export function WatchersBar({
  watchers,
  className,
}: {
  watchers: readonly Saver[]
  className?: string
}) {
  if (watchers.length === 0) return null
  const names = namesOf(watchers.map(saverName))
  const rest = `${watchers.length === 1 ? 'is' : 'are'} watching with you`
  return (
    <div
      role="status"
      aria-label={watchingLine(watchers, true)}
      className={cn('nx-plate flex items-center gap-3 rounded-2xl py-2.5 pl-3 pr-4', className)}
    >
      <Faces people={watchers} size={30} live ring="#111" max={4} className="pl-1" />
      <span className="min-w-0 text-[14px] leading-[1.35] text-white">
        <span className="font-extrabold">{names}</span>
        <span>{` ${rest}`}</span>
      </span>
    </div>
  )
}

/** The React button for the rail: opens the picker. */
export function ReactButton({
  open,
  onToggle,
  className,
}: {
  open: boolean
  onToggle: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      aria-label="React"
      title="React"
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={onToggle}
      className={cn(
        'nx-plate pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full md:h-[52px] md:w-[52px]',
        open ? 'text-nx-accent ring-2 ring-nx-accent' : 'text-white',
        className,
      )}
    >
      <Smile aria-hidden className="h-[22px] w-[22px]" />
    </button>
  )
}

/**
 * Pick an emoji (sends it and closes) or say a few words: to everyone
 * watching in Live (`live`), else on the post for the people who can see it.
 * The words are sent as typed; the server cleans them and they are only ever
 * shown as text.
 */
export function ReactionPicker({
  onEmoji,
  onText,
  onClose,
  live = false,
  disabled = false,
  error,
  className,
}: {
  onEmoji: (emoji: ReactionEmoji) => void | Promise<boolean>
  onText: (text: string) => void | Promise<boolean>
  onClose: () => void
  /** Tuned in to a moment: the words go to everyone watching too. */
  live?: boolean
  disabled?: boolean
  error?: string | null
  className?: string
}) {
  const [text, setText] = useState('')
  const inputId = useId()
  const first = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    first.current?.focus()
  }, [])
  const clean = cleanReactionText(text)
  return (
    <div
      role="dialog"
      aria-label="React"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onClose()
        }
      }}
      // What lines its edges curves at 26 − 12 − 1 = 13 px.
      className={cn(
        'pointer-events-auto flex max-h-[calc(100%-32px)] min-w-0 flex-col gap-2.5 overflow-y-auto overscroll-contain rounded-[26px] border border-white/10 bg-[#1a1814]/90 p-3 text-white shadow-nx-toast backdrop-blur-xl',
        className,
      )}
    >
      <div
        role="group"
        aria-label="Quick reactions"
        className="grid grid-cols-3 gap-1.5 min-[380px]:grid-cols-6"
      >
        {REACTION_EMOJI.map((r, i) => (
          <button
            key={r.emoji}
            ref={i === 0 ? first : undefined}
            type="button"
            aria-label={r.label}
            title={r.label}
            disabled={disabled}
            onClick={() => onEmoji(r.emoji)}
            className="flex h-12 min-w-0 items-center justify-center rounded-[13px] bg-[#262320] text-[26px] leading-none transition-transform hover:scale-110 disabled:opacity-60 motion-reduce:hover:scale-100"
          >
            <span aria-hidden>{r.emoji}</span>
          </button>
        ))}
      </div>
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!clean || disabled) return
          if ((await onText(clean)) !== false) setText('')
        }}
      >
        <label htmlFor={inputId} className="sr-only">
          Say something
        </label>
        <input
          id={inputId}
          value={text}
          onChange={(e) => setText(Array.from(e.target.value).slice(0, MAX_REACTION_TEXT).join(''))}
          maxLength={MAX_REACTION_TEXT * 2}
          disabled={disabled}
          aria-describedby={`${inputId}-hint`}
          autoComplete="off"
          enterKeyHint="send"
          placeholder={live ? 'Say something to everyone watching' : 'Say something'}
          className="h-11 min-w-0 flex-1 rounded-[13px] border border-[#4a453e] bg-[#0f0e0c] px-4 text-[15px] text-nx-cream placeholder:text-nx-muted"
        />
        <button
          type="submit"
          disabled={!clean || disabled}
          className="h-11 shrink-0 rounded-[13px] bg-nx-accent px-[18px] text-[15px] font-extrabold text-black disabled:opacity-50"
        >
          <span>{disabled ? 'Sending…' : error ? 'Retry' : 'Send'}</span>
        </button>
      </form>
      <p id={`${inputId}-hint`} className="m-0 text-xs text-nx-soft">
        {live
          ? 'Everyone watching sees it now. It stays on the post for people who can see it.'
          : 'People who can see this post see it when they watch it.'}
      </p>
      {error && (
        <p role="status" className="m-0 text-sm text-[#ffb891]">
          {error}
        </p>
      )}
    </div>
  )
}

export interface FloatingReaction {
  id: string
  saver: Saver
  emoji?: ReactionEmoji
  text?: string
}

/** A steady spread across the stage, from the reaction's id. */
function lane(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return 4 + (h % 56)
}

/**
 * Reactions rising up the stage for a few seconds. The sender's face leads,
 * ringed in their colour: an emoji sits on it like a sticker, words come as a
 * speech bubble in their colour pointing back at them. Under reduced motion
 * they fade in and out in place (globals.css).
 */
export function ReactionFloats({
  reactions,
  className,
}: {
  reactions: readonly FloatingReaction[]
  className?: string
}) {
  return (
    <ul
      aria-label="Reactions from people watching"
      aria-live="polite"
      className={cn('pointer-events-none m-0 list-none p-0', className)}
    >
      {reactions.map((r) => {
        const name = saverName(r.saver)
        const colour = personColour(r.saver.username)
        const size = r.emoji ? 44 + (lane(`${r.id}s`) % 3) * 6 : 44
        const label = REACTION_EMOJI.find((e) => e.emoji === r.emoji)?.label
        const face = (
          <span aria-hidden className="relative block shrink-0">
            <NxAvatar
              author={{ avatarUrl: r.saver.avatarUrl, handle: r.saver.username, name }}
              size={size}
              style={{ boxShadow: `0 0 0 3px #000, 0 0 0 5px ${colour}` }}
            />
          </span>
        )
        return (
          <li
            key={r.id}
            className="animate-nx-react-float absolute bottom-0"
            // Words need room for the bubble, so they start further left.
            style={{ left: `${r.emoji ? lane(r.id) : 2 + (lane(r.id) % 20)}%` }}
          >
            {r.emoji ? (
              <span className="relative block" style={{ width: size, height: size }}>
                <span className="sr-only">{`${name}: ${label ?? r.emoji}`}</span>
                {face}
                <span
                  aria-hidden
                  className="absolute leading-none drop-shadow-md"
                  style={{
                    right: -Math.round(size * 0.28),
                    bottom: -Math.round(size * 0.22),
                    fontSize: Math.round(size * 0.6),
                  }}
                >
                  {r.emoji}
                </span>
              </span>
            ) : (
              <span className="flex items-end gap-1.5">
                <span className="sr-only">{`${name} said:`}</span>
                {face}
                <span
                  className="relative mb-[18px] max-w-[min(260px,60vw)] truncate rounded-[16px_16px_16px_4px] px-3 py-2 text-[14px] font-bold text-black"
                  style={{ background: colour }}
                >
                  <span>{r.text}</span>
                </span>
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/** "Jo just saved one · playing next" (or "playing now"), with the post's picture and Jo's face. */
export function ArrivalToast({
  saver,
  post,
  hue,
  now = false,
  onPlay,
  className,
}: {
  saver: Saver
  post: FeedItem
  hue: string
  /** It is already on (you were caught up). */
  now?: boolean
  onPlay?: () => void
  className?: string
}) {
  const cover = postCoverSrc(post)
  const body = (
    <>
      <span className="relative shrink-0">
        {/* In the toast's corner: 18 − 10 = 8 px. */}
        <span className="block h-[42px] w-[42px] overflow-hidden rounded-[8px] bg-[#2a2620]">
          {cover && <NxImage src={cover} alt="" className="h-full w-full object-cover" />}
        </span>
        <span aria-hidden className="absolute -bottom-1.5 -right-1.5 block">
          <NxAvatar
            author={{ avatarUrl: saver.avatarUrl, handle: saver.username, name: saverName(saver) }}
            size={22}
            style={{ boxShadow: '0 0 0 2px #1a1814' }}
          />
        </span>
      </span>
      <span className="flex min-w-0 flex-col gap-0.5 text-left text-[13px]">
        <span className="truncate font-extrabold text-white">{arrivalLine(saver)}</span>
        <span className="text-white/70">{now ? 'playing now' : 'playing next'}</span>
      </span>
    </>
  )
  // The whole toast plays it now (the board's toast has no separate button).
  return (
    <div
      role="status"
      className={cn(
        'rounded-[18px] bg-[#1a1814]/90 shadow-nx-toast backdrop-blur-md animate-nx-slide-in',
        className,
      )}
      style={{ boxShadow: `0 0 0 1px ${hue}73, 0 16px 40px rgba(0,0,0,0.5)` }}
    >
      {onPlay ? (
        <button
          type="button"
          onClick={onPlay}
          aria-label={`Play it now: ${arrivalLine(saver)}`}
          className="flex w-full items-center gap-3 rounded-[18px] p-2.5 pr-4 hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ outlineColor: hue }}
        >
          {body}
        </button>
      ) : (
        <div className="flex items-center gap-3 p-2.5 pr-4">{body}</div>
      )}
    </div>
  )
}
