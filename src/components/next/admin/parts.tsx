'use client'

import Link from 'next/link'
import { useState, type CSSProperties, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { NxAvatar } from '../primitives'
import { GobShape } from '../GobShape'

/**
 * The admin area's pieces, drawn as the "10 · Admin" boards draw them:
 * warm-black cards, uppercase labels, serif figures, yellow for what needs
 * you. Translation-safe: every run of text sits in its own element.
 */

export const CARD = 'rounded-[22px] border border-white/[0.06] bg-nx-surface'
export const LABEL = 'text-xs font-extrabold uppercase tracking-[0.08em] text-nx-ink-faint'
export const TH =
  'h-10 whitespace-nowrap px-2.5 text-left text-xs font-extrabold uppercase tracking-[0.06em] text-nx-ink-faint'
export const TD = 'h-[52px] whitespace-nowrap border-t border-white/[0.06] px-2.5 text-sm'

export const BTN =
  'inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-full border border-white/[0.18] bg-transparent px-4 text-sm font-extrabold text-nx-ink transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50'
export const BTN_SM =
  'inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-white/[0.18] bg-transparent px-4 text-[13px] font-extrabold text-nx-ink transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50'
export const PRIMARY_BTN =
  'inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-nx-accent px-5 text-sm font-extrabold text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50'
export const PRIMARY_SM =
  'inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-nx-accent px-[18px] text-[13px] font-extrabold text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50'
export const FIELD =
  'flex h-11 items-center gap-2.5 rounded-full bg-nx-plate px-4 focus-within:ring-2 focus-within:ring-nx-accent/60'
export const FIELD_INPUT =
  'min-w-0 flex-1 border-0 bg-transparent text-base text-nx-ink outline-none placeholder:text-nx-ink-faint sm:text-sm'

export interface FaceData {
  username: string
  name: string | null
  avatarUrl: string | null
}

/** A member's face in Gob's shape. */
export function Face({
  who,
  size = 28,
  ring,
  className,
  style,
}: {
  who: FaceData
  size?: number
  ring?: string
  className?: string
  style?: CSSProperties
}) {
  return (
    <NxAvatar
      author={{ handle: who.username, name: who.name ?? who.username, avatarUrl: who.avatarUrl }}
      size={size}
      className={className}
      style={ring ? { boxShadow: `0 0 0 2px ${ring}`, ...style } : style}
    />
  )
}

/** Overlapping faces, ringed in the card colour. */
export function FaceStack({ faces, size = 24 }: { faces: FaceData[]; size?: number }) {
  if (!faces.length) return null
  return (
    <span className="inline-flex shrink-0" aria-hidden>
      {faces.map((f, i) => (
        <Face
          key={f.username}
          who={f}
          size={size}
          ring="#1a1814"
          style={i ? { marginLeft: -Math.round(size * 0.3) } : undefined}
        />
      ))}
    </span>
  )
}

/** A dashed Gob outline: someone not in yet. */
export function WaitingFace({ size = 40 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="block shrink-0 -rotate-[4deg] rounded-[38%] border-2 border-dashed border-nx-accent"
      style={{ width: size, height: size }}
    />
  )
}

export function Card({
  className,
  children,
  accent,
  as: Tag = 'div',
  labelledBy,
}: {
  className?: string
  children: ReactNode
  accent?: boolean
  as?: 'div' | 'section'
  labelledBy?: string
}) {
  return (
    <Tag
      aria-labelledby={labelledBy}
      className={cn(CARD, accent && 'border-nx-accent/40', 'min-w-0', className)}
    >
      {children}
    </Tag>
  )
}

/** A card's heading row: "Most saved this week", with small words at the right. */
export function CardHead({ title, note, id }: { title: string; note?: ReactNode; id?: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <h3 id={id} className="m-0 text-base font-extrabold">
        {title}
      </h3>
      {note !== undefined && note !== null && note !== '' && (
        <span className="ml-auto whitespace-nowrap text-[13px] text-nx-ink-faint">{note}</span>
      )}
    </div>
  )
}

export function Kpi({
  label,
  value,
  foot,
  accent,
  footAccent,
}: {
  label: string
  value: ReactNode
  foot?: ReactNode
  accent?: boolean
  footAccent?: boolean
}) {
  return (
    <div className={cn(CARD, 'flex min-w-0 flex-col gap-1 px-4 py-3.5')}>
      <span className={LABEL}>{label}</span>
      <span
        className={cn(
          'font-nx-serif text-[40px] leading-none',
          accent ? 'text-nx-accent' : 'text-nx-ink',
        )}
      >
        {value}
      </span>
      <span
        className={cn('truncate text-[13px]', footAccent ? 'text-nx-accent' : 'text-nx-ink-faint')}
      >
        {foot ?? '\u00a0'}
      </span>
    </div>
  )
}

/** Six KPIs across on wide screens; two (then three) on narrow ones. */
export function KpiRow({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">{children}</div>
}

export function PageTitle({
  title,
  sub,
  right,
}: {
  title: string
  sub: string
  right?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-end md:gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <h2 className="m-0 font-nx-serif text-[34px] font-normal leading-none md:text-[40px]">
          {title}
        </h2>
        <p className="m-0 text-sm text-nx-ink-faint">{sub}</p>
      </div>
      {right && <div className="md:ml-auto">{right}</div>}
    </div>
  )
}

export type RangeId = 'today' | 'week' | 'month' | 'all'

const RANGES: { id: RangeId; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'all', label: 'All time' },
]

/** Today · Week · Month · All time, as links (`?range=`). */
export function RangeSwitch({ path, active }: { path: string; active: RangeId }) {
  return (
    <div
      role="group"
      aria-label="Time range"
      className="flex w-max max-w-full gap-0.5 overflow-x-auto rounded-full bg-nx-surface p-1"
    >
      {RANGES.map((r) => (
        <Link
          key={r.id}
          href={`${path}?range=${r.id}`}
          scroll={false}
          aria-current={r.id === active ? 'true' : undefined}
          className={cn(
            'flex h-9 items-center whitespace-nowrap rounded-full px-3.5 text-sm',
            r.id === active
              ? 'bg-nx-ink font-extrabold text-black'
              : 'font-semibold text-nx-ink-soft hover:text-nx-ink',
          )}
        >
          <span>{r.label}</span>
        </Link>
      ))}
    </div>
  )
}

/**
 * Bars, oldest first. `highlightFrom` lights the bars from that index on
 * (the rest are dim), `second` stacks a lilac part at the bottom (Just for me).
 */
export function Bars({
  values,
  height = 120,
  highlightFrom,
  second,
  colour = '#ffd23f',
  label,
}: {
  values: number[]
  height?: number
  highlightFrom?: number
  second?: number[]
  colour?: string
  label?: string
}) {
  const totals = values.map((v, i) => v + (second?.[i] ?? 0))
  const max = Math.max(1, ...totals)
  return (
    <div
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className="flex items-stretch gap-[3px]"
      style={{ height }}
    >
      {values.map((v, i) => {
        const total = totals[i]
        const h = Math.max(3, Math.round((total / max) * height))
        const h2 = second ? Math.round(((second[i] ?? 0) / max) * height) : 0
        const lit = highlightFrom === undefined || i >= highlightFrom
        return (
          <span key={i} className="flex flex-1 flex-col justify-end">
            <span
              className="block"
              style={{
                height: Math.max(h - h2, total ? 0 : 3),
                borderRadius: h2 ? '4px 4px 0 0' : 4,
                background: lit ? colour : 'rgb(var(--nx-line))',
              }}
            />
            {h2 > 0 && (
              <span
                className="block"
                style={{ height: h2, borderRadius: '0 0 4px 4px', background: '#c4a7ff' }}
              />
            )}
          </span>
        )
      })}
    </div>
  )
}

/** One labelled horizontal bar: "YouTube ▬▬▬ 162". */
export function MeterRow({
  label,
  value,
  pct,
  colour,
  labelWidth = 92,
  valueText,
  height = 10,
}: {
  label: ReactNode
  value: number
  pct: number
  colour: string
  labelWidth?: number
  valueText?: string
  height?: number
}) {
  return (
    <li
      className="grid items-center gap-2.5 text-[13px]"
      style={{ gridTemplateColumns: `${labelWidth}px minmax(0,1fr) 44px` }}
    >
      <span className="truncate text-nx-ink-soft">{label}</span>
      <span aria-hidden className="overflow-hidden rounded-full bg-nx-plate" style={{ height }}>
        <span
          className="block rounded-full"
          style={{
            width: `${value > 0 ? Math.max(1, Math.min(100, pct)) : 0}%`,
            height,
            background: colour,
          }}
        />
      </span>
      <span className="text-right font-extrabold">
        {valueText ?? value.toLocaleString('en-GB')}
      </span>
    </li>
  )
}

export function Chip({
  children,
  tone = 'plain',
}: {
  children: ReactNode
  tone?: 'plain' | 'accent' | 'warn' | 'admin'
}) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center whitespace-nowrap rounded-full px-2.5 text-xs font-extrabold',
        tone === 'plain' && 'bg-nx-plate text-nx-ink-soft',
        tone === 'accent' && 'bg-nx-accent text-black',
        tone === 'warn' && 'bg-nx-plate text-nx-warn',
        tone === 'admin' && 'bg-nx-accent/[0.14] text-nx-accent',
      )}
    >
      {children}
    </span>
  )
}

