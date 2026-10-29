'use client'

import { Check } from 'lucide-react'
import type { FeedItem } from '@/components/feed/types'
import type { Saver } from '@/lib/people/types'
import { cn } from '@/lib/utils'
import { postCoverSrc } from '../post'
import { Faces } from '../moments/LiveTogether'
import type { PeopleFace, PostKeepStatus } from './useKeepStatus'

/**
 * "Getting it ready" (board j1-4): the stage while the post on it is still
 * being kept. A blurred, shimmering poster; a ring with the real percent; the
 * words; and a small checklist of the first three steps on `/doing`. Shimmer
 * and spin are `animate-nx-*`, so reduced motion keeps them still.
 */

/** The first three of `/doing`'s steps (`DOING_STEPS` in `lib/processing/doing.ts`). */
export const READY_STEPS = ['Got the link', 'Keeping a copy', 'Making it play everywhere'] as const

const RING_R = 48
const RING_C = 2 * Math.PI * RING_R

export function GettingReadyStage({
  post,
  status,
  wide,
}: {
  post: FeedItem
  status: Pick<PostKeepStatus, 'state' | 'step' | 'percent'>
  wide: boolean
}) {
  const cover = postCoverSrc(post)
  const percent = status.state === 'keeping' && status.percent !== null ? status.percent : null
  const step = status.step ?? 2
  const label = status.state === 'converting' ? 'Making it play everywhere' : 'Keeping a copy'
  return (
    <div
      data-testid="getting-ready"
      className="absolute inset-0 z-[5] overflow-hidden bg-nx-surface font-nx-sans text-nx-cream"
    >
      {cover && (
        // The poster, blurred while the copy arrives.
        <img
          src={cover}
          alt=""
          aria-hidden
          referrerPolicy="no-referrer"
          className="absolute -inset-[30px] h-[calc(100%+60px)] w-[calc(100%+60px)] max-w-none object-cover [filter:blur(18px)_brightness(0.42)_saturate(1.1)]"
        />
      )}
      <div
        aria-hidden
        className="animate-nx-sheen absolute inset-0 bg-[linear-gradient(105deg,rgba(255,255,255,0)_28%,rgba(255,255,255,0.11)_44%,rgba(255,255,255,0.03)_54%,rgba(255,255,255,0)_68%)] bg-[length:250%_100%] bg-[position:30%_0]"
      />
      <div
        role="status"
        aria-live="polite"
        className={cn(
          'absolute inset-x-0 flex flex-col items-center gap-[18px] text-center',
          wide
            ? 'top-[max(40px,calc(50%_-_222px))] px-9'
            : // Phones: clear of the rail on the right.
              'top-1/2 -translate-y-1/2 pl-6 pr-[80px]',
        )}
      >
        <div
          role="progressbar"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={100}
          {...(percent !== null ? { 'aria-valuenow': percent } : {})}
          className="relative h-28 w-28"
        >
          <svg
            aria-hidden
            width="112"
            height="112"
            viewBox="0 0 112 112"
            className={cn(
              '-rotate-90',
              percent === null && 'animate-nx-spin [animation-duration:1.6s]',
            )}
          >
            <circle
              cx="56"
              cy="56"
              r={RING_R}
              fill="rgba(0,0,0,0.35)"
              stroke="rgba(255,255,255,0.16)"
              strokeWidth="6"
            />
            <circle
              cx="56"
              cy="56"
              r={RING_R}
              fill="none"
              stroke="#ffd23f"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={`${percent === null ? RING_C * 0.25 : (RING_C * percent) / 100} ${RING_C}`}
              className="transition-[stroke-dasharray] duration-500 motion-reduce:transition-none"
            />
          </svg>
          {percent !== null && (
            <span className="absolute inset-0 flex items-center justify-center text-2xl font-extrabold tabular-nums">
              {`${percent}%`}
            </span>
          )}
        </div>
        <h3 className="m-0 font-nx-serif text-[44px] font-normal leading-[0.95]">
          Getting it ready…
        </h3>
        <p className="m-0 text-[15px] leading-[1.45]">
          Your ADHX is keeping a copy. It’ll be here in a moment.
        </p>
        <ul
          aria-label="Steps"
          className="m-0 mt-1.5 flex list-none flex-col gap-2.5 self-stretch rounded-[18px] bg-black/45 px-4 py-3.5 text-left backdrop-blur-md [@media(max-height:700px)]:hidden"
        >
          {READY_STEPS.map((words, i) => {
            const n = i + 1
            const done = n < step
            const now = n === step
            return (
              <li
                key={words}
                aria-current={now ? 'step' : undefined}
                className={cn(
                  'flex items-center gap-2.5 text-[13px]',
                  now && 'font-semibold',
                  !done && !now && 'text-nx-ink-soft',
                )}
              >
                {done ? (
                  <Check aria-hidden className="h-4 w-4 shrink-0 text-nx-accent" strokeWidth={3} />
                ) : now ? (
                  <svg
                    aria-hidden
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    className="shrink-0 animate-nx-spin [animation-duration:1.2s]"
                  >
                    <circle cx="12" cy="12" r="9" stroke="rgba(255,255,255,0.2)" />
                    <path d="M12 3a9 9 0 019 9" className="stroke-nx-ink" />
                  </svg>
                ) : (
                  <svg
                    aria-hidden
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    strokeWidth="2"
                    className="shrink-0 stroke-nx-ink-faint"
                  >
                    <circle cx="12" cy="12" r="8" />
                  </svg>
                )}
                <span>{words}</span>
                <span className="sr-only">{done ? ', done' : now ? ', now' : ', next'}</span>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

/** Faces drawn as savers (the face helpers take a `Saver`). */
function asSavers(people: readonly PeopleFace[]): Saver[] {
  return people.map((p) => ({ ...p, savedAt: '', isYou: false }))
}

/** "Shared with your people", with their faces (j1-4), while a save of yours gets ready. */
export function SharedWithChip({
  people,
  className,
}: {
  people: readonly PeopleFace[]
  className?: string
}) {
  return (
    <span
      role="note"
      className={cn(
        'nx-plate pointer-events-auto flex h-10 min-w-0 items-center gap-2.5 rounded-full py-2 pl-2 pr-3.5 text-[13px] font-semibold',
        className,
      )}
    >
      {people.length > 0 && <Faces people={asSavers(people)} size={24} max={4} ring="#141414" />}
      <span className="truncate">Shared with your people</span>
    </span>
  )
}

/** "Kept on your ADHX" (j1-5), on a post whose copy just arrived. */
export function KeptChip({ className }: { className?: string }) {
  return (
    <span
      role="note"
      className={cn(
        'nx-plate pointer-events-auto flex h-9 items-center gap-1.5 rounded-full pl-3 pr-3.5 text-[13px] font-bold',
        className,
      )}
    >
      <Check aria-hidden className="h-3.5 w-3.5 text-nx-accent" strokeWidth={3} />
      <span>Kept on your ADHX</span>
    </span>
  )
}
