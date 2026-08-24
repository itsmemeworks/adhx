/**
 * @vitest-environment jsdom
 *
 * Owner screenshot: a fresh arrival landing on the waiting screen exposed a
 * bug where Space resumed the (now-hidden, paused) stage sitting underneath
 * the "You're all caught up" overlay. `isPlaybackHidden` is the guard —
 * Space must not dispatch `theater-toggle-play` while it reports true.
 */
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTheaterKeyboard } from '@/components/theater/useTheaterKeyboard'

function baseArgs(overrides: Partial<Parameters<typeof useTheaterKeyboard>[0]> = {}) {
  return {
    isPersonal: false,
    personalTab: 'live' as const,
    goNext: vi.fn(),
    goPrev: vi.fn(),
    setMuted: vi.fn(),
    undoLastAction: vi.fn(),
    ...overrides,
  }
}

function pressSpace() {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }))
}

describe('useTheaterKeyboard: isPlaybackHidden space guard', () => {
  it('dispatches theater-toggle-play on Space when isPlaybackHidden is absent', () => {
    const heard = vi.fn()
    window.addEventListener('theater-toggle-play', heard)
    try {
      renderHook(() => useTheaterKeyboard(baseArgs()))
      act(() => pressSpace())
      expect(heard).toHaveBeenCalledTimes(1)
    } finally {
      window.removeEventListener('theater-toggle-play', heard)
    }
  })

  it('dispatches theater-toggle-play on Space when isPlaybackHidden returns false', () => {
    const heard = vi.fn()
    window.addEventListener('theater-toggle-play', heard)
    try {
      renderHook(() => useTheaterKeyboard(baseArgs({ isPlaybackHidden: () => false })))
      act(() => pressSpace())
      expect(heard).toHaveBeenCalledTimes(1)
    } finally {
      window.removeEventListener('theater-toggle-play', heard)
    }
  })

  it('does NOT dispatch theater-toggle-play on Space when isPlaybackHidden returns true', () => {
    const heard = vi.fn()
    window.addEventListener('theater-toggle-play', heard)
    try {
      renderHook(() => useTheaterKeyboard(baseArgs({ isPlaybackHidden: () => true })))
      act(() => pressSpace())
      expect(heard).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener('theater-toggle-play', heard)
    }
  })

  it('is read fresh at keypress time — a ref-like callback, not a re-registered listener', () => {
    const heard = vi.fn()
    window.addEventListener('theater-toggle-play', heard)
    let hidden = true
    try {
      renderHook(() => useTheaterKeyboard(baseArgs({ isPlaybackHidden: () => hidden })))
      act(() => pressSpace())
      expect(heard).not.toHaveBeenCalled()

      hidden = false
      act(() => pressSpace())
      expect(heard).toHaveBeenCalledTimes(1)
    } finally {
      window.removeEventListener('theater-toggle-play', heard)
    }
  })

  it('collection tab: arrows skip, U undoes Archive, Delete is ignored', () => {
    const args = baseArgs({
      isPersonal: true,
      personalTab: 'collection',
      goNext: vi.fn(),
      goPrev: vi.fn(),
      undoLastAction: vi.fn(),
      onClose: vi.fn(),
    })
    renderHook(() => useTheaterKeyboard(args))
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' })))
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' })))
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' })))
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'u' })))
    expect(args.goNext).toHaveBeenCalledTimes(1)
    expect(args.goPrev).toHaveBeenCalledTimes(1)
    expect(args.undoLastAction).toHaveBeenCalledTimes(1)
    expect(args.onClose).not.toHaveBeenCalled()
  })

  it('other keys (goNext/goPrev/mute) are unaffected by isPlaybackHidden', () => {
    const args = baseArgs({ isPlaybackHidden: () => true })
    renderHook(() => useTheaterKeyboard(args))
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' })))
    expect(args.goNext).toHaveBeenCalledTimes(1)
  })

  it('dispatches action events for save/tag/link/menu', () => {
    const heard = vi.fn()
    window.addEventListener('theater-save', heard)
    window.addEventListener('theater-tag', heard)
    window.addEventListener('theater-copy-link', heard)
    window.addEventListener('theater-toggle-menu', heard)
    try {
      renderHook(() => useTheaterKeyboard(baseArgs()))
      act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 's' })))
      act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 't' })))
      act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'l' })))
      act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: '.' })))
      expect(heard).toHaveBeenCalledTimes(4)
    } finally {
      window.removeEventListener('theater-save', heard)
      window.removeEventListener('theater-tag', heard)
      window.removeEventListener('theater-copy-link', heard)
      window.removeEventListener('theater-toggle-menu', heard)
    }
  })

  it('Shift+? toggles help and blocks other keys while help is open', () => {
    const onToggleHelp = vi.fn()
    const args = baseArgs({ helpOpen: true, onToggleHelp })
    renderHook(() => useTheaterKeyboard(args))
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: '?' })))
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' })))
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 's' })))
    expect(onToggleHelp).toHaveBeenCalledTimes(1)
    expect(args.goNext).not.toHaveBeenCalled()
  })

  it('opens help when closed, mutes, and dispatches the rest of the action map', () => {
    const onToggleHelp = vi.fn()
    const heard: string[] = []
    const names = [
      'theater-copy-text',
      'theater-send-file',
      'theater-open',
      'theater-archive',
      'theater-toggle-article',
    ] as const
    const listeners = names.map((name) => {
      const fn = () => heard.push(name)
      window.addEventListener(name, fn)
      return { name, fn }
    })
    const args = baseArgs({ onToggleHelp })
    try {
      renderHook(() => useTheaterKeyboard(args))
      act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: '?' })))
      act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm' })))
      act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c' })))
      act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd' })))
      act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'o' })))
      act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' })))
      act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'r' })))
      expect(onToggleHelp).toHaveBeenCalledTimes(1)
      expect(args.setMuted).toHaveBeenCalledTimes(1)
      expect(heard).toEqual([...names])
    } finally {
      for (const { name, fn } of listeners) {
        window.removeEventListener(name, fn)
      }
    }
  })

  it('Escape closes the personal theater and is ignored on Live', () => {
    const personal = baseArgs({ isPersonal: true, personalTab: 'live', onClose: vi.fn() })
    renderHook(() => useTheaterKeyboard(personal))
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
    expect(personal.onClose).toHaveBeenCalledTimes(1)

    const live = baseArgs({ isPersonal: false, onClose: vi.fn() })
    renderHook(() => useTheaterKeyboard(live))
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
    expect(live.onClose).not.toHaveBeenCalled()
  })

  it('ignores keys while typing and ⌘S / Ctrl+S', () => {
    const heard = vi.fn()
    window.addEventListener('theater-save', heard)
    const input = document.createElement('input')
    document.body.appendChild(input)
    try {
      renderHook(() => useTheaterKeyboard(baseArgs()))
      act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 's', bubbles: true })))
      act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', metaKey: true })))
      act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true })))
      expect(heard).not.toHaveBeenCalled()
    } finally {
      input.remove()
      window.removeEventListener('theater-save', heard)
    }
  })
})
