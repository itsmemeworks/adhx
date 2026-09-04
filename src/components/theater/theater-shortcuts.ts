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
  | 'toggleShowAll'
  | 'toggleFilter'
  | 'toggleHelp'
  | 'toggleArticle'
  | 'replay'
  | 'keepPlaying'
  | 'toggleExpand'
  | 'cycleRepeat'
  | 'tabLive'
  | 'tabSaved'
  | 'scrollDown'
  | 'scrollUp'

export const THEATER_ACTION_EVENTS = {
  toggleMute: 'theater-toggle-mute',
  save: 'theater-save',
  tag: 'theater-tag',
  copyLink: 'theater-copy-link',
  copyText: 'theater-copy-text',
  sendFile: 'theater-send-file',
  open: 'theater-open',
  archive: 'theater-archive',
  toggleMenu: 'theater-toggle-menu',
  toggleShowAll: 'theater-toggle-show-all',
  toggleFilter: 'theater-toggle-filter',
  toggleArticle: 'theater-toggle-article',
  replay: 'theater-replay',
  keepPlaying: 'theater-keep-playing',
  toggleExpand: 'theater-toggle-expand',
  cycleRepeat: 'theater-cycle-repeat',
} as const

export type TheaterActionName = keyof typeof THEATER_ACTION_EVENTS

/** data-theater-action value for the matching control in the visible chrome. */
export const THEATER_ACTION_ATTR: Record<TheaterActionName, string> = {
  toggleMute: 'mute',
  save: 'save',
  tag: 'tag',
  copyLink: 'link',
  copyText: 'copy',
  sendFile: 'download',
  open: 'open',
  archive: 'archive',
  toggleMenu: 'menu',
  toggleShowAll: 'show-all',
  toggleFilter: 'queue-filter',
  toggleArticle: 'read',
  replay: 'replay',
  keepPlaying: 'keep-playing',
  toggleExpand: 'expand',
  cycleRepeat: 'repeat',
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
 * picker, avatar menu, Queue, help) stop these from reaching the stage.
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
  'e',
  'E',
  'f',
  'F',
  'o',
  'O',
  'a',
  'A',
  'r',
  'R',
  '1',
  '2',
  'u',
  'U',
  'w',
  'W',
  'p',
  'P',
  'q',
  'Q',
  '.',
  '?',
  '/',
  'Escape',
])

export function resolveTheaterShortcut(e: TheaterKeyLike): TheaterShortcut | null {
  if (e.metaKey || e.ctrlKey || e.altKey) return null
  if (isTheaterTypingTarget(e.target)) return null

  switch (e.key) {
    case 'ArrowRight':
    case 'j':
    case 'J':
      return 'next'
    case 'ArrowLeft':
    case 'k':
    case 'K':
      return 'prev'
    case 'ArrowDown':
      return 'scrollDown'
    case 'ArrowUp':
      return 'scrollUp'
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
    case 'e':
    case 'E':
      return 'toggleExpand'
    case 'f':
    case 'F':
      return 'toggleArticle'
    case 'o':
    case 'O':
      return 'open'
    case 'a':
    case 'A':
      return 'archive'
    case 'r':
    case 'R':
      return 'cycleRepeat'
    case '1':
      return 'tabLive'
    case '2':
      return 'tabSaved'
    case 'u':
    case 'U':
      return 'undo'
    case 'w':
    case 'W':
      return 'replay'
    case 'p':
    case 'P':
      return 'keepPlaying'
    case 'q':
    case 'Q':
      return e.shiftKey ? 'toggleFilter' : 'toggleShowAll'
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

/**
 * ↑/↓ scroll the on-stage article/text reader instead of changing posts.
 * Returns whether the scroller actually moved.
 */
export function scrollTheaterStage(direction: 1 | -1, root: ParentNode = document): boolean {
  const el = root.querySelector<HTMLElement>('[data-theater-scroll]')
  if (!el) return false
  const max = el.scrollHeight - el.clientHeight
  if (max <= 1) return false
  const step = Math.max(64, Math.round(el.clientHeight * 0.35))
  const next = Math.max(0, Math.min(max, el.scrollTop + direction * step))
  if (next === el.scrollTop) return false
  el.scrollTop = next
  return true
}

export type TheaterHelpRow = { keys: string[]; label: string }

export type TheaterHelpSection = { title: string; rows: TheaterHelpRow[] }

export const THEATER_SHORTCUT_HELP: TheaterHelpSection[] = [
  {
    title: 'Navigate',
    rows: [
      { keys: ['→', 'J'], label: 'Next post' },
      { keys: ['←', 'K'], label: 'Previous post' },
      { keys: ['↓', '↑'], label: 'Scroll text' },
    ],
  },
  {
    title: 'Theater',
    rows: [
      { keys: ['1'], label: 'Live' },
      { keys: ['2'], label: 'Saved' },
      { keys: ['Q'], label: 'Queue' },
      { keys: ['⇧Q'], label: 'Filter (desktop)' },
    ],
  },
  {
    title: 'Playback',
    rows: [
      { keys: ['Space'], label: 'Play / pause' },
      { keys: ['M'], label: 'Mute / unmute' },
      { keys: ['E'], label: 'Expand' },
      { keys: ['R'], label: 'Repeat' },
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
      { keys: ['F'], label: 'Read / Watch' },
      { keys: ['A'], label: 'Archive' },
      { keys: ['U'], label: 'Undo archive' },
    ],
  },
  {
    title: 'Also',
    rows: [
      { keys: ['.'], label: 'Menu' },
      { keys: ['W'], label: 'Re-watch all' },
      { keys: ['P'], label: 'Keep playing' },
      { keys: ['⌘V', 'Ctrl+V'], label: 'Paste a link' },
      { keys: ['?'], label: 'This help' },
      { keys: ['Esc'], label: 'Close' },
    ],
  },
]
