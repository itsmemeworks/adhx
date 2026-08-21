/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TheaterMobileChrome } from '@/components/theater/TheaterMobileChrome'
import type { TheaterItem, TheaterTriageChrome } from '@/components/theater/types'

/**
 * Save-is-always-primary / Download-is-secondary on the mobile bottom scrim —
 * the mobile counterpart of the desktop chrome's button-hierarchy tests. Save
 * drives account signups, so it must always carry the clay-grad primary
 * treatment; Download is a power-user affordance and stays on the glass
 * secondary style, matching Share/Open. See TASK 1 of the
 * save-primary-image-download PR.
 */

const mockUseSendFile = vi.fn((..._args: unknown[]) => ({
  supported: false,
  ready: false,
  sending: false,
  mode: 'download' as const,
  send: vi.fn(),
}))

vi.mock('@/components/theater/useSendFile', () => ({
  useSendFile: (...args: unknown[]) => mockUseSendFile(...args),
}))

function videoItem(overrides: Partial<TheaterItem> = {}): TheaterItem {
  return {
    action: 'save',
    platform: 'twitter',
    bookmarkId: '1',
    author: 'alice',
    authorName: 'Alice',
    text: 'a caption for the video',
    thumbnailUrl: 'https://example.com/thumb.jpg',
    authorAvatarUrl: null,
    url: '/alice/status/1',
    createdAt: '2026-08-18T00:00:00Z',
    saveCount: 1,
    trendCount: 1,
    contentType: 'video',
    ...overrides,
  } as TheaterItem
}

function textItem(overrides: Partial<TheaterItem> = {}): TheaterItem {
  return {
    action: 'save',
    platform: 'twitter',
    bookmarkId: '2',
    author: 'bob',
    authorName: 'Bob',
    text: 'a text-only post with no media',
    thumbnailUrl: null,
    authorAvatarUrl: null,
    url: '/bob/status/2',
    createdAt: '2026-08-18T00:00:00Z',
    saveCount: 1,
    trendCount: 1,
    ...overrides,
  } as TheaterItem
}

const base = {
  mode: 'home' as const,
  items: [] as TheaterItem[],
  currentKey: null as string | null,
  isSeen: () => false,
  seenReady: true,
  freshKeys: new Set<string>(),
  newCount: 0,
  onSelect: vi.fn(),
  onPrev: vi.fn(),
  onNext: vi.fn(),
  canPrev: true,
  canNext: true,
  muted: true,
  onToggleMute: vi.fn(),
}

beforeEach(() => {
  mockUseSendFile.mockReturnValue({
    supported: false,
    ready: false,
    sending: false,
    mode: 'download' as const,
    send: vi.fn(),
  })
})

