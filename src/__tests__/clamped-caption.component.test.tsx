// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import { ClampedCaption } from '@/components/previews/ClampedCaption'

/**
 * Regression cover for the "no Show more" bug.
 *
 * The original code clamped the text whenever the post had media, but only
 * rendered the toggle when `text.length > 180`. A real 179-character post
 * (adhx.com/AMAZlNGNATURE/status/2082734821009490153) therefore got clipped
 * with no way to read the rest. The fix measures actual overflow, so these
 * tests drive the measurement rather than a length threshold.
 */

/** jsdom has no layout, so fake the clamped/unclamped box metrics. */
function mockMetrics({
  scrollHeight,
  clientHeight,
}: {
  scrollHeight: number
  clientHeight: number
}) {
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get() {
      return scrollHeight
    },
  })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get() {
      return clientHeight
    },
  })
}

beforeEach(() => {
  // ResizeObserver isn't implemented in jsdom.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  // @ts-expect-error - restore jsdom's own (0-returning) implementations
  delete HTMLElement.prototype.scrollHeight
  // @ts-expect-error - see above
  delete HTMLElement.prototype.clientHeight
})

describe('ClampedCaption', () => {
  // The exact text from the reported post: 179 chars, under the old 180 gate,
  // but it wraps past 3 lines because of the blank line in the middle.
  const REPORTED_TEXT =
    'Apparently, patio sofas are irresistible to wild foxes\n\nFoxes have become increasingly comfortable living alongside humans, often showing surprisingly relaxed and curious behavior'

  it('offers Show more for the 179-char post that the old length gate missed', () => {
    expect(REPORTED_TEXT.length).toBeLessThan(180) // would have failed the old `> 180` check
    mockMetrics({ scrollHeight: 120, clientHeight: 72 }) // clipped: 5 lines into a 3-line box

    render(<ClampedCaption clamp>{REPORTED_TEXT}</ClampedCaption>)

    expect(screen.getByRole('button', { name: 'Show more' })).toBeTruthy()
  })

  it('expands to reveal the full text and offers Show less', () => {
    mockMetrics({ scrollHeight: 120, clientHeight: 72 })
    render(<ClampedCaption clamp>{REPORTED_TEXT}</ClampedCaption>)

    const button = screen.getByRole('button', { name: 'Show more' })
    act(() => button.click())

    expect(screen.getByRole('button', { name: 'Show less' })).toBeTruthy()
    expect(button.getAttribute('aria-expanded')).toBe('true')
  })

  it('drops the clamp class when expanded so the whole post renders', () => {
    mockMetrics({ scrollHeight: 120, clientHeight: 72 })
    const { container } = render(<ClampedCaption clamp>{REPORTED_TEXT}</ClampedCaption>)
    const p = container.querySelector('p')!

    expect(p.className).toContain('line-clamp-3')

    act(() => screen.getByRole('button', { name: 'Show more' }).click())

    expect(p.className).not.toContain('line-clamp-3')
    expect(p.className).toContain('whitespace-pre-wrap')
  })

  it('shows no toggle when the text fits inside the clamp', () => {
    mockMetrics({ scrollHeight: 24, clientHeight: 24 }) // one line, not clipped
    render(<ClampedCaption clamp>Short caption</ClampedCaption>)

    expect(screen.queryByRole('button')).toBeNull()
  })

  it('never clamps or offers a toggle when clamp is false (text-only posts)', () => {
    mockMetrics({ scrollHeight: 500, clientHeight: 72 }) // would look clipped if measured
    const { container } = render(<ClampedCaption clamp={false}>{REPORTED_TEXT}</ClampedCaption>)

    expect(container.querySelector('p')!.className).not.toContain('line-clamp')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('keeps the full text in the DOM while collapsed (crawlers still see it)', () => {
    mockMetrics({ scrollHeight: 120, clientHeight: 72 })
    const { container } = render(<ClampedCaption clamp>{REPORTED_TEXT}</ClampedCaption>)

    // Clamping is visual only — the whole string is present, unsliced.
    expect(container.querySelector('p')!.textContent).toBe(REPORTED_TEXT)
  })

  // A paragraph break used to burn one of the three preview lines (the tweet
  // renderer emits real <br> tags), so the reported post previewed as a lone
  // "…". While collapsed we suppress the empty line; expanding restores it.
  it('collapses blank lines while clamped and restores them when expanded', () => {
    mockMetrics({ scrollHeight: 120, clientHeight: 72 })
    const { container } = render(
      <ClampedCaption clamp>
        <span>
          <span>Line one</span>
          <br />
          <span />
          <br />
          <span>Line two</span>
        </span>
      </ClampedCaption>,
    )
    const p = container.querySelector('p')!

    expect(p.className).toContain('[&_span:empty]:hidden')
    expect(p.className).toContain('[&_span:empty+br]:hidden')

    act(() => screen.getByRole('button', { name: 'Show more' }).click())

    // Expanded: paragraph spacing comes back via whitespace-pre-wrap.
    expect(p.className).not.toContain('[&_span:empty]:hidden')
    expect(p.className).toContain('whitespace-pre-wrap')
  })
})
