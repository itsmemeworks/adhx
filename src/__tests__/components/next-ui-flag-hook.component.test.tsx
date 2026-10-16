// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { setNextUiOverride, useNextUi } from '@/lib/next-ui/useNextUi'
import { NEXT_UI_STORAGE_KEY } from '@/lib/next-ui/flag'

function Probe() {
  const on = useNextUi()
  return <span data-testid="flag">{on ? 'on' : 'off'}</span>
}

function setUrl(search: string) {
  window.history.replaceState(null, '', `/somewhere${search}`)
}

beforeEach(() => {
  window.localStorage.clear()
  document.cookie = 'adhx_next_ui=; Path=/; Max-Age=0'
  setUrl('')
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('useNextUi', () => {
  it('is off by default', () => {
    render(<Probe />)
    expect(screen.getByTestId('flag')).toHaveTextContent('off')
  })

  it('turns on from ?next_ui=1 and persists it for later pages', () => {
    setUrl('?next_ui=1')
    render(<Probe />)
    expect(screen.getByTestId('flag')).toHaveTextContent('on')
    expect(window.localStorage.getItem(NEXT_UI_STORAGE_KEY)).toBe('1')
    expect(document.cookie).toContain('adhx_next_ui=1')

    setUrl('')
    render(<Probe />)
    expect(screen.getAllByTestId('flag').map((n) => n.textContent)).toEqual(['on', 'on'])
  })

  it('?next_ui=0 switches a persisted override back off', () => {
    window.localStorage.setItem(NEXT_UI_STORAGE_KEY, '1')
    setUrl('?next_ui=0')
    render(<Probe />)
    expect(screen.getByTestId('flag')).toHaveTextContent('off')
    expect(window.localStorage.getItem(NEXT_UI_STORAGE_KEY)).toBe('0')
  })

  it('re-renders when the override changes', () => {
    render(<Probe />)
    act(() => setNextUiOverride(true))
    expect(screen.getByTestId('flag')).toHaveTextContent('on')
    act(() => setNextUiOverride(null))
    expect(screen.getByTestId('flag')).toHaveTextContent('off')
    expect(window.localStorage.getItem(NEXT_UI_STORAGE_KEY)).toBeNull()
  })

  it('survives storage that throws (private mode / blocked site data)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    setUrl('?next_ui=1')
    render(<Probe />)
    // The URL still wins for this page view.
    expect(screen.getByTestId('flag')).toHaveTextContent('on')
    expect(() => setNextUiOverride(false)).not.toThrow()
  })
})
