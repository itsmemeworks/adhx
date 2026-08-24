/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { useRef } from 'react'
import { useTheaterActionHotkeys } from '@/components/theater/useTheaterActionHotkeys'

function Probe({ surface, onSave }: { surface: 'desktop' | 'mobile'; onSave: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null)
  useTheaterActionHotkeys(surface, rootRef)
  return (
    <div ref={rootRef}>
      <button type="button" data-theater-action="save" onClick={onSave}>
        Save
      </button>
    </div>
  )
}

describe('useTheaterActionHotkeys', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === '(min-width: 1024px)',
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    })
  })

  it('clicks the matching control on the active surface only', () => {
    const desktopSave = vi.fn()
    const mobileSave = vi.fn()
    render(
      <>
        <Probe surface="desktop" onSave={desktopSave} />
        <Probe surface="mobile" onSave={mobileSave} />
      </>,
    )
    act(() => window.dispatchEvent(new Event('theater-save')))
    expect(desktopSave).toHaveBeenCalledTimes(1)
    expect(mobileSave).not.toHaveBeenCalled()
  })

  it('clicks Read / Watch when theater-toggle-article fires', () => {
    const onRead = vi.fn()
    function ReadToggle() {
      const rootRef = useRef<HTMLDivElement>(null)
      useTheaterActionHotkeys('desktop', rootRef)
      return (
        <div ref={rootRef}>
          <button type="button" data-theater-action="read" onClick={onRead}>
            Read
          </button>
        </div>
      )
    }
    render(<ReadToggle />)
    act(() => window.dispatchEvent(new Event('theater-toggle-article')))
    expect(onRead).toHaveBeenCalledTimes(1)
  })

  it('skips a disabled control and a missing action', () => {
    const onSave = vi.fn()
    function DisabledSave() {
      const rootRef = useRef<HTMLDivElement>(null)
      useTheaterActionHotkeys('desktop', rootRef)
      return (
        <div ref={rootRef}>
          <button type="button" data-theater-action="save" disabled onClick={onSave}>
            Save
          </button>
        </div>
      )
    }
    render(<DisabledSave />)
    act(() => window.dispatchEvent(new Event('theater-save')))
    act(() => window.dispatchEvent(new Event('theater-tag')))
    expect(onSave).not.toHaveBeenCalled()
  })
})
