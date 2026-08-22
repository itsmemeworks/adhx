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
    isTriage: false,
    triageTab: 'live' as const,
    goNext: vi.fn(),
    goPrev: vi.fn(),
    setMuted: vi.fn(),
    triageDone: vi.fn(),
    triageLater: vi.fn(),
    triageDelete: vi.fn(),
    triageStepBack: vi.fn(),
    triageDoUndo: vi.fn(),
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

  it('other keys (goNext/goPrev/mute) are unaffected by isPlaybackHidden', () => {
    const args = baseArgs({ isPlaybackHidden: () => true })
    renderHook(() => useTheaterKeyboard(args))
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' })))
    expect(args.goNext).toHaveBeenCalledTimes(1)
  })
})
