'use client'

/**
 * Shift+? overlay — the theater's only shortcut cheatsheet. Dark stage
 * panel (same palette as SignInModal). Every text run is wrapped so
 * browser translation cannot crash React (docs/specs/translation-safety.md).
 */

import { useEffect } from 'react'
import { X } from 'lucide-react'
import {
  THEATER_SHORTCUT_HELP,
  THEATER_SHORTCUT_KEYS,
  type TheaterHelpRow,
  type TheaterHelpSection,
} from './theater-shortcuts'

const PANEL = '#201b16'
const BORDER = '#322b23'
const INK = '#f3ece0'
const MUTED = '#857a69'
const SUBTLE = '#b8ac99'

function Key({ children }: { children: string }) {
  return (
    <kbd
      className="inline-flex min-w-[22px] items-center justify-center rounded-md border px-1.5 py-0.5 font-mono text-[11px] font-medium"
      style={{ backgroundColor: '#2a241d', borderColor: BORDER, color: INK }}
    >
      {children}
    </kbd>
  )
}

function Row({ keys, label }: TheaterHelpRow) {
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <span className="text-[13px]" style={{ color: SUBTLE }}>
        {label}
      </span>
      <span className="flex flex-none items-center gap-1">
        {keys.map((k) => (
          <Key key={k}>{k}</Key>
        ))}
      </span>
    </div>
  )
}

function HelpSection({ title, rows, area }: TheaterHelpSection & { area: string }) {
  return (
    <section style={{ gridArea: area }}>
      <p
        className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em]"
        style={{ color: MUTED }}
      >
        <span>{title}</span>
      </p>
      {rows.map((row) => (
        <Row key={`${title}-${row.label}-${row.keys.join('')}`} {...row} />
      ))}
    </section>
  )
}

const HELP_AREAS: Record<string, string> = {
  Navigate: 'nav',
  Playback: 'play',
  Actions: 'actions',
  Also: 'also',
}

export function TheaterShortcutsHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return
    function handleKeyDownCapture(e: KeyboardEvent) {
      if (e.key === 'Escape' || e.key === '?' || (e.key === '/' && e.shiftKey)) {
        e.stopPropagation()
        e.preventDefault()
        onClose()
        return
      }
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return
      if (THEATER_SHORTCUT_KEYS.has(e.key)) {
        e.stopPropagation()
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', handleKeyDownCapture, true)
    return () => window.removeEventListener('keydown', handleKeyDownCapture, true)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="absolute inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/65" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="theater-shortcuts-title"
        className="relative w-full max-w-sm overflow-hidden rounded-2xl border shadow-2xl lg:max-w-2xl"
        style={{ backgroundColor: PANEL, borderColor: BORDER }}
      >
        <div
          className="flex items-center justify-between border-b px-4 py-3"
          style={{ borderColor: BORDER }}
        >
          <h2
            id="theater-shortcuts-title"
            className="text-[15px] font-semibold"
            style={{ color: INK }}
          >
            <span>Keyboard shortcuts</span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-white/[.06]"
            style={{ color: MUTED }}
          >
            <X size={16} />
          </button>
        </div>
        <div className="grid max-h-[70vh] grid-cols-1 gap-4 overflow-y-auto px-4 py-3 [grid-template-areas:'nav'_'play'_'actions'_'also'] lg:grid-cols-2 lg:gap-x-10 lg:[grid-template-areas:'nav_actions'_'play_actions'_'also_actions']">
          {THEATER_SHORTCUT_HELP.map((section) => (
            <HelpSection
              key={section.title}
              area={HELP_AREAS[section.title] ?? section.title.toLowerCase()}
              {...section}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
