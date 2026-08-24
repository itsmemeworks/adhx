/**
 * Single theater keymap. Library / settings do not bind keys — desktop
 * power users drive the stage from here (nav, playback, every action
 * button, menu, Shift+? help). Paste is the OS shortcut (⌘V / Ctrl+V);
 * the chrome already listens for the `paste` event.
 */

export type TheaterHotkeySurface = 'desktop' | 'mobile' | 'any'

export type TheaterShortcut =
  | 'next'
  | 'prev'
  | 'togglePlay'
  | 'toggleMute'
  | 'save'
  | 'tag'
  | 'copyLink'
  | 'copyText'
  | 'sendFile'
  | 'open'
  | 'archive'
  | 'undo'
  | 'close'
  | 'toggleMenu'
  | 'toggleHelp'
  | 'toggleArticle'

export const THEATER_ACTION_EVENTS = {
  save: 'theater-save',
  tag: 'theater-tag',
  copyLink: 'theater-copy-link',
  copyText: 'theater-copy-text',
  sendFile: 'theater-send-file',
  open: 'theater-open',
  archive: 'theater-archive',
  toggleMenu: 'theater-toggle-menu',
  toggleArticle: 'theater-toggle-article',
} as const

export type TheaterActionName = keyof typeof THEATER_ACTION_EVENTS

/** data-theater-action value for the matching control in the visible chrome. */
export const THEATER_ACTION_ATTR: Record<TheaterActionName, string> = {
  save: 'save',
  tag: 'tag',
  copyLink: 'link',
  copyText: 'copy',
  sendFile: 'download',
  open: 'open',
  archive: 'archive',
  toggleMenu: 'menu',
  toggleArticle: 'read',
}

export interface TheaterKeyLike {
  key: string
  metaKey?: boolean
  ctrlKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
  target?: EventTarget | null
}

export function isTheaterTypingTarget(target: EventTarget | null | undefined): boolean {
  if (!target || typeof HTMLElement === 'undefined') return false
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'
}

/**
 * Keys the window-level theater handler acts on. Overlays (sign-in, tag
 * picker, avatar menu, help) stop these from reaching the stage.
 */
export const THEATER_SHORTCUT_KEYS = new Set([
  ' ',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'j',
  'J',
  'k',
  'K',
  'm',
  'M',
  's',
  'S',
  't',
  'T',
  'l',
  'L',
  'c',
  'C',
  'd',
  'D',
  'o',
  'O',
  'a',
  'A',
  'r',
  'R',
  'u',
  'U',
  '.',
  '?',
  '/',
  'Escape',
])

export function resolveTheaterShortcut(e: TheaterKeyLike): TheaterShortcut | null {
  if (e.metaKey || e.ctrlKey || e.altKey) return null
  if (isTheaterTypingTarget(e.target)) return null

  switch (e.key) {
    case 'ArrowDown':
    case 'ArrowRight':
    case 'j':
    case 'J':
      return 'next'
    case 'ArrowUp':
    case 'ArrowLeft':
    case 'k':
    case 'K':
      return 'prev'
    case ' ':
      return 'togglePlay'
    case 'm':
    case 'M':
      return 'toggleMute'
    case 's':
    case 'S':
      return 'save'
    case 't':
    case 'T':
      return 'tag'
    case 'l':
    case 'L':
      return 'copyLink'
    case 'c':
    case 'C':
      return 'copyText'
    case 'd':
    case 'D':
      return 'sendFile'
    case 'o':
    case 'O':
      return 'open'
    case 'a':
    case 'A':
      return 'archive'
    case 'r':
    case 'R':
      return 'toggleArticle'
    case 'u':
    case 'U':
      return 'undo'
    case '.':
      return 'toggleMenu'
    case '?':
      return 'toggleHelp'
    case '/':
      return e.shiftKey ? 'toggleHelp' : null
    case 'Escape':
      return 'close'
    default:
      return null
  }
}

/** Tailwind `lg` — same breakpoint as the desktop/mobile chrome split. */
export function isTheaterHotkeySurface(surface: TheaterHotkeySurface): boolean {
  if (surface === 'any') return true
  if (typeof window === 'undefined') return false
  const desktop = window.matchMedia('(min-width: 1024px)').matches
  return surface === 'desktop' ? desktop : !desktop
}

export type TheaterHelpRow = { keys: string[]; label: string }

export type TheaterHelpSection = { title: string; rows: TheaterHelpRow[] }

export const THEATER_SHORTCUT_HELP: TheaterHelpSection[] = [
  {
    title: 'Navigate',
    rows: [
      { keys: ['←', '→'], label: 'Previous / next post' },
      { keys: ['↑', '↓'], label: 'Previous / next post' },
      { keys: ['J', 'K'], label: 'Next / previous post' },
    ],
  },
  {
    title: 'Playback',
    rows: [
      { keys: ['Space'], label: 'Play / pause' },
      { keys: ['M'], label: 'Mute / unmute' },
    ],
  },
  {
    title: 'Actions',
    rows: [
      { keys: ['S'], label: 'Save' },
      { keys: ['T'], label: 'Tag' },
      { keys: ['L'], label: 'Copy link' },
      { keys: ['C'], label: 'Copy text' },
      { keys: ['D'], label: 'Download' },
      { keys: ['O'], label: 'Open original' },
      { keys: ['A'], label: 'Archive' },
      { keys: ['R'], label: 'Read / Watch' },
      { keys: ['U'], label: 'Undo archive' },
    ],
  },
  {
    title: 'Also',
    rows: [
      { keys: ['.'], label: 'Menu' },
      { keys: ['⌘V', 'Ctrl+V'], label: 'Paste a link' },
      { keys: ['?'], label: 'This help' },
      { keys: ['Esc'], label: 'Close' },
    ],
  },
]