export function Dot({ colour, size = 8 }: { colour: string; size?: number }) {
  return (
    <span
      aria-hidden
      className="block shrink-0 rounded-full"
      style={{ width: size, height: size, background: colour }}
    />
  )
}

/** A post's picture, or a quiet tile when it has none (or it doesn't load). */
export function Thumb({
  src,
  size = 44,
  radius = 12,
}: {
  src: string | null
  size?: number
  radius?: number
}) {
  const [broken, setBroken] = useState(false)
  return src && !broken ? (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
      className="shrink-0 bg-nx-plate object-cover"
      style={{ width: size, height: size, borderRadius: radius }}
    />
  ) : (
    <span
      aria-hidden
      className="block shrink-0 bg-nx-plate"
      style={{ width: size, height: size, borderRadius: radius }}
    />
  )
}

/** The Gob face used as an empty state. */
export function GobMark({ size = 56 }: { size?: number }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 40 40">
      <g transform="rotate(-4 20 20)">
        <rect x="3" y="3" width="34" height="34" rx="14" fill="#262320" />
        <circle cx="14" cy="17" r="2.6" fill="#ffd23f" />
        <circle cx="26.5" cy="16" r="4" fill="#ffd23f" />
        <path
          d="M15 27.5 q5 2.6 10 -1.2"
          stroke="#ffd23f"
          strokeWidth="2.2"
          fill="none"
          strokeLinecap="round"
        />
      </g>
    </svg>
  )
}

