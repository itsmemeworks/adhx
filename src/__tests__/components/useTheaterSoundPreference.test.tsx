/**
 * @vitest-environment jsdom
 */
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { THEATER_STAGE_TAP } from '@/components/theater/useTheaterStageEvents'
import {
  resolveInitialTheaterSound,
  useTheaterSoundPreference,
} from '@/components/theater/useTheaterSoundPreference'

describe('useTheaterSoundPreference', () => {
  beforeEach(() => {
    sessionStorage.clear()
    localStorage.clear()
  })

  it('uses the account default only when the browser has no explicit sound choice', () => {
    expect(resolveInitialTheaterSound(null, null, true)).toBe(true)
    expect(resolveInitialTheaterSound(null, null, false)).toBe(false)
    expect(resolveInitialTheaterSound(true, false, false)).toBe(true)
    expect(resolveInitialTheaterSound(false, true, true)).toBe(false)
  })

  it('waits for account preferences before applying the default', async () => {
    const { result, rerender } = renderHook(
      ({ ready, soundOnByDefault }) => useTheaterSoundPreference({ ready, soundOnByDefault }),
      { initialProps: { ready: false, soundOnByDefault: false } },
    )

    expect(result.current[0]).toBe(true)
    rerender({ ready: true, soundOnByDefault: true })

    await waitFor(() => expect(result.current[0]).toBe(false))
    expect(sessionStorage.getItem('adhx-theater-sound')).toBeNull()
  })

  it('uses localStorage while account preferences load, then accepts the server value', async () => {
    localStorage.setItem('adhx-theater-sound-default', 'on')
    const { result, rerender } = renderHook(
      ({ ready, soundOnByDefault }) => useTheaterSoundPreference({ ready, soundOnByDefault }),
      { initialProps: { ready: false, soundOnByDefault: false } },
    )

    await waitFor(() => expect(result.current[0]).toBe(false))
    rerender({ ready: true, soundOnByDefault: false })
    await waitFor(() => expect(result.current[0]).toBe(true))
  })

  it('does not let a later account default override the browser’s last explicit choice', async () => {
    localStorage.setItem('adhx-theater-sound', 'on')
    const { result, rerender } = renderHook(
      ({ ready, soundOnByDefault }) => useTheaterSoundPreference({ ready, soundOnByDefault }),
      { initialProps: { ready: false, soundOnByDefault: false } },
    )

    await waitFor(() => expect(result.current[0]).toBe(false))
    rerender({ ready: true, soundOnByDefault: false })
    await waitFor(() => expect(result.current[0]).toBe(false))
  })

  it('classifies persisted sound-on hydration as gesture-less catch-up', async () => {
    localStorage.setItem('adhx-theater-sound', 'on')
    const events: Array<{ muted: boolean; source?: string }> = []
    const onSetMuted = (event: Event) => {
      events.push((event as CustomEvent<{ muted: boolean; source?: string }>).detail)
    }
    window.addEventListener('theater-set-muted', onSetMuted)

    try {
      const { result } = renderHook(() =>
        useTheaterSoundPreference({ ready: true, soundOnByDefault: false }),
      )
      await waitFor(() => expect(result.current[0]).toBe(false))
      expect(events).toContainEqual({ muted: false, source: 'catchup' })
    } finally {
      window.removeEventListener('theater-set-muted', onSetMuted)
    }
  })

  it('keeps a manual sound choice made while account preferences load', async () => {
    const { result, rerender } = renderHook(
      ({ ready, soundOnByDefault }) => useTheaterSoundPreference({ ready, soundOnByDefault }),
      { initialProps: { ready: false, soundOnByDefault: false } },
    )

    act(() => result.current[1](false))
    expect(localStorage.getItem('adhx-theater-sound')).toBe('on')
    expect(sessionStorage.getItem('adhx-theater-sound')).toBeNull()

    rerender({ ready: true, soundOnByDefault: false })
    await waitFor(() => expect(result.current[0]).toBe(false))
  })

  it('persists a sound choice across links, reloads, and tabs', async () => {
    const { result } = renderHook(() =>
      useTheaterSoundPreference({ ready: true, soundOnByDefault: false }),
    )

    act(() => result.current[1](false))

    await waitFor(() => expect(localStorage.getItem('adhx-theater-sound')).toBe('on'))
    expect(sessionStorage.getItem('adhx-theater-sound')).toBeNull()
  })

  it('migrates the former per-tab choice into browser-wide storage', async () => {
    sessionStorage.setItem('adhx-theater-sound', 'on')
    const { result } = renderHook(() =>
      useTheaterSoundPreference({ ready: true, soundOnByDefault: false }),
    )

    await waitFor(() => expect(result.current[0]).toBe(false))
    expect(localStorage.getItem('adhx-theater-sound')).toBe('on')
    expect(sessionStorage.getItem('adhx-theater-sound')).toBeNull()
  })

  it('applies another tab’s latest choice and marks it as catch-up audio', async () => {
    const events: Array<{ muted: boolean; source?: string }> = []
    const onSetMuted = (event: Event) => {
      events.push((event as CustomEvent<{ muted: boolean; source?: string }>).detail)
    }
    window.addEventListener('theater-set-muted', onSetMuted)
    const { result } = renderHook(() =>
      useTheaterSoundPreference({ ready: true, soundOnByDefault: false }),
    )
    await waitFor(() => expect(result.current[0]).toBe(true))

    try {
      localStorage.setItem('adhx-theater-sound', 'on')
      act(() => {
        window.dispatchEvent(
          new StorageEvent('storage', {
            key: 'adhx-theater-sound',
            newValue: 'on',
            storageArea: localStorage,
          }),
        )
      })
      expect(result.current[0]).toBe(false)
      expect(events.at(-1)).toEqual({ muted: false, source: 'catchup' })

      localStorage.setItem('adhx-theater-sound', 'off')
      act(() => {
        window.dispatchEvent(
          new StorageEvent('storage', {
            key: 'adhx-theater-sound',
            newValue: 'off',
            storageArea: localStorage,
          }),
        )
      })
      expect(result.current[0]).toBe(true)
      expect(events.at(-1)).toEqual({ muted: true, source: 'catchup' })

      // A delayed event from an older write must not beat localStorage's
      // current last-write-wins value.
      act(() => {
        window.dispatchEvent(
          new StorageEvent('storage', {
            key: 'adhx-theater-sound',
            oldValue: 'off',
            newValue: 'on',
            storageArea: localStorage,
          }),
        )
      })
      expect(result.current[0]).toBe(true)
    } finally {
      window.removeEventListener('theater-set-muted', onSetMuted)
    }
  })

  it('returns to the cached account default when another tab removes its choice', async () => {
    localStorage.setItem('adhx-theater-sound-default', 'off')
    localStorage.setItem('adhx-theater-sound', 'on')
    const { result } = renderHook(() =>
      useTheaterSoundPreference({ ready: true, soundOnByDefault: false }),
    )
    await waitFor(() => expect(result.current[0]).toBe(false))

    localStorage.removeItem('adhx-theater-sound')
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'adhx-theater-sound',
          oldValue: 'on',
          newValue: null,
          storageArea: localStorage,
        }),
      )
    })

    expect(result.current[0]).toBe(true)
  })

  it('retries preferred sound inside the next stage-tap gesture', async () => {
    const onSetMuted = vi.fn()
    window.addEventListener('theater-set-muted', onSetMuted)
    const { result } = renderHook(() =>
      useTheaterSoundPreference({ ready: true, soundOnByDefault: true }),
    )
    await waitFor(() => expect(result.current[0]).toBe(false))
    onSetMuted.mockClear()

    act(() => window.dispatchEvent(new CustomEvent(THEATER_STAGE_TAP)))
    expect(onSetMuted).toHaveBeenCalledTimes(1)
    expect((onSetMuted.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({ muted: false })

    act(() => result.current[1](true))
    act(() => window.dispatchEvent(new CustomEvent(THEATER_STAGE_TAP)))
    expect(onSetMuted).toHaveBeenCalledTimes(1)
    window.removeEventListener('theater-set-muted', onSetMuted)
  })
})
