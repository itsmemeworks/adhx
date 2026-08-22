/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TheaterMobileChrome } from '@/components/theater/TheaterMobileChrome'
import { theaterItemKey } from '@/components/theater/types'
import type { TheaterItem, TheaterPersonalChrome } from '@/components/theater/types'

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

// Captures the props TheaterMobileChrome passes down, so the `theaterActive`
// wiring tests below can assert on it directly rather than through
// TheaterAvatarMenu's own rendering (which the global setup-components.ts
// mock pins `usePathname()` to '/' for, making `isHome` true regardless of
// `theaterActive` — no observable behavioral difference to assert on there).
const mockTheaterAvatarMenu = vi.fn((_props: Record<string, unknown>) => null)
vi.mock('@/components/theater/TheaterAvatarMenu', () => ({
  TheaterAvatarMenu: (props: Record<string, unknown>) => mockTheaterAvatarMenu(props),
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
  onSetMuted: vi.fn(),
}

beforeEach(() => {
  mockUseSendFile.mockReturnValue({
    supported: false,
    ready: false,
    sending: false,
    mode: 'download' as const,
    send: vi.fn(),
  })
  mockTheaterAvatarMenu.mockClear()
})

/**
 * The peek bar's centre label. Two buttons carry the "Expand up next" label
 * (the drag handle above it does too), so pick the one that actually holds
 * text — the handle is a bare chevron.
 */
function peekCentreText(): string {
  const labelled = screen
    .getAllByLabelText(/up next/i)
    .filter((el) => (el.textContent ?? '').trim().length > 0)
  expect(labelled).toHaveLength(1)
  return (labelled[0].textContent ?? '').trim()
}

// Mobile action row is icon-only. Save keeps a clay border on the same
// 44px glass circle as Share/Open; Download stays `border-white/25`.
describe('TheaterMobileChrome: Save/Download button hierarchy', () => {
  it('sign-in prompt Save is outlined with a clay border, never the old solid fill', () => {
    render(<TheaterMobileChrome {...base} current={videoItem()} />)
    const saveBtn = screen.getByRole('button', { name: 'Save' })
    expect(saveBtn.className).toContain('border-clay')
    expect(saveBtn.className).not.toContain('bg-clay-grad')
    expect(saveBtn).not.toHaveTextContent('Save')
    expect(saveBtn.parentElement?.className).toContain('justify-end')
  })

  it("Download is secondary (glass, border-white/25), distinct from Save's clay border", () => {
    mockUseSendFile.mockReturnValue({
      supported: true,
      ready: true,
      sending: false,
      mode: 'download' as const,
      send: vi.fn(),
    })
    render(<TheaterMobileChrome {...base} current={videoItem()} />)
    const downloadBtn = screen.getByRole('button', { name: 'Download' })
    expect(downloadBtn.className).not.toContain('border-clay')
    expect(downloadBtn.className).toContain('border-white/25')
    expect(downloadBtn).not.toHaveTextContent('Download')

    const saveBtn = screen.getByRole('button', { name: 'Save' })
    expect(saveBtn.className).toContain('border-clay')
  })

  it('collection live-tab Save carries the clay-border outline, Download (when present) stays plain glass', () => {
    mockUseSendFile.mockReturnValue({
      supported: true,
      ready: true,
      sending: false,
      mode: 'download' as const,
      send: vi.fn(),
    })
    const collection: TheaterPersonalChrome = {
      tab: 'live',
      onTabChange: vi.fn(),
      onDone: vi.fn(),
      onTag: vi.fn(),
      onSave: vi.fn(),
      onLiveTag: vi.fn(),
      savedKeys: new Set<string>(),
      remaining: 0,
      onClose: vi.fn(),
    }
    render(<TheaterMobileChrome {...base} current={videoItem()} collection={collection} />)

    const saveBtn = screen.getByRole('button', { name: 'Save' })
    expect(saveBtn.className).toContain('border-clay')
    expect(saveBtn).not.toHaveTextContent('Save')

    const downloadBtn = screen.getByRole('button', { name: 'Download' })
    expect(downloadBtn.className).not.toContain('border-clay')
  })

  it('collection tab uses Live actions plus Archive — no Later or Delete', () => {
    mockUseSendFile.mockReturnValue({
      supported: true,
      ready: true,
      sending: false,
      mode: 'download' as const,
      send: vi.fn(),
    })
    const collection: TheaterPersonalChrome = {
      tab: 'collection',
      onTabChange: vi.fn(),
      onDone: vi.fn(),
      onTag: vi.fn(),
      onSave: vi.fn(),
      onLiveTag: vi.fn(),
      savedKeys: new Set<string>(),
      remaining: 3,
      onClose: vi.fn(),
    }
    render(<TheaterMobileChrome {...base} current={videoItem()} collection={collection} />)
    expect(screen.getByRole('button', { name: 'Download' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Share link' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tag' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open on X' })).toBeInTheDocument()
    const archive = screen.getByRole('button', { name: 'Archive' })
    expect(archive).toBeInTheDocument()
    expect(archive.className).toContain('rounded-full')
    expect(archive.className).not.toContain('flex-col')
    expect(archive.className).not.toContain('bg-done')
    expect(screen.queryByRole('button', { name: 'Later' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
  })

  /**
   * The Live ⇄ My Collection switch is NOT a control this chrome draws. A tab
   * pill in the top scrim overlapped the logo, trend/time chips and paste
   * button at phone widths (owner), so mobile hands the pair to the burger as
   * Theater sub-options and desktop keeps its top-bar pill. What this chrome
   * owes is the wiring; the rendering is TheaterAvatarMenu's test.
   */
  it('hands the Live/Collection switch to the burger instead of drawing tabs', () => {
    const onTabChange = vi.fn()
    const collection: TheaterPersonalChrome = {
      tab: 'live',
      onTabChange,
      onDone: vi.fn(),
      onTag: vi.fn(),
      onSave: vi.fn(),
      onLiveTag: vi.fn(),
      savedKeys: new Set<string>(),
      remaining: 0,
      onClose: vi.fn(),
    }
    render(<TheaterMobileChrome {...base} current={videoItem()} collection={collection} />)

    expect(mockTheaterAvatarMenu).toHaveBeenCalledWith(
      expect.objectContaining({ theaterTabs: { tab: 'live', onTabChange } }),
    )
    // No tab buttons of its own — in the scrim or the peek bar.
    expect(screen.queryByText('My Collection')).not.toBeInTheDocument()
    expect(screen.queryByText('Collection')).not.toBeInTheDocument()
    expect(screen.queryByText('Live', { selector: 'button' })).not.toBeInTheDocument()
  })

  /**
   * The slot the tabs vacated: the peek bar's centre now carries the queue
   * position in the collection theater too (owner asked the count to be boundary-aware, and
   * collection was the one mode with nowhere to put it).
   */
  it('spends the freed peek-bar centre on the queue position', () => {
    const collection: TheaterPersonalChrome = {
      tab: 'collection',
      onTabChange: vi.fn(),
      onDone: vi.fn(),
      onTag: vi.fn(),
      onSave: vi.fn(),
      onLiveTag: vi.fn(),
      savedKeys: new Set<string>(),
      remaining: 0,
      onClose: vi.fn(),
    }
    const items = [videoItem({ bookmarkId: '1' }), videoItem({ bookmarkId: '2' })]
    render(
      <TheaterMobileChrome
        {...base}
        current={items[1]}
        items={items}
        currentKey="twitter:2"
        queueTotal={2}
        collection={collection}
      />,
    )

    expect(peekCentreText()).toBe('2 / 2')
  })

  /**
   * "N new" counts arrivals in the live pulse. The Collection tab is a finite
   * backlog the viewer is working down — nothing arrives into it mid-session,
   * so the suffix would be counting posts that aren't in the queue on screen.
   */
  it('omits the "N new" suffix on the Collection tab', () => {
    const collection: TheaterPersonalChrome = {
      tab: 'collection',
      onTabChange: vi.fn(),
      onDone: vi.fn(),
      onTag: vi.fn(),
      onSave: vi.fn(),
      onLiveTag: vi.fn(),
      savedKeys: new Set<string>(),
      remaining: 0,
      onClose: vi.fn(),
    }
    const items = [videoItem({ bookmarkId: '1' })]
    const { rerender } = render(
      <TheaterMobileChrome
        {...base}
        current={items[0]}
        items={items}
        currentKey="twitter:1"
        newCount={3}
        collection={collection}
      />,
    )
    expect(peekCentreText()).toBe('1 / 1')

    // The live tab, where "new" does mean something, keeps it.
    rerender(
      <TheaterMobileChrome
        {...base}
        current={items[0]}
        items={items}
        currentKey="twitter:1"
        newCount={3}
        collection={{ ...collection, tab: 'live' }}
      />,
    )
    expect(peekCentreText()).toBe('1 / 1 · 3 new')
  })
})

describe('TheaterMobileChrome: text posts', () => {
  it('text posts never show Download (nothing sendable)', () => {
    render(<TheaterMobileChrome {...base} current={textItem()} />)
    expect(screen.queryByText('Download')).not.toBeInTheDocument()
  })
})

/**
 * Owner report: the collection theater rendered "56y" for a saved TikTok
 * whose `createdAt` fell back to an epoch sentinel. The chip renders
 * `addedAt` (when the post was first saved to ADHX — never the source
 * platform's own publish date), gated by `hasKnownTimestamp` — a
 * missing/unknown `addedAt` hides the relative-time span but the platform
 * glyph must still render either way.
 */
describe('TheaterMobileChrome: hides the time text for an unknown addedAt', () => {
  it('omits the relative-time span but keeps the platform glyph when addedAt is null', () => {
    const { container } = render(
      <TheaterMobileChrome {...base} current={videoItem({ addedAt: null })} />,
    )
    const chip = container.querySelector('a[href="https://x.com/alice/status/1"]')
    expect(chip).toBeInTheDocument()
    expect(chip!.querySelector('svg')).toBeInTheDocument()
    expect(chip!.querySelector('span')).not.toBeInTheDocument()
  })

  it('omits the relative-time span when addedAt is the epoch sentinel', () => {
    const { container } = render(
      <TheaterMobileChrome {...base} current={videoItem({ addedAt: new Date(0).toISOString() })} />,
    )
    const chip = container.querySelector('a[href="https://x.com/alice/status/1"]')
    expect(chip!.querySelector('span')).not.toBeInTheDocument()
  })

  it('shows the relative-time span for a real addedAt', () => {
    const { container } = render(
      <TheaterMobileChrome {...base} current={videoItem({ addedAt: '2026-08-18T00:00:00Z' })} />,
    )
    const chip = container.querySelector('a[href="https://x.com/alice/status/1"]')
    expect(chip!.querySelector('span')).toBeInTheDocument()
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

  // Owner report: the collapsed peek bar floated a few px too short, letting
  // the top of the Up-next list peek through underneath it. The wrapper is
  // now pinned to exactly PEEK_H (4.25rem) so the collapse transform's
  // visible window and the peek content's actual height match.
  it('the peek wrapper is pinned to a fixed 4.25rem height (no auto-height gap)', () => {
    render(<TheaterMobileChrome {...base} current={videoItem()} />)
    const handle = screen
      .getAllByLabelText(/(Expand|Collapse) up next/)
      .find((el) => el.querySelector('span[aria-hidden]'))!
    const wrapper = handle.parentElement!
    expect(wrapper.className).toContain('h-[4.25rem]')
    expect(wrapper.className).toContain('flex-none')
    expect(wrapper.className).toContain('overflow-hidden')
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
        playlist={{ tag: 'claude-code', curator: 'weedauwl', count: 12 }}
        isPlaylistOwner={false}
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
        playlist={{ tag: 'claude-code', curator: 'weedauwl', count: 12 }}
        isPlaylistOwner
      />,
    )
    expect(screen.queryByLabelText('Make your own collection')).not.toBeInTheDocument()
    expect(screen.getByLabelText('ADHX home')).toHaveAttribute('href', '/')
  })

  it('non-owner: the Save-playlist CTA is still present, carrying signed-out conversion', () => {
    render(
      <TheaterMobileChrome
        {...base}
        current={videoItem()}
        playlist={{ tag: 'claude-code', curator: 'weedauwl', count: 12 }}
        isPlaylistOwner={false}
      />,
    )
    expect(screen.getByRole('button', { name: 'Save playlist · 12' })).toBeInTheDocument()
    expect(screen.queryByText('Save playlist · 12')).not.toBeInTheDocument()
  })

  it('the Save-playlist CTA carries the clay-border outline, not the old solid clay-grad fill', () => {
    render(
      <TheaterMobileChrome
        {...base}
        current={videoItem()}
        playlist={{ tag: 'claude-code', curator: 'weedauwl', count: 12 }}
        isPlaylistOwner={false}
      />,
    )
    const savePlaylistBtn = screen.getByRole('button', { name: 'Save playlist · 12' })
    expect(savePlaylistBtn.className).toContain('border-clay')
    expect(savePlaylistBtn.className).not.toContain('bg-clay-grad')
  })

  it('keeps Download next to the Save-playlist CTA (same row as desktop)', () => {
    mockUseSendFile.mockReturnValue({
      supported: true,
      ready: true,
      sending: false,
      mode: 'download' as const,
      send: vi.fn(),
    })
    render(
      <TheaterMobileChrome
        {...base}
        current={videoItem()}
        playlist={{ tag: 'claude-code', curator: 'weedauwl', count: 12 }}
        isPlaylistOwner={false}
      />,
    )
    expect(screen.getByRole('button', { name: 'Download' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save playlist · 12' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Share link' })).toBeInTheDocument()
  })

  it('text posts on a playlist get Copy next to Save playlist', () => {
    render(
      <TheaterMobileChrome
        {...base}
        current={textItem()}
        playlist={{ tag: 'claude-code', curator: 'weedauwl', count: 12 }}
        isPlaylistOwner={false}
      />,
    )
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save playlist · 12' })).toBeInTheDocument()
  })

  it('owner playlist: Download stays next to Manage playlist', () => {
    mockUseSendFile.mockReturnValue({
      supported: true,
      ready: true,
      sending: false,
      mode: 'download' as const,
      send: vi.fn(),
    })
    render(
      <TheaterMobileChrome
        {...base}
        current={videoItem()}
        playlist={{ tag: 'claude-code', curator: 'weedauwl', count: 12 }}
        isPlaylistOwner
      />,
    )
    expect(screen.getByRole('button', { name: 'Download' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Manage playlist' })).toBeInTheDocument()
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

/**
 * Owner follow-up: the peek bar's center label used to always read "Up
 * next" (or "N new") — now it shows the viewer's actual position in the
 * queue ("3 / 17"), with the fresh-arrival count folded in as a suffix.
 * Playlist tags stay out of this slot (15-char names collide with the
 * transport buttons); they live in the expanded sheet. repeatCurrent
 * ("On repeat") still takes priority. Falls back to the old "N new"/"Up
 * next" copy only when the current key doesn't resolve into `items`.
 */
describe('TheaterMobileChrome: queue position label', () => {
  function buildItems(count: number): TheaterItem[] {
    return Array.from({ length: count }, (_, i) => videoItem({ bookmarkId: String(i + 1) }))
  }

  it('renders the 1-based queue position (e.g. "2 / 5") for the current item', () => {
    const items = buildItems(5)
    render(
      <TheaterMobileChrome
        {...base}
        items={items}
        current={items[1]}
        currentKey={theaterItemKey(items[1])}
      />,
    )
    expect(screen.getByText('2 / 5')).toBeInTheDocument()
    expect(screen.queryByText('Up next')).not.toBeInTheDocument()
  })

  it('appends the new-count suffix when newCount > 0', () => {
    const items = buildItems(5)
    render(
      <TheaterMobileChrome
        {...base}
        items={items}
        current={items[1]}
        currentKey={theaterItemKey(items[1])}
        newCount={3}
      />,
    )
    expect(screen.getByText('2 / 5 · 3 new')).toBeInTheDocument()
  })

  it('omits the new-count suffix when newCount is 0', () => {
    const items = buildItems(5)
    render(
      <TheaterMobileChrome
        {...base}
        items={items}
        current={items[1]}
        currentKey={theaterItemKey(items[1])}
        newCount={0}
      />,
    )
    expect(screen.getByText('2 / 5')).toBeInTheDocument()
    expect(screen.queryByText(/new/)).not.toBeInTheDocument()
  })

  it('falls back to "N new" when the current key does not resolve into items', () => {
    const items = buildItems(5)
    render(
      <TheaterMobileChrome
        {...base}
        items={items}
        current={null}
        currentKey="twitter:does-not-exist"
        newCount={4}
      />,
    )
    expect(screen.getByText('4 new')).toBeInTheDocument()
    expect(screen.queryByText(/\d+ \/ \d+/)).not.toBeInTheDocument()
  })

  it('falls back to "Up next" when the current key does not resolve and there is no new count', () => {
    const items = buildItems(5)
    render(
      <TheaterMobileChrome
        {...base}
        items={items}
        current={null}
        currentKey="twitter:does-not-exist"
      />,
    )
    expect(screen.getByText('Up next')).toBeInTheDocument()
  })

  it('playlist mode keeps the queue position in the peek bar; the tag lives in the expanded sheet', () => {
    const items = buildItems(5)
    render(
      <TheaterMobileChrome
        {...base}
        items={items}
        current={items[1]}
        currentKey={theaterItemKey(items[1])}
        playlist={{ tag: 'claude-code', curator: 'weedauwl', count: 12 }}
      />,
    )
    expect(peekCentreText()).toBe('2 / 5')
    expect(screen.queryByText('#claude-code · 12')).not.toBeInTheDocument()
    expect(screen.getAllByText('#claude-code').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('12 posts · @weedauwl')).toBeInTheDocument()
  })

  it('repeatCurrent still shows "On repeat", not the queue position', () => {
    const items = buildItems(5)
    render(
      <TheaterMobileChrome
        {...base}
        items={items}
        current={items[1]}
        currentKey={theaterItemKey(items[1])}
        repeatCurrent
      />,
    )
    expect(screen.getByText('On repeat')).toBeInTheDocument()
    expect(screen.queryByText('2 / 5')).not.toBeInTheDocument()
  })
})

/**
 * Owner follow-up: the theater's URL-sync effect rewrites the address bar to
 * per-post preview paths mid-session, so `usePathname` alone can't tell the
 * chrome it's still inside the home theater — `theaterActive` is passed to
 * `TheaterAvatarMenu` explicitly instead. The collection theater's scrim always mounts
 * inside the theater (always true, regardless of `mode`); the home/shared
 * scrim only mounts it truthy in home mode. Asserted directly on the mocked
 * `TheaterAvatarMenu`'s captured props (see the module mock above) — the
 * real component's own `isHome` derivation is covered by
 * TheaterAvatarMenu.component.test.tsx.
 */
describe('TheaterMobileChrome: theaterActive prop wiring', () => {
  it('passes theaterActive: true to the collection scrim unconditionally, even in shared mode', () => {
    const collection: TheaterPersonalChrome = {
      tab: 'live',
      onTabChange: vi.fn(),
      onDone: vi.fn(),
      onTag: vi.fn(),
      onSave: vi.fn(),
      onLiveTag: vi.fn(),
      savedKeys: new Set<string>(),
      remaining: 0,
      onClose: vi.fn(),
    }
    render(
      <TheaterMobileChrome {...base} mode="shared" current={videoItem()} collection={collection} />,
    )
    expect(mockTheaterAvatarMenu).toHaveBeenCalledWith(
      expect.objectContaining({ theaterActive: true }),
    )
  })

  it('passes theaterActive: true in home mode', () => {
    render(<TheaterMobileChrome {...base} mode="home" current={videoItem()} />)
    expect(mockTheaterAvatarMenu).toHaveBeenCalledWith(
      expect.objectContaining({ theaterActive: true }),
    )
  })

  it('passes theaterActive: false in shared mode (no collection)', () => {
    render(<TheaterMobileChrome {...base} mode="shared" current={videoItem()} />)
    expect(mockTheaterAvatarMenu).toHaveBeenCalledWith(
      expect.objectContaining({ theaterActive: false }),
    )
  })
})

/**
 * "My Collection is just a different playlist in that same theater" (owner
 * directive): the Collection tab used to force the top progress line to
 * 'none' for every item. Now only 'timed' items (photo/text/quote/article)
 * — which still wait on Done/Later/Delete, never a 10s dwell auto-advance —
 * get suppressed there; 'video' items keep the real line, since they now
 * auto-advance on end just like every other playlist. The line's fill node
 * (`.bg-clay`) only renders when `<TheaterProgressLine/>`'s `kind` isn't
 * 'none'.
 */
function collectionCollection(
  overrides: Partial<TheaterPersonalChrome> = {},
): TheaterPersonalChrome {
  return {
    tab: 'collection',
    onTabChange: vi.fn(),
    onDone: vi.fn(),
    onTag: vi.fn(),
    onSave: vi.fn(),
    onLiveTag: vi.fn(),
    savedKeys: new Set<string>(),
    remaining: 0,
    onClose: vi.fn(),
    ...overrides,
  }
}

describe('TheaterMobileChrome: Collection-tab progress line (video flows, timed still waits)', () => {
  it('keeps the progress line for a video item in the Collection tab', () => {
    const { container } = render(
      <TheaterMobileChrome {...base} current={videoItem()} collection={collectionCollection()} />,
    )
    expect(container.querySelector('.bg-clay')).not.toBeNull()
  })

  it('suppresses the progress line for a timed (text) item in the Collection tab', () => {
    const { container } = render(
      <TheaterMobileChrome {...base} current={textItem()} collection={collectionCollection()} />,
    )
    expect(container.querySelector('.bg-clay')).toBeNull()
  })

  it('a timed item still shows the progress line in the Live tab (unaffected by the Collection-tab demotion)', () => {
    const { container } = render(
      <TheaterMobileChrome
        {...base}
        current={textItem()}
        collection={collectionCollection({ tab: 'live' })}
      />,
    )
    expect(container.querySelector('.bg-clay')).not.toBeNull()
  })

  it('a video item shows the progress line outside collection entirely (home/shared/collection-mode theaters)', () => {
    const { container } = render(<TheaterMobileChrome {...base} current={videoItem()} />)
    expect(container.querySelector('.bg-clay')).not.toBeNull()
  })
})

/**
 * Gesture-unmute fix: the audio button must dispatch a SYNCHRONOUS
 * `theater-set-muted` window event (the gesture-context fast path StageVideo/
 * StageYouTube listen for) in the same click handler that calls `onSetMuted`
 * (the persistence path) — and both must move toward the DISPLAYED state's
 * opposite, not blindly toggle the (possibly stale) `muted` prop.
 */
describe('TheaterMobileChrome: audio button gesture-context unmute', () => {
  it('dispatches theater-set-muted synchronously with the value computed from displayMuted, and calls onSetMuted with the same value', () => {
    const onSetMuted = vi.fn()
    const heard: boolean[] = []
    const listener = (e: Event) => {
      heard.push((e as CustomEvent<{ muted: boolean }>).detail.muted)
    }
    window.addEventListener('theater-set-muted', listener)
    try {
      render(<TheaterMobileChrome {...base} muted current={videoItem()} onSetMuted={onSetMuted} />)
      // Starts muted (displayMuted derives from the `muted` prop until a
      // `theater-muted-state` broadcast arrives) — aria-label reads "Unmute".
      const audioBtn = screen.getByLabelText('Unmute')
      fireEvent.click(audioBtn)

      // The event listener ran SYNCHRONOUSLY inside fireEvent.click, before
      // any assertion below — proving the dispatch isn't deferred to a
      // passive effect.
      expect(heard).toEqual([false])
      expect(onSetMuted).toHaveBeenCalledWith(false)
    } finally {
      window.removeEventListener('theater-set-muted', listener)
    }
  })

  it('moves toward the DISPLAYED state, not a blind toggle of a stale `muted` prop', () => {
    const onSetMuted = vi.fn()
    const heard: boolean[] = []
    const listener = (e: Event) => heard.push((e as CustomEvent<{ muted: boolean }>).detail.muted)
    window.addEventListener('theater-set-muted', listener)
    try {
      // Shell prop says muted=false, but the chrome hasn't heard a
      // `theater-muted-state` broadcast confirming that yet — this is
      // exactly the observed-divergence scenario the fix accounts for.
      // `displayMuted` still falls back to the (stale) `muted` prop here, so
      // this asserts the button reads whatever IS currently displayed, not
      // some independent internal toggle counter.
      render(
        <TheaterMobileChrome
          {...base}
          muted={false}
          current={videoItem()}
          onSetMuted={onSetMuted}
        />,
      )
      const audioBtn = screen.getByLabelText('Mute')
      fireEvent.click(audioBtn)
      expect(heard).toEqual([true])
      expect(onSetMuted).toHaveBeenCalledWith(true)
    } finally {
      window.removeEventListener('theater-set-muted', listener)
    }
  })

  it('trusts a live theater-muted-state broadcast over the shell prop when computing the next value', () => {
    const onSetMuted = vi.fn()
    const heard: boolean[] = []
    const listener = (e: Event) => heard.push((e as CustomEvent<{ muted: boolean }>).detail.muted)
    window.addEventListener('theater-set-muted', listener)
    try {
      // Shell prop still says muted (true), but StageVideo has already
      // broadcast that the live element is actually unmuted — displayMuted
      // must follow the live signal.
      render(<TheaterMobileChrome {...base} muted current={videoItem()} onSetMuted={onSetMuted} />)
      fireEvent(window, new CustomEvent('theater-muted-state', { detail: { muted: false } }))
      const audioBtn = screen.getByLabelText('Mute')
      fireEvent.click(audioBtn)
      expect(heard).toEqual([true])
      expect(onSetMuted).toHaveBeenCalledWith(true)
    } finally {
      window.removeEventListener('theater-set-muted', listener)
    }
  })
})

/**
 * Round 8 (owner request): a Spotify-style repeat control in the peek bar,
 * between de-clutter and the (video-only) audio button so neither ever
 * shifts. Only renders when BOTH `repeatMode` and `onCycleRepeat` are
 * provided — home/shared mode; collection mode always loops on its own and
 * the collection theater is a finite backlog, so neither passes these props.
 */
describe('TheaterMobileChrome: repeat control', () => {
  it('does not render when repeatMode/onCycleRepeat are both absent', () => {
    render(<TheaterMobileChrome {...base} current={videoItem()} />)
    expect(screen.queryByLabelText(/^Repeat:/)).not.toBeInTheDocument()
  })

  it('renders "Repeat: off" with the plain Repeat glyph by default', () => {
    render(
      <TheaterMobileChrome
        {...base}
        current={videoItem()}
        repeatMode="off"
        onCycleRepeat={vi.fn()}
      />,
    )
    const btn = screen.getByLabelText('Stop when caught up')
    expect(btn.querySelector('.lucide-repeat')).toBeInTheDocument()
    expect(btn.querySelector('.lucide-repeat-1')).not.toBeInTheDocument()
    expect(btn.className).not.toContain('text-clay')
  })

  it('renders "Repeat: whole queue" (clay, plain glyph) for mode "all"', () => {
    render(
      <TheaterMobileChrome
        {...base}
        current={videoItem()}
        repeatMode="all"
        onCycleRepeat={vi.fn()}
      />,
    )
    const btn = screen.getByLabelText('Keep playing')
    expect(btn.querySelector('.lucide-repeat')).toBeInTheDocument()
    expect(btn.className).toContain('text-clay')
  })

  it('renders "Repeat: this post" (clay, Repeat1 glyph) for mode "one"', () => {
    render(
      <TheaterMobileChrome
        {...base}
        current={videoItem()}
        repeatMode="one"
        onCycleRepeat={vi.fn()}
      />,
    )
    const btn = screen.getByLabelText('Repeat this post')
    expect(btn.querySelector('.lucide-repeat-1')).toBeInTheDocument()
    expect(btn.className).toContain('text-clay')
  })

  it('calls onCycleRepeat on tap, without toggling the up-next sheet', () => {
    const onCycleRepeat = vi.fn()
    render(
      <TheaterMobileChrome
        {...base}
        current={videoItem()}
        repeatMode="off"
        onCycleRepeat={onCycleRepeat}
      />,
    )
    fireEvent.click(screen.getByLabelText('Stop when caught up'))
    expect(onCycleRepeat).toHaveBeenCalledTimes(1)
    // Sheet stays collapsed — the repeat button stops propagation so it
    // never also toggles the drag-handle's open/closed state.
    expect(screen.queryAllByLabelText('Collapse up next')).toHaveLength(0)
  })

  // Owner follow-up: collection mode now exposes the repeat control too
  // (TheaterShell defaults it to 'all' there, and wires cycling through
  // `nextRepeatMode`'s `wrapOnly`) — the chrome itself doesn't gate the
  // button on `collection` at all, it just renders whatever `repeatMode`/
  // `onCycleRepeat` it's given, so a collection-mode mount showing 'all'
  // active is the same rendering path as home/shared.
  it('renders active ("Repeat: whole queue") when mounted in collection mode with repeatMode "all"', () => {
    render(
      <TheaterMobileChrome
        {...base}
        current={videoItem()}
        playlist={{ tag: 'claude-code', curator: 'weedauwl', count: 12 }}
        repeatMode="all"
        onCycleRepeat={vi.fn()}
      />,
    )
    const btn = screen.getByLabelText('Keep playing')
    expect(btn.className).toContain('text-clay')
  })
})

/**
 * Round 8 (owner request): text-like posts (text/quote/article) have no
 * file to download, so the Download slot in the bottom scrim carries a
 * "Copy" pill (copies the post's full text) instead of vanishing.
 */
describe('TheaterMobileChrome: Copy button for text-like posts', () => {
  const writeText = vi.fn().mockResolvedValue(undefined)

  beforeEach(() => {
    writeText.mockClear()
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
  })

  it('shows a Copy icon (not Download) for a text-like post with no sendable file', () => {
    render(<TheaterMobileChrome {...base} current={textItem()} />)
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Download' })).not.toBeInTheDocument()
    expect(screen.queryByText('Copy')).not.toBeInTheDocument()
  })

  it("copies the post's full text and flashes Copied on tap", async () => {
    render(<TheaterMobileChrome {...base} current={textItem({ text: 'the full post body' })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('the full post body'))
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument()
  })

  it('renders no Copy pill for a text-like post with empty text', () => {
    render(<TheaterMobileChrome {...base} current={textItem({ text: '' })} />)
    expect(screen.queryByText('Copy')).not.toBeInTheDocument()
    expect(screen.queryByText('Download')).not.toBeInTheDocument()
  })
})

/**
 * Round 8 (owner request): the author avatar+name row in the bottom scrim
 * is tappable — jumps to the creator's profile on their own platform, via
 * `authorProfileUrl()`. Media posts only (text-like posts show the author
 * on the stage itself, so this row is hidden there).
 */
describe('TheaterMobileChrome: tappable author row', () => {
  it('links the author row to their profile URL for a media post', () => {
    render(<TheaterMobileChrome {...base} current={videoItem({ author: 'alice' })} />)
    const link = screen.getByLabelText('View @alice on X')
    expect(link.tagName).toBe('A')
    expect(link).toHaveAttribute('href', 'https://x.com/alice')
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('resolves the profile URL per-platform (tiktok)', () => {
    render(
      <TheaterMobileChrome
        {...base}
        current={videoItem({ platform: 'tiktok', author: '@bobby' })}
      />,
    )
    expect(screen.getByLabelText('View @bobby on TikTok')).toHaveAttribute(
      'href',
      'https://www.tiktok.com/@bobby',
    )
  })

  it('renders a plain (non-link) row when there is no author handle', () => {
    render(
      <TheaterMobileChrome {...base} current={videoItem({ author: '', authorName: undefined })} />,
    )
    expect(screen.queryByLabelText(/^View @/)).not.toBeInTheDocument()
    expect(screen.getByText('Saved post')).toBeInTheDocument()
  })

  it('does not render the author row at all for a text-like post (shown on the stage itself)', () => {
    render(<TheaterMobileChrome {...base} current={textItem({ author: 'carol' })} />)
    expect(screen.queryByLabelText(/^View @/)).not.toBeInTheDocument()
  })
})
