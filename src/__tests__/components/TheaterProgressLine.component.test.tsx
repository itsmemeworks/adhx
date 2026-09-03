/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest'
import { render, act, fireEvent } from '@testing-library/react'
import { formatPlaybackTime, TheaterProgressLine } from '@/components/theater/TheaterProgressLine'
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

  it('shows a drag-following elapsed/duration badge only while scrubbing', () => {
    const { container } = render(<TheaterProgressLine itemKey="video:1" kind="video" />)
    const slider = container.querySelector('[data-theater-progress-slider]') as HTMLInputElement
    const badge = container.querySelector('[data-theater-scrub-time]') as HTMLElement

    expect(badge).toHaveAttribute('aria-hidden', 'true')
    expect(badge).toHaveClass('opacity-0')
    act(() => {
      window.dispatchEvent(
        new CustomEvent('theater-video-progress', {
          detail: { progress: 0.25, duration: 125 },
        }),
      )
    })
    expect(slider).toHaveAttribute('aria-valuetext', '0:31 of 2:05')

    fireEvent.pointerDown(slider)
    fireEvent.input(slider, { target: { value: '400' } })
    expect(badge).toHaveAttribute('aria-hidden', 'true')
    expect(badge).toHaveTextContent('0:50 / 2:05')
    expect(badge.style.left).toBe('')
    expect(badge.style.opacity).toBe('1')
    expect(badge).toHaveClass('w-max', 'min-w-[7rem]', 'whitespace-nowrap')
    expect(badge.parentElement).toHaveClass(
      'fixed',
      'inset-x-0',
      'z-[74]',
      'justify-center',
      'top-[calc(env(safe-area-inset-top)+0.5rem)]',
    )

    fireEvent.pointerUp(slider)
    expect(badge).toHaveAttribute('aria-hidden', 'true')
    expect(badge.style.opacity).toBe('0')
  })

  it('formats long playback durations without dropping hours', () => {
    expect(formatPlaybackTime(7)).toBe('0:07')
    expect(formatPlaybackTime(3_725)).toBe('1:02:05')
  })

  it('shows target time when duration arrives during the first scrub', () => {
    const { container } = render(<TheaterProgressLine itemKey="video:first" kind="video" />)
    const slider = container.querySelector('[data-theater-progress-slider]') as HTMLInputElement
    const badge = container.querySelector('[data-theater-scrub-time]') as HTMLElement

    fireEvent.pointerDown(slider)
    fireEvent.input(slider, { target: { value: '600' } })
    expect(badge.style.opacity).not.toBe('1')

    act(() => {
      window.dispatchEvent(
        new CustomEvent('theater-video-progress', {
          detail: { progress: 0, duration: 90 },
        }),
      )
    })
    expect(badge).toHaveTextContent('0:54 / 1:30')
    expect(badge.style.opacity).toBe('1')
  })

  it('places the desktop line above the filmstrip and hides it with de-clutter', () => {
    const { container, rerender } = render(
      <TheaterProgressLine itemKey="video:desktop" kind="video" desktopDock />,
    )
    const slider = container.querySelector('[data-theater-progress-slider]') as HTMLElement
    const fill = container.querySelector('[data-theater-progress-fill]') as HTMLElement
    const track = fill.parentElement
    const badge = container.querySelector('[data-theater-scrub-time]') as HTMLElement

    expect(slider).toHaveClass('bottom-[124px]', 'top-auto', 'h-9', 'z-[70]')
    expect(track).toHaveClass('bottom-[124px]', 'top-auto', 'h-1', 'z-[72]')
    expect(track).toHaveClass('peer-focus-visible:bg-white/40', 'peer-focus-visible:brightness-125')
    expect(track).not.toHaveClass('peer-focus:ring-2')
    expect(fill).toHaveClass('bg-[#f07f4c]')
    expect(badge.parentElement).toHaveClass(
      'fixed',
      'inset-x-0',
      'bottom-[calc(124px+0.25rem)]',
      'z-[74]',
      'justify-center',
    )
    expect(badge).toHaveClass('whitespace-nowrap')

    rerender(<TheaterProgressLine itemKey="video:desktop" kind="video" desktopDock hidden />)
    expect(slider).toHaveClass('pointer-events-none')
    expect(slider).toBeDisabled()
    expect(track).toHaveClass('opacity-0')
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
