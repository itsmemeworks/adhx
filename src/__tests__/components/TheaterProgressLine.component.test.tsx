/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest'
import { render, act } from '@testing-library/react'
import { TheaterProgressLine } from '@/components/theater/TheaterProgressLine'

describe('TheaterProgressLine', () => {
  it('video kind paints the fill from theater-video-progress', () => {
    const { container } = render(<TheaterProgressLine itemKey="youtube:1" kind="video" />)
    const fill = container.querySelector('[data-theater-progress-fill]') as HTMLElement
    expect(fill).toBeTruthy()
    expect(fill.style.width).toBe('0%')

    act(() => {
      window.dispatchEvent(new CustomEvent('theater-video-progress', { detail: { progress: 0.4 } }))
    })
    expect(fill.style.width).toBe('40%')
  })

  it('renders nothing for kind none', () => {
    const { container } = render(<TheaterProgressLine itemKey="youtube:1" kind="none" />)
    expect(container.querySelector('[data-theater-progress-fill]')).toBeNull()
  })

  it('Space (theater-toggle-play) pauses and resumes the 10s dwell', () => {
    render(<TheaterProgressLine itemKey="photo:1" kind="timed" />)
    const paused = vi.fn()
    const resumed = vi.fn()
    window.addEventListener('theater-pause', paused)
    window.addEventListener('theater-resume', resumed)
    try {
      act(() => {
        window.dispatchEvent(new CustomEvent('theater-toggle-play'))
      })
      expect(paused).toHaveBeenCalledTimes(1)
      expect(resumed).not.toHaveBeenCalled()

      act(() => {
        window.dispatchEvent(new CustomEvent('theater-toggle-play'))
      })
      expect(resumed).toHaveBeenCalledTimes(1)
      expect(paused).toHaveBeenCalledTimes(1)
    } finally {
      window.removeEventListener('theater-pause', paused)
      window.removeEventListener('theater-resume', resumed)
    }
  })

  it('does not treat Space as a timed pause when the kind is video', () => {
    render(<TheaterProgressLine itemKey="youtube:1" kind="video" />)
    const paused = vi.fn()
    window.addEventListener('theater-pause', paused)
    try {
      act(() => {
        window.dispatchEvent(new CustomEvent('theater-toggle-play'))
      })
      expect(paused).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener('theater-pause', paused)
    }
  })
})
