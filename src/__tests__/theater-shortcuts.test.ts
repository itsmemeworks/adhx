/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest'
import {
  resolveTheaterShortcut,
  THEATER_SHORTCUT_KEYS,
  THEATER_ACTION_EVENTS,
} from '@/components/theater/theater-shortcuts'

describe('resolveTheaterShortcut', () => {
  it('maps nav, playback, actions, menu, and help', () => {
    expect(resolveTheaterShortcut({ key: 'ArrowRight' })).toBe('next')
    expect(resolveTheaterShortcut({ key: 'j' })).toBe('next')
    expect(resolveTheaterShortcut({ key: 'ArrowLeft' })).toBe('prev')
    expect(resolveTheaterShortcut({ key: 'k' })).toBe('prev')
    expect(resolveTheaterShortcut({ key: ' ' })).toBe('togglePlay')
    expect(resolveTheaterShortcut({ key: 'm' })).toBe('toggleMute')
    expect(resolveTheaterShortcut({ key: 's' })).toBe('save')
    expect(resolveTheaterShortcut({ key: 't' })).toBe('tag')
    expect(resolveTheaterShortcut({ key: 'l' })).toBe('copyLink')
    expect(resolveTheaterShortcut({ key: 'c' })).toBe('copyText')
    expect(resolveTheaterShortcut({ key: 'd' })).toBe('sendFile')
    expect(resolveTheaterShortcut({ key: 'o' })).toBe('open')
    expect(resolveTheaterShortcut({ key: 'a' })).toBe('archive')
    expect(resolveTheaterShortcut({ key: 'r' })).toBe('toggleArticle')
    expect(resolveTheaterShortcut({ key: 'R' })).toBe('toggleArticle')
    expect(resolveTheaterShortcut({ key: 'u' })).toBe('undo')
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
    for (const key of ['s', 't', 'l', 'c', 'd', 'o', 'a', 'r', '.', '?', 'Escape', ' ']) {
      expect(THEATER_SHORTCUT_KEYS.has(key)).toBe(true)
    }
    expect(THEATER_ACTION_EVENTS.save).toBe('theater-save')
    expect(THEATER_ACTION_EVENTS.toggleMenu).toBe('theater-toggle-menu')
    expect(THEATER_ACTION_EVENTS.toggleArticle).toBe('theater-toggle-article')
  })
})
