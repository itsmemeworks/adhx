'use client'

import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SwitchLook } from '../primitives'

/**
 * Nested corners. A card's buttons and fields curve at `--nx-nest`, which the
 * card sets to its own radius minus its padding and border; anywhere without
 * one (a page, the invite screen) they stay pills.
 */
const NESTED = 'rounded-[var(--nx-nest,9999px)]'

/**
 * Settings card: 28 px corners, a 1 px border and 16 px padding (24 px from md),
 * so what lines its inside edge curves at 28 − 16 − 1 = 11 px, then 8 px (the
 * floor) from md. Tiles and rows in it use this; it sets 8 px for what they hold.
 */
export const IN_CARD = 'rounded-[11px] [--nx-nest:8px] md:rounded-[8px]'

/** Yellow, the one thing to do on a card. */
export const PRIMARY = `inline-flex h-12 items-center justify-center gap-2 ${NESTED} bg-nx-accent px-5 text-[15px] font-extrabold text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50`

/** Quiet outline, everything else. */
export const SECONDARY = `inline-flex min-h-[44px] items-center justify-center gap-2 whitespace-nowrap ${NESTED} border-[1.5px] border-nx-line px-4 text-sm font-semibold text-nx-cream transition-colors hover:border-nx-ink-faint hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50`

/** Red outline for the danger zone. */
export const DANGER = `inline-flex min-h-[44px] items-center justify-center gap-2 whitespace-nowrap ${NESTED} border border-nx-danger/60 px-4 text-sm font-bold text-nx-danger transition-colors hover:bg-nx-danger/10 disabled:cursor-not-allowed disabled:opacity-50`

export const INPUT = `h-12 w-full min-w-0 ${NESTED} border-[1.5px] border-nx-line bg-nx-bg px-[18px] text-base font-semibold text-nx-cream outline-none placeholder:font-normal placeholder:text-nx-ink-faint focus:border-nx-accent`

/** A rounded card on nx-surface with a serif heading. */
export function SettingsCard({
  id,
  title,
  sub,
  note,
  right,
  tone = 'plain',
  className,
  children,
}: {
  id?: string
  title: string
  sub?: string
  /** Small words beside the title ("4 on this server"). */
  note?: string
  right?: ReactNode
  /** `accent` rings the card in yellow; `danger` in red. */
  tone?: 'plain' | 'accent' | 'danger'
  className?: string
  children?: ReactNode
}) {
  const headingId = id ? `${id}-title` : undefined
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn(
        'flex scroll-mt-24 flex-col gap-[18px] rounded-[28px] border border-white/[0.08] bg-nx-surface p-4 [--nx-nest:11px] md:p-6 md:[--nx-nest:8px]',
        tone === 'accent' && 'border-nx-accent/45',
        tone === 'danger' && 'border-nx-danger/35',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2
              id={headingId}
              className={cn(
                'm-0 font-nx-serif text-[30px] font-normal leading-[0.95] md:text-[38px]',
                tone === 'danger' && 'text-nx-danger',
              )}
            >
              {title}
            </h2>
            {note && <span className="whitespace-nowrap text-sm text-nx-ink-faint">{note}</span>}
          </div>
          {sub && <p className="m-0 text-sm text-nx-ink/60">{sub}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  )
}

/** A row inside a card: label and hint on the left, a control on the right. */
export function SettingRow({
  label,
  hint,
  children,
}: {
  label: ReactNode
  hint?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className={cn('flex items-center gap-3 bg-black/40 px-4 py-3.5', IN_CARD)}>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="text-[15px] font-bold text-nx-ink">{label}</div>
        {hint && <div className="text-[13px] leading-snug text-nx-ink/55">{hint}</div>}
      </div>
      {children}
    </div>
  )
}

export function Switch({
  label,
  checked,
  onChange,
  disabled,
  busy,
}: {
  label: string
  checked: boolean
  onChange: () => void
  disabled?: boolean
  busy?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      aria-busy={busy || undefined}
      disabled={disabled}
      onClick={onChange}
      // The 28 tall look keeps a 44 hit area without moving the row.
      className="group -my-2 inline-flex shrink-0 py-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
    >
      <SwitchLook
        on={checked}
        className="group-focus-visible:ring-2 group-focus-visible:ring-nx-accent group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-nx-surface"
      />
    </button>
  )
}

/** Bottom sheet on phones, centred card on wider screens. */
export function Sheet({
  label,
  onClose,
  tone = 'plain',
  children,
}: {
  label: string
  onClose: () => void
  tone?: 'plain' | 'danger'
  children: ReactNode
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <>
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className="fixed inset-0 z-40 cursor-default bg-black/60"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={cn(
          // 28 px corners, 20 px padding (28 from md): buttons sit at the 8 px floor.
          'fixed inset-x-0 bottom-0 z-50 flex max-h-[90dvh] flex-col gap-4 overflow-y-auto rounded-t-[28px] bg-nx-sheet p-5 [--nx-nest:8px] pb-[max(20px,env(safe-area-inset-bottom))] font-nx-sans text-nx-ink md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:w-[460px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[28px] md:p-7',
          tone === 'danger' && 'ring-1 ring-nx-danger/40',
        )}
      >
        <div className="flex items-start gap-3">
          <h3
            className={cn(
              'm-0 flex-1 font-nx-serif text-[30px] font-normal leading-none',
              tone === 'danger' && 'text-nx-danger',
            )}
          >
            {label}
          </h3>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10"
          >
            <X aria-hidden className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </>
  )
}

/** "3h ago", "Just now". */
export function timeSince(dateStr: string): string {
  const diffMins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays > 0) return `${diffDays}d ago`
  if (diffHours > 0) return `${diffHours}h ago`
  if (diffMins > 0) return `${diffMins}m ago`
  return 'just now'
}

/** "42m 10s", "1h 5m", "9s". */
export function formatWait(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}
