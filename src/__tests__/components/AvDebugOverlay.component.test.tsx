/**
 * @vitest-environment jsdom
 *
 * `?avdebug=1` breadcrumbs need a Mac tether to read on iOS Safari — too much
 * friction for the owner to reach for on every retest. This mirrors them into
 * a tiny on-screen overlay instead, so a phone screenshot is enough. Covers:
 * zero footprint by default, renders once the param is present, shows
 * appended lines (with dedupe-and-count), and caps at the rolling 8-line
 * window.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import {
  AvDebugOverlay,
  logSV,
  logAV,
  isAvDebugEnabled,
  resetAvDebugLines,
} from '@/components/theater/AvDebugOverlay'

describe('AvDebugOverlay', () => {
  const originalUrl = window.location.href

  afterEach(() => {
    window.history.replaceState(null, '', originalUrl)
    resetAvDebugLines()
  })

  it('renders nothing by default (avdebug not enabled)', () => {
    logSV('this should never be recorded')
    const { container } = render(<AvDebugOverlay />)
    expect(container.firstChild).toBeNull()
    expect(isAvDebugEnabled()).toBe(false)
  })

  it('ignores the retired ?ytdebug=1 param', () => {
    window.history.replaceState(null, '', '/?ytdebug=1')
    expect(isAvDebugEnabled()).toBe(false)
  })

  it('renders once ?avdebug=1 is present, even with no lines yet', () => {
    window.history.replaceState(null, '', '/?avdebug=1')
    const { container } = render(<AvDebugOverlay />)
    expect(container.firstChild).not.toBeNull()
    expect(container.textContent).toMatch(/waiting for events/i)
  })

  it('shows a line appended after the overlay is already mounted', () => {
    window.history.replaceState(null, '', '/?avdebug=1')
    const { container } = render(<AvDebugOverlay />)

    act(() => {
      logSV('mount item platform=twitter initialMuted=true')
    })

    expect(container.textContent).toContain('[sv] mount item platform=twitter')
  })

  it('shows a line already in the ring buffer at mount time (initial snapshot)', () => {
    window.history.replaceState(null, '', '/?avdebug=1')
    logSV('play() rejected NotAllowedError')

    const { container } = render(<AvDebugOverlay />)

    expect(container.textContent).toContain('play() rejected NotAllowedError')
  })

  it('collapses immediate repeats into one line with a count instead of filling the window with duplicates', () => {
    window.history.replaceState(null, '', '/?avdebug=1')
    const { container } = render(<AvDebugOverlay />)

    act(() => {
      logSV('catch-up reverted')
      logSV('catch-up reverted')
      logSV('catch-up reverted')
    })

    const matches = container.textContent?.match(/catch-up reverted/g) ?? []
    expect(matches.length).toBe(1)
    expect(container.textContent).toContain('×3')
  })

  it('keeps only the last 8 lines (rolling window)', () => {
    window.history.replaceState(null, '', '/?avdebug=1')
    const { container } = render(<AvDebugOverlay />)

    act(() => {
      for (let i = 0; i < 12; i++) logSV(`line ${i}`)
    })

    expect(container.textContent).not.toContain('line 0')
    expect(container.textContent).not.toContain('line 3')
    expect(container.textContent).toContain('line 4')
    expect(container.textContent).toContain('line 11')
  })

  it('prefixes StageVideo lines [sv] and audio-button taps [av] in the same window', () => {
    window.history.replaceState(null, '', '/?avdebug=1')
    const { container } = render(<AvDebugOverlay />)
    act(() => {
      logSV('play() rejected NotAllowedError')
      logAV('audio tap: displayed=muted -> requesting unmuted')
    })
    expect(container.textContent).toContain('[sv] play() rejected')
    expect(container.textContent).toContain('[av] audio tap')
  })
})