/** A table that scrolls sideways inside its card on narrow screens. */
export function TableBox({ children }: { children: ReactNode }) {
  return <div className="relative w-full overflow-x-auto">{children}</div>
}

export { GobShape }

// ——— Words ———

export function fmt(n: number): string {
  return n.toLocaleString('en-GB')
}

export function bytesLabel(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '0 GB'
  const tb = bytes / 1024 ** 4
  if (tb >= 1) return `${tb >= 10 ? tb.toFixed(1) : tb.toFixed(2)} TB`
  const gb = bytes / 1024 ** 3
  if (gb >= 0.1) return `${gb.toFixed(1)} GB`
  const mb = bytes / 1024 ** 2
  return `${Math.max(1, Math.round(mb))} MB`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** "12 Aug" (a `YYYY-MM-DD` day or an ISO time). */
export function shortDate(value: string | null | undefined): string {
  if (!value) return '—'
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}

/** "Saturday 11 Oct". */
export function dayName(day: string): string {
  const d = new Date(`${day}T12:00:00`)
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`
}

/** "Now", "6 min ago", "1 hour ago", "Yesterday", "2 days ago", "12 Aug". */
export function seenLabel(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'Never'
  const mins = Math.floor((now - Date.parse(iso)) / 60_000)
  if (!Number.isFinite(mins)) return '—'
  if (mins < 5) return 'Now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return shortDate(iso)
}

/** "2 min ago", "Yesterday", "3 Oct" for things that happened. */
export function agoShort(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return ''
  const mins = Math.floor((now - Date.parse(iso)) / 60_000)
  if (!Number.isFinite(mins)) return ''
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Yesterday'
  return shortDate(iso)
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${fmt(n)} ${n === 1 ? one : many}`
}

/** "Pete", "Pete and Ana", "Pete, Ana and Jo". */
export function names(list: string[]): string {
  if (list.length <= 1) return list[0] ?? ''
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`
}

export function displayName(f: FaceData): string {
  return f.name || f.username
}
