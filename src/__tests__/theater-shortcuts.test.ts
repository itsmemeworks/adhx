/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest'
import {
  resolveTheaterShortcut,
  scrollTheaterStage,
  THEATER_SHORTCUT_KEYS,
  THEATER_ACTION_EVENTS,
  THEATER_SHORTCUT_HELP,
} from '@/components/theater/theater-shortcuts'

describe('resolveTheaterShortcut', () => {
  it('maps nav, playback, actions, menu, and help', () => {
    expect(resolveTheaterShortcut({ key: 'ArrowRight' })).toBe('next')
    expect(resolveTheaterShortcut({ key: 'j' })).toBe('next')
    expect(resolveTheaterShortcut({ key: 'ArrowLeft' })).toBe('prev')
    expect(resolveTheaterShortcut({ key: 'k' })).toBe('prev')
    expect(resolveTheaterShortcut({ key: 'ArrowDown' })).toBe('scrollDown')
    expect(resolveTheaterShortcut({ key: 'ArrowUp' })).toBe('scrollUp')
    expect(resolveTheaterShortcut({ key: ' ' })).toBe('togglePlay')
    expect(resolveTheaterShortcut({ key: 'm' })).toBe('toggleMute')
    expect(resolveTheaterShortcut({ key: 'e' })).toBe('toggleExpand')
    expect(resolveTheaterShortcut({ key: 'E' })).toBe('toggleExpand')
    expect(resolveTheaterShortcut({ key: 'f' })).toBe('toggleArticle')
    expect(resolveTheaterShortcut({ key: 'F' })).toBe('toggleArticle')
    expect(resolveTheaterShortcut({ key: 's' })).toBe('save')
    expect(resolveTheaterShortcut({ key: 't' })).toBe('tag')
    expect(resolveTheaterShortcut({ key: 'l' })).toBe('copyLink')
    expect(resolveTheaterShortcut({ key: 'c' })).toBe('copyText')
    expect(resolveTheaterShortcut({ key: 'd' })).toBe('sendFile')
    expect(resolveTheaterShortcut({ key: 'o' })).toBe('open')
    expect(resolveTheaterShortcut({ key: 'a' })).toBe('archive')
    expect(resolveTheaterShortcut({ key: 'r' })).toBe('cycleRepeat')
    expect(resolveTheaterShortcut({ key: 'R' })).toBe('cycleRepeat')
    expect(resolveTheaterShortcut({ key: 'u' })).toBe('undo')
    expect(resolveTheaterShortcut({ key: 'w' })).toBe('replay')
    expect(resolveTheaterShortcut({ key: 'p' })).toBe('keepPlaying')
    expect(resolveTheaterShortcut({ key: '.' })).toBe('toggleMenu')
    expect(resolveTheaterShortcut({ key: '?' })).toBe('toggleHelp')
    expect(resolveTheaterShortcut({ key: '/', shiftKey: true })).toBe('toggleHelp')
    expect(resolveTheaterShortcut({ key: 'Escape' })).toBe('close')
  })

  it('does not steal ⌘V / Ctrl+V — paste is the OS event', () => {
    expect(resolveTheaterShortcut({ key: 'v', metaKey: true })).toBe(null)
    expect(resolveTheaterShortcut({ key: 'v', ctrlKey: true })).toBe(null)
    expect(resolveTheaterShortcut({ key: '/', shiftKey: false })).toBe(null)
  })

  it('ignores typing targets and other modifiers', () => {
    const input = document.createElement('input')
    expect(resolveTheaterShortcut({ key: 's', target: input })).toBe(null)
    expect(resolveTheaterShortcut({ key: 's', altKey: true })).toBe(null)
    expect(resolveTheaterShortcut({ key: 'q' })).toBe(null)
  })

  it('keeps overlay block-list in sync with the mapped keys', () => {
    for (const key of [
      's',
      't',
      'l',
      'c',
      'd',
      'e',
      'f',
      'o',
      'a',
      'r',
      'w',
      'p',
      '.',
      '?',
      'Escape',
      ' ',
      'ArrowDown',
      'ArrowUp',
    ]) {
      expect(THEATER_SHORTCUT_KEYS.has(key)).toBe(true)
    }
    expect(THEATER_ACTION_EVENTS.save).toBe('theater-save')
    expect(THEATER_ACTION_EVENTS.toggleMenu).toBe('theater-toggle-menu')
    expect(THEATER_ACTION_EVENTS.toggleArticle).toBe('theater-toggle-article')
    expect(THEATER_ACTION_EVENTS.replay).toBe('theater-replay')
    expect(THEATER_ACTION_EVENTS.keepPlaying).toBe('theater-keep-playing')
    expect(THEATER_ACTION_EVENTS.toggleExpand).toBe('theater-toggle-expand')
    expect(THEATER_ACTION_EVENTS.cycleRepeat).toBe('theater-cycle-repeat')
  })

  it('groups next vs previous keys on the help overlay', () => {
    const nav = THEATER_SHORTCUT_HELP.find((s) => s.title === 'Navigate')
    expect(nav?.rows).toEqual([
      { keys: ['→', 'J'], label: 'Next post' },
      { keys: ['←', 'K'], label: 'Previous post' },
      { keys: ['↓', '↑'], label: 'Scroll text' },
    ])
  })

  it('lists Archive below Read / Watch', () => {
    const actions = THEATER_SHORTCUT_HELP.find((s) => s.title === 'Actions')
    expect(actions?.rows.map((r) => r.label)).toEqual([
      'Save',
      'Tag',
      'Copy link',
      'Copy text',
      'Download',
      'Open original',
      'Read / Watch',
      'Archive',
      'Undo archive',
    ])
    expect(actions?.rows.find((r) => r.label === 'Read / Watch')?.keys).toEqual(['F'])
  })

  it('lists Expand and Repeat on the playback help', () => {
    const play = THEATER_SHORTCUT_HELP.find((s) => s.title === 'Playback')
    expect(play?.rows).toEqual([
      { keys: ['Space'], label: 'Play / pause' },
      { keys: ['M'], label: 'Mute / unmute' },
      { keys: ['E'], label: 'Expand' },
      { keys: ['R'], label: 'Repeat' },
    ])
  })
})

describe('scrollTheaterStage', () => {
  function scroller(opts: { height: number; view: number; top: number }) {
    const root = document.createElement('div')
    const el = document.createElement('div')
    el.setAttribute('data-theater-scroll', '')
    Object.defineProperty(el, 'scrollHeight', { value: opts.height, configurable: true })
    Object.defineProperty(el, 'clientHeight', { value: opts.view, configurable: true })
    el.scrollTop = opts.top
    root.appendChild(el)
    return { root, el }
  }

  it('moves a tall text scroller down and up', () => {
    const { root, el } = scroller({ height: 1000, view: 400, top: 0 })
    expect(scrollTheaterStage(1, root)).toBe(true)
    expect(el.scrollTop).toBeGreaterThan(0)
    const afterDown = el.scrollTop
    expect(scrollTheaterStage(-1, root)).toBe(true)
    expect(el.scrollTop).toBeLessThan(afterDown)
  })

  it('no-ops when there is no scroller or nothing to scroll', () => {
    expect(scrollTheaterStage(1, document.createElement('div'))).toBe(false)
    const { root, el } = scroller({ height: 400, view: 400, top: 0 })
    expect(scrollTheaterStage(1, root)).toBe(false)
    expect(el.scrollTop).toBe(0)
  })
})
