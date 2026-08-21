/**
 * @vitest-environment jsdom
 *
 * Round 6: the `?ytdebug=1` breadcrumbs need a Mac tether to read on iOS
 * Safari — too much friction for the owner to reach for on every retest.
 * This mirrors them into a tiny on-screen overlay instead, so a phone
 * screenshot is enough. Covers: zero footprint by default, renders once the
 * param is present, shows appended lines (with dedupe-and-count), and caps
 * at the rolling 8-line window.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import {
  YtDebugOverlay,
  logStage,
  logStageVerbose,
  logSV,
  logAV,
  isYtDebugEnabled,
  resetYtDebugLines,
} from '@/components/theater/YtDebugOverlay'

describe('YtDebugOverlay', () => {
  const originalUrl = window.location.href

  afterEach(() => {
    window.history.replaceState(null, '', originalUrl)
    resetYtDebugLines()
  })

  it('renders nothing by default (ytdebug not enabled)', () => {
    logStage('this should never be recorded')
    const { container } = render(<YtDebugOverlay />)
    expect(container.firstChild).toBeNull()
  })

  it('renders once ?ytdebug=1 is present, even with no lines yet', () => {
    window.history.replaceState(null, '', '/?ytdebug=1')
    const { container } = render(<YtDebugOverlay />)
    expect(container.firstChild).not.toBeNull()
    expect(container.textContent).toMatch(/waiting for events/i)
  })

  it('shows a line appended via logStage after the overlay is already mounted', () => {
    window.history.replaceState(null, '', '/?ytdebug=1')
    const { container } = render(<YtDebugOverlay />)

    act(() => {
      logStage('onReady -> mute, playVideo')
    })

    expect(container.textContent).toContain('onReady -> mute, playVideo')
  })

  it('shows a line already in the ring buffer at mount time (initial snapshot)', () => {
    window.history.replaceState(null, '', '/?ytdebug=1')
    logStage('state -> playing (1)')

    const { container } = render(<YtDebugOverlay />)

    expect(container.textContent).toContain('state -> playing (1)')
  })

  it('collapses immediate repeats into one line with a count instead of filling the window with duplicates', () => {
    window.history.replaceState(null, '', '/?ytdebug=1')
    const { container } = render(<YtDebugOverlay />)

    act(() => {
      logStage('infoDelivery muted:true contradicts last command (false) — ignored as stale')
      logStage('infoDelivery muted:true contradicts last command (false) — ignored as stale')
      logStage('infoDelivery muted:true contradicts last command (false) — ignored as stale')
    })

    const matches = container.textContent?.match(/ignored as stale/g) ?? []
    expect(matches.length).toBe(1)
    expect(container.textContent).toContain('×3')
  })

  it('keeps only the last 8 lines (rolling window)', () => {
    window.history.replaceState(null, '', '/?ytdebug=1')
    const { container } = render(<YtDebugOverlay />)

    act(() => {
      for (let i = 0; i < 12; i++) logStage(`line ${i}`)
    })

    expect(container.textContent).not.toContain('line 0')
    expect(container.textContent).not.toContain('line 3')
    expect(container.textContent).toContain('line 4')
    expect(container.textContent).toContain('line 11')
  })

  it('logStageVerbose never appends to the ring buffer (console-only, for high-volume entries)', () => {
    window.history.replaceState(null, '', '/?ytdebug=1')
    const { container } = render(<YtDebugOverlay />)

    act(() => {
      logStageVerbose('message', 'infoDelivery', { playerState: 1 })
    })

    expect(container.textContent).toMatch(/waiting for events/i)
  })

  // Gesture-unmute fix: the overlay now serves StageVideo and the shared
  // chrome's audio button too, not just StageYouTube — gate widened to
  // `?avdebug=1` (either param works) and lines carry a source prefix.
  describe('widened gate (?avdebug=1) and multi-source prefixes', () => {
    it('is disabled with neither param', () => {
      expect(isYtDebugEnabled()).toBe(false)
    })

    it('enables via ?avdebug=1 (not just ?ytdebug=1)', () => {
      window.history.replaceState(null, '', '/?avdebug=1')
      expect(isYtDebugEnabled()).toBe(true)
    })

    it('logSV (StageVideo) lines are prefixed [sv]', () => {
      window.history.replaceState(null, '', '/?avdebug=1')
      const { container } = render(<YtDebugOverlay />)
      act(() => {
        logSV('mount item platform=twitter initialMuted=true')
      })
      expect(container.textContent).toContain('[sv]')
      expect(container.textContent).toContain('mount item platform=twitter')
    })

    it('logAV (chrome audio-button tap) lines are prefixed [av]', () => {
      window.history.replaceState(null, '', '/?avdebug=1')
      const { container } = render(<YtDebugOverlay />)
      act(() => {
        logAV('audio tap: displayed=muted -> requesting unmuted')
      })
      expect(container.textContent).toContain('[av]')
      expect(container.textContent).toContain('displayed=muted')
    })

    it('logStage (StageYouTube) lines are prefixed [yt], distinguishing them from [sv]/[av] in the same window', () => {
      window.history.replaceState(null, '', '/?avdebug=1')
      const { container } = render(<YtDebugOverlay />)
      act(() => {
        logStage('state -> playing (1)')
        logSV('play() rejected NotAllowedError')
        logAV('audio tap: displayed=unmuted -> requesting muted')
      })
      expect(container.textContent).toContain('[yt] state -> playing (1)')
      expect(container.textContent).toContain('[sv] play() rejected')
      expect(container.textContent).toContain('[av] audio tap')
    })

    it('logSV/logAV stay silent (no console, no ring buffer) when neither param is present', () => {
      const { container } = render(<YtDebugOverlay />)
      act(() => {
        logSV('should never be recorded')
        logAV('should never be recorded either')
      })
      expect(container.firstChild).toBeNull()
    })
  })
})