describe('TheaterMobileChrome: Save/Download button hierarchy', () => {
  it('sign-in prompt Save is primary (bg-clay-grad)', () => {
    render(<TheaterMobileChrome {...base} current={videoItem()} />)
    const saveBtn = screen.getByText('Save').closest('button')!
    expect(saveBtn.className).toContain('bg-clay-grad')
  })

  it('Download is secondary (glass), never bg-clay-grad', () => {
    mockUseSendFile.mockReturnValue({
      supported: true,
      ready: true,
      sending: false,
      mode: 'download' as const,
      send: vi.fn(),
    })
    render(<TheaterMobileChrome {...base} current={videoItem()} />)
    const downloadBtn = screen.getByText('Download').closest('button')!
    expect(downloadBtn.className).not.toContain('bg-clay-grad')
    expect(downloadBtn.className).toContain('border-white/25')

    const saveBtn = screen.getByText('Save').closest('button')!
    expect(saveBtn.className).toContain('bg-clay-grad')
  })

  it('triage live-tab Save is primary, Download (when present) stays secondary', () => {
    mockUseSendFile.mockReturnValue({
      supported: true,
      ready: true,
      sending: false,
      mode: 'download' as const,
      send: vi.fn(),
    })
    const triage: TheaterTriageChrome = {
      tab: 'live',
      onTabChange: vi.fn(),
      onDone: vi.fn(),
      onLater: vi.fn(),
      onDelete: vi.fn(),
      onTag: vi.fn(),
      onSave: vi.fn(),
      onLiveTag: vi.fn(),
      savedKeys: new Set<string>(),
      remaining: 0,
      streak: { current: 0, longest: 0 },
      onClose: vi.fn(),
    }
    render(<TheaterMobileChrome {...base} current={videoItem()} triage={triage} />)

    const saveBtn = screen.getByText('Save').closest('button')!
    expect(saveBtn.className).toContain('bg-clay-grad')

    const downloadBtn = screen.getByText('Download').closest('button')!
    expect(downloadBtn.className).not.toContain('bg-clay-grad')
  })

  it('renders Live before My Collection, not the bare "Collection" label', () => {
    const triage: TheaterTriageChrome = {
      tab: 'live',
      onTabChange: vi.fn(),
      onDone: vi.fn(),
      onLater: vi.fn(),
      onDelete: vi.fn(),
      onTag: vi.fn(),
      onSave: vi.fn(),
      onLiveTag: vi.fn(),
      savedKeys: new Set<string>(),
      remaining: 0,
      streak: { current: 0, longest: 0 },
      onClose: vi.fn(),
    }
    render(<TheaterMobileChrome {...base} current={videoItem()} triage={triage} />)

    expect(screen.queryByText('Collection')).not.toBeInTheDocument()
    const liveTab = screen.getByText('Live', { selector: 'button' })
    const collectionTab = screen.getByText('My Collection')
    expect(
      liveTab.compareDocumentPosition(collectionTab) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })
})

describe('TheaterMobileChrome: text posts', () => {
  it('text posts never show Download (nothing sendable)', () => {
    render(<TheaterMobileChrome {...base} current={textItem()} />)
    expect(screen.queryByText('Download')).not.toBeInTheDocument()
  })
})

// De-cluttering EXPANDS the stage (owner review: the previous icon was
// backwards) — entering it reads outward (Maximize2); exiting reads inward
// (Minimize2).
describe('TheaterMobileChrome: de-clutter icon', () => {
  it('shows the outward (Maximize2) icon before de-cluttering, then swaps to Minimize2', () => {
    render(<TheaterMobileChrome {...base} current={videoItem()} />)
    const toggle = screen.getByLabelText('Hide controls')
    expect(toggle.querySelector('.lucide-maximize-2')).toBeInTheDocument()
    expect(toggle.querySelector('.lucide-minimize-2')).not.toBeInTheDocument()

    fireEvent.click(toggle)
    const restored = screen.getByLabelText('Show controls')
    expect(restored.querySelector('.lucide-minimize-2')).toBeInTheDocument()
    expect(restored.querySelector('.lucide-maximize-2')).not.toBeInTheDocument()
  })
})

// The drag mechanics themselves (live-follow, snap thresholds, flick
// velocity, tap classification) are unit-tested against the hook directly in
// use-sheet-drag.component.test.tsx — jsdom pointer-event sequences are
// flaky to simulate reliably through a full component render. This just
// confirms the handle is wired to the hook end to end: it toggles via the
// tap/click path and carries `touch-action: none` so the browser doesn't
// claim the gesture for scrolling.
describe('TheaterMobileChrome: Up-next sheet drag handle wiring', () => {
  it("the handle toggles the sheet via click (the hook's tap/keyboard path) and is touch-action: none", () => {
    render(<TheaterMobileChrome {...base} current={videoItem()} />)
    // Both the drag handle and the center "Up next" label button share this
    // aria-label — find the handle specifically by its drag-pill child.
    const findHandle = () =>
      screen
        .getAllByLabelText(/(Expand|Collapse) up next/)
        .find((el) => el.querySelector('span[aria-hidden]'))!

    const handle = findHandle()
    expect(handle).toHaveAttribute('aria-label', 'Expand up next')
    expect(handle.className).toContain('touch-none')

    fireEvent.click(handle)
    expect(findHandle()).toHaveAttribute('aria-label', 'Collapse up next')

    fireEvent.click(findHandle())
    expect(findHandle()).toHaveAttribute('aria-label', 'Expand up next')
  })
})

// The brand logo in the collection top scrim is ALWAYS a plain home link,
// for owners and non-owners alike — it used to open the "Make your own"
// modal for non-owners instead, which left a visitor viewing a shared tag
// with no way back to the main theater (owner override). Conversion for
// signed-out non-owner viewers is carried entirely by the Save-collection
// CTA in the bottom scrim, not the logo.
describe('TheaterMobileChrome: collection mode brand logo is always home', () => {
  it('non-owner: the brand logo is a home link, not a make-your-own trigger', () => {
    render(
      <TheaterMobileChrome
        {...base}
        current={videoItem()}
        collection={{ tag: 'claude-code', curator: 'weedauwl', count: 12 }}
        isCollectionOwner={false}
      />,
    )
    // The make-your-own affordance is gone from this component entirely —
    // the prop no longer exists, so there is nothing the logo could fire.
    expect(screen.queryByLabelText('Make your own collection')).not.toBeInTheDocument()
    const home = screen.getByLabelText('ADHX home')
    expect(home.tagName).toBe('A')
    expect(home).toHaveAttribute('href', '/')
  })

  it('owner: the brand logo is also a plain home link', () => {
    render(
      <TheaterMobileChrome
        {...base}
        current={videoItem()}
        collection={{ tag: 'claude-code', curator: 'weedauwl', count: 12 }}
        isCollectionOwner
      />,
    )
    expect(screen.queryByLabelText('Make your own collection')).not.toBeInTheDocument()
    expect(screen.getByLabelText('ADHX home')).toHaveAttribute('href', '/')
  })

  it('non-owner: the Save-collection CTA is still present, carrying signed-out conversion', () => {
    render(
      <TheaterMobileChrome
        {...base}
        current={videoItem()}
        collection={{ tag: 'claude-code', curator: 'weedauwl', count: 12 }}
        isCollectionOwner={false}
      />,
    )
    expect(screen.getByText('Save collection · 12')).toBeInTheDocument()
  })
})

// Owner (mobile screenshot): a shared post repeats until deliberate
// navigation, but the peek bar still read "Up next" with no cue — the loop
// looked like a bug. Swap the label for a Repeat glyph + "On repeat" while
// pinned, and accent the next chevron (the deliberate way past the loop).
describe('TheaterMobileChrome: shared-post-repeat cue', () => {
  it('shows "On repeat" instead of "Up next" while pinned', () => {
    render(<TheaterMobileChrome {...base} current={videoItem()} repeatCurrent />)
    expect(screen.getByText('On repeat')).toBeInTheDocument()
    expect(screen.queryByText('Up next')).not.toBeInTheDocument()
  })

  it('reverts to "Up next" once unpinned', () => {
    render(<TheaterMobileChrome {...base} current={videoItem()} />)
    expect(screen.getByText('Up next')).toBeInTheDocument()
    expect(screen.queryByText('On repeat')).not.toBeInTheDocument()
  })

  it('tapping the "On repeat" label still opens the up-next sheet (same tap behavior)', () => {
    render(<TheaterMobileChrome {...base} current={videoItem()} repeatCurrent />)
    const label = screen.getByText('On repeat').closest('button')!
    expect(label).toHaveAttribute('aria-label', 'Expand up next')
    fireEvent.click(label)
    expect(label).toHaveAttribute('aria-label', 'Collapse up next')
  })

  it('accents the next chevron with the clay treatment while pinned and enabled', () => {
    render(<TheaterMobileChrome {...base} current={videoItem()} repeatCurrent canNext />)
    expect(screen.getByLabelText('Next post').className).toContain('text-clay')
  })

  it('does not accent the next chevron when not pinned', () => {
    render(<TheaterMobileChrome {...base} current={videoItem()} canNext />)
    expect(screen.getByLabelText('Next post').className).not.toContain('text-clay')
  })

  it('does not accent a disabled next chevron even while pinned (nowhere to go)', () => {
    render(<TheaterMobileChrome {...base} current={videoItem()} repeatCurrent canNext={false} />)
    expect(screen.getByLabelText('Next post').className).not.toContain('text-clay')
  })
})
