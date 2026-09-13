'use client'

/** Single-choice post types and watch filtering, shared by the desktop and mobile Queue. */

import { cn } from '@/lib/utils'
import { inferType } from '@/lib/trending/filter'
import type { TheaterItem } from './types'
import type { ContentType } from '@/components/matter'
import { useEffect, useRef, type KeyboardEvent } from 'react'
import { TheaterWatchFilter, type TheaterWatchFilterProps } from './TheaterWatchFilter'
import { THEATER_SHORTCUT_KEYS } from './theater-shortcuts'
import {
  theaterQueueTypePillState,
  theaterQueueTypePillToggleTargets,
  THEATER_QUEUE_TYPE_PILLS,
} from './theater-math'

const PILL =
  'inline-flex min-h-11 lg:min-h-8 items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold transition-colors duration-150'

export function TheaterQueueFilter({
  selected,
  onToggle,
  onClear,
  autoFocus = false,
  onCommit,
  onCancel,
  keyboardShortcutFlow = false,
  watchFilter,
  countItems,
}: {
  selected: readonly ContentType[]
  onToggle: (type: ContentType) => void
  onClear: () => void
  autoFocus?: boolean
  onCommit?: () => void
  onCancel?: () => void
  keyboardShortcutFlow?: boolean
  watchFilter?: TheaterWatchFilterProps
  countItems?: readonly TheaterItem[]
}) {
  const counts = new Map<ContentType, number>()
  for (const item of countItems ?? []) {
    const type = inferType(item)
    counts.set(type, (counts.get(type) ?? 0) + 1)
  }
  const allOn = selected.length === 0
  const rootRef = useRef<HTMLDivElement>(null)
  const didAutoFocusRef = useRef(false)
  useEffect(() => {
    if (!autoFocus) {
      didAutoFocusRef.current = false
      return
    }
    if (didAutoFocusRef.current) return
    didAutoFocusRef.current = true
    const activeIndex = allOn
      ? 0
      : Math.max(
          1,
          THEATER_QUEUE_TYPE_PILLS.findIndex(
            (pill) => theaterQueueTypePillState(selected, pill.types) !== false,
          ) + 1,
        )
    rootRef.current
      ?.querySelectorAll<HTMLButtonElement>('button')
      [activeIndex]?.focus({ preventScroll: true })
  }, [allOn, autoFocus, selected])

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!keyboardShortcutFlow) return
    const buttons = Array.from(rootRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])
    const currentIndex = buttons.findIndex((button) => button === document.activeElement)
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onCancel?.()
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      event.stopPropagation()
      if (document.activeElement instanceof HTMLButtonElement) {
        document.activeElement.click()
      }
      onCommit?.()
      return
    }
    if (event.key === ' ') {
      event.preventDefault()
      event.stopPropagation()
      if (document.activeElement instanceof HTMLButtonElement) {
        document.activeElement.click()
      }
      return
    }
    const direction =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0
    if (direction === 0) {
      const overlayShortcut =
        event.key === 'q' ||
        event.key === 'Q' ||
        event.key === '.' ||
        event.key === '?' ||
        (event.key === '/' && event.shiftKey)
      if (!overlayShortcut && THEATER_SHORTCUT_KEYS.has(event.key)) {
        event.preventDefault()
        event.stopPropagation()
      }
      return
    }
    event.preventDefault()
    event.stopPropagation()
    buttons[(currentIndex + direction + buttons.length) % buttons.length]?.focus({
      preventScroll: true,
    })
    return
  }

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label={countItems ? 'Quick post filters' : 'Playlist filter'}
      data-theater-queue-filter=""
      data-theater-filter-shortcut-flow={keyboardShortcutFlow ? '' : undefined}
      className="flex flex-none flex-wrap items-center gap-1.5 px-4 pb-2"
      onKeyDown={handleKeyDown}
    >
      {watchFilter && (
        <span className="w-full text-[10px] font-semibold uppercase tracking-wide text-ink-3">
          Post type
        </span>
      )}
      <button
        type="button"
        aria-label="All post types"
        aria-pressed={allOn}
        aria-description={countItems ? `${countItems.length} posts` : undefined}
        onClick={() => {
          if (!allOn) onClear()
        }}
        className={cn(
          PILL,
          allOn ? 'bg-clay-grad text-white shadow-glow' : 'bg-inset text-ink-2 hover:text-ink',
        )}
      >
        All
        {countItems && <span className="tabular-nums opacity-70">{countItems.length}</span>}
      </button>
      {THEATER_QUEUE_TYPE_PILLS.map((pill) => {
        const pressed = theaterQueueTypePillState(selected, pill.types)
        const active = pressed !== false
        return (
          <button
            key={pill.label}
            type="button"
            aria-pressed={pressed}
            aria-label={pill.label}
            aria-description={
              countItems
                ? `${pill.types.reduce((sum, type) => sum + (counts.get(type) ?? 0), 0)} posts`
                : undefined
            }
            onClick={() => {
              for (const type of theaterQueueTypePillToggleTargets(selected, pill.types)) {
                onToggle(type)
              }
            }}
            className={cn(
              PILL,
              active ? 'bg-clay-grad text-white shadow-glow' : 'bg-inset text-ink-2 hover:text-ink',
            )}
          >
            {pill.label}
            {countItems && (
              <span className="tabular-nums opacity-70">
                {pill.types.reduce((sum, type) => sum + (counts.get(type) ?? 0), 0)}
              </span>
            )}
          </button>
        )
      })}
      {watchFilter && <TheaterWatchFilter {...watchFilter} />}
    </div>
  )
}
