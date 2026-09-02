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

  it('uses the account default only when this tab has no sound choice', () => {
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

  it('keeps a manual sound choice made while account preferences load', async () => {
    const { result, rerender } = renderHook(
      ({ ready, soundOnByDefault }) => useTheaterSoundPreference({ ready, soundOnByDefault }),
      { initialProps: { ready: false, soundOnByDefault: false } },
    )

    act(() => result.current[1](false))
    expect(sessionStorage.getItem('adhx-theater-sound')).toBe('on')

    rerender({ ready: true, soundOnByDefault: false })
    await waitFor(() => expect(result.current[0]).toBe(false))
  })

  it('persists a sound choice for full-page navigation in this tab', async () => {
    const { result } = renderHook(() =>
      useTheaterSoundPreference({ ready: true, soundOnByDefault: false }),
    )

    act(() => result.current[1](false))

    await waitFor(() => expect(sessionStorage.getItem('adhx-theater-sound')).toBe('on'))
  })

  it('retries preferred sound inside the next stage-tap gesture', async () => {
    const onSetMuted = vi.fn()
    window.addEventListener('theater-set-muted', onSetMuted)
    const { result } = renderHook(() =>
      useTheaterSoundPreference({ ready: true, soundOnByDefault: true }),
    )
    await waitFor(() => expect(result.current[0]).toBe(false))

    act(() => window.dispatchEvent(new CustomEvent(THEATER_STAGE_TAP)))
    expect(onSetMuted).toHaveBeenCalledTimes(1)
    expect((onSetMuted.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({ muted: false })

    act(() => result.current[1](true))
    act(() => window.dispatchEvent(new CustomEvent(THEATER_STAGE_TAP)))
    expect(onSetMuted).toHaveBeenCalledTimes(1)
    window.removeEventListener('theater-set-muted', onSetMuted)
  })
})
