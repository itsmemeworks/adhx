/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest'
import { render, act, fireEvent } from '@testing-library/react'
import { TheaterProgressLine } from '@/components/theater/TheaterProgressLine'
import { THEATER_SEEK } from '@/components/theater/useTheaterStageEvents'

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

  it('exposes the line as a seekable slider with a larger invisible hit area', () => {
    const { container } = render(<TheaterProgressLine itemKey="youtube:1" kind="video" />)
    const slider = container.querySelector('[data-theater-progress-slider]') as HTMLInputElement
    const fill = container.querySelector('[data-theater-progress-fill]') as HTMLElement
    const seek = vi.fn()
    window.addEventListener(THEATER_SEEK, seek)
    try {
      expect(slider).toHaveAttribute('aria-label', 'Playback position')
      expect(slider.className).toContain('h-11')

      fireEvent.input(slider, { target: { value: '375' } })

      expect(fill.style.width).toBe('37.5%')
      expect(slider).toHaveAttribute('aria-valuetext', '38%')
      expect(seek).toHaveBeenCalledTimes(1)
      expect((seek.mock.calls[0][0] as CustomEvent).detail).toEqual({ progress: 0.375 })
    } finally {
      window.removeEventListener(THEATER_SEEK, seek)
    }
  })

  it('resumes progress updates after a pointer or touch scrub is canceled', () => {
    const { container } = render(<TheaterProgressLine itemKey="youtube:1" kind="video" />)
    const slider = container.querySelector('[data-theater-progress-slider]') as HTMLInputElement
    const fill = container.querySelector('[data-theater-progress-fill]') as HTMLElement

    fireEvent.pointerDown(slider)
    act(() => {
      window.dispatchEvent(
        new CustomEvent('theater-video-progress', { detail: { progress: 0.25 } }),
      )
    })
    expect(fill.style.width).toBe('0%')

    fireEvent.pointerCancel(slider)
    act(() => {
      window.dispatchEvent(
        new CustomEvent('theater-video-progress', { detail: { progress: 0.25 } }),
      )
    })
    expect(fill.style.width).toBe('25%')

    fireEvent.touchStart(slider)
    fireEvent.touchCancel(slider)
    act(() => {
      window.dispatchEvent(new CustomEvent('theater-video-progress', { detail: { progress: 0.5 } }))
    })
    expect(fill.style.width).toBe('50%')
  })

  it('scrubs a timed post to the requested dwell position', () => {
    const { container } = render(<TheaterProgressLine itemKey="photo:1" kind="timed" />)
    const fill = container.querySelector('[data-theater-progress-fill]') as HTMLElement

    act(() => {
      window.dispatchEvent(new CustomEvent(THEATER_SEEK, { detail: { progress: 0.6 } }))
    })

    expect(fill.style.width).toBe('60%')
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
