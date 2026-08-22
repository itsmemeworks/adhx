/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import {
  DesktopStageChrome,
  DesktopDock,
  navigateToAppPath,
} from '@/components/theater/TheaterDesktopChrome'
import { theaterItemKey } from '@/components/theater/types'
import type { TheaterItem } from '@/components/theater/types'

// jsdom has no scrollIntoView — the dock auto-scrolls the current filmstrip card into view.
Element.prototype.scrollIntoView = vi.fn()

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

// Captures the props DesktopStageChrome passes down, so the `theaterActive`
// wiring tests below can assert on it directly rather than through
// TheaterAvatarMenu's own rendering (the global setup-components.ts mock
// pins `usePathname()` to '/' for every test file, making `isHome` true
// regardless of `theaterActive` — no observable behavioral difference to
// assert on there).
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

const dockBase = {
  mode: 'home' as const,
  currentKey: null as string | null,
  isSeen: () => false,
  seenReady: true,
  freshKeys: new Set<string>(),
  newCount: 0,
  savedToday: 3,
  onSelect: vi.fn(),
  waiting: false,
  muted: true,
  onSetMuted: vi.fn(),
  canPrev: true,
  canNext: true,
  onPrev: vi.fn(),
  onNext: vi.fn(),
  declutter: false,
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
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: true,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
})

describe('DesktopDock', () => {
  it('renders a card per item, marks the current card and the next card', () => {
    const items = [
      videoItem({ bookmarkId: '1' }),
      videoItem({ bookmarkId: '2' }),
      videoItem({ bookmarkId: '3' }),
    ]
    const currentKey = theaterItemKey(items[0])
    render(<DesktopDock {...dockBase} items={items} current={items[0]} currentKey={currentKey} />)

    const buttons = screen
      .getAllByRole('button')
      .filter((b) => b.getAttribute('aria-current') !== null || b.querySelector('img, svg'))
    expect(buttons.length).toBeGreaterThan(0)

    const currentCard = screen.getByText('NOW').closest('button')
    expect(currentCard).toHaveAttribute('aria-current', 'true')
    expect(screen.getByText('NEXT →')).toBeInTheDocument()
  })

  it('clicking a card calls onSelect with its key', () => {
    const items = [videoItem({ bookmarkId: '1' }), videoItem({ bookmarkId: '2' })]
    const onSelect = vi.fn()
    render(
      <DesktopDock
        {...dockBase}
        items={items}
        current={items[0]}
        currentKey={theaterItemKey(items[0])}
        onSelect={onSelect}
      />,
    )
    const nextCard = screen.getByText('NEXT →').closest('button')!
    fireEvent.click(nextCard)
    expect(onSelect).toHaveBeenCalledWith(theaterItemKey(items[1]))
  })

  it('"Show all" opens the panel showing UpNextList rows, Escape closes it', () => {
    const items = [videoItem({ bookmarkId: '1', text: 'unique caption text' })]
    render(
      <DesktopDock
        {...dockBase}
        items={items}
        current={items[0]}
        currentKey={theaterItemKey(items[0])}
      />,
    )

    expect(screen.queryByText('Up next')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText(/Show all/))
    expect(screen.getByText('Up next')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByText('Up next')).not.toBeInTheDocument()
  })
})

/**
 * Owner follow-up: the end cap's button text is now just "Show all" (the
 * item count + new-count moved to a line below it, so the button doesn't
 * eat filmstrip width). The old standalone "{newCount} new" span is gone —
 * the new-count now rides the count line instead.
 */
describe('DesktopDock: end cap restructure', () => {
  it('the toggle button reads "Show all" alone, without the item count', () => {
    const items = [videoItem({ bookmarkId: '1' }), videoItem({ bookmarkId: '2' })]
    render(<DesktopDock {...dockBase} items={items} current={items[0]} currentKey={null} />)
    const toggle = screen.getByText('Show all').closest('button')!
    expect(toggle.textContent).toBe('Show all')
  })

  it('shows the item count on its own line below "Show all"', () => {
    const items = [videoItem({ bookmarkId: '1' }), videoItem({ bookmarkId: '2' })]
    render(<DesktopDock {...dockBase} items={items} current={items[0]} currentKey={null} />)
    expect(screen.getByText('2 posts')).toBeInTheDocument()
  })

  it('stacks the clay new-count on its own line below the posts count when newCount > 0 and not collection mode', () => {
    const items = [videoItem({ bookmarkId: '1' })]
    render(
      <DesktopDock {...dockBase} items={items} current={items[0]} currentKey={null} newCount={5} />,
    )
    // Owner follow-up: "5 new" is its own stacked line (narrower end cap),
    // never a suffix on the "N posts" line.
    const newLine = screen.getByText('5 new')
    expect(newLine).toBeInTheDocument()
    expect(newLine.className).toContain('text-clay')
    expect(screen.getByText('1 posts').textContent).toBe('1 posts')
  })

  it('omits the new-count suffix when newCount is 0', () => {
    const items = [videoItem({ bookmarkId: '1' })]
    render(
      <DesktopDock {...dockBase} items={items} current={items[0]} currentKey={null} newCount={0} />,
    )
    expect(screen.queryByText(/new/)).not.toBeInTheDocument()
  })

  it('never shows the new-count suffix in collection mode, even with newCount > 0', () => {
    const items = [videoItem({ bookmarkId: '1' })]
    render(
      <DesktopDock
        {...dockBase}
        items={items}
        current={items[0]}
        currentKey={null}
        newCount={5}
        playlist={{ tag: 'claude-code', curator: 'weedauwl', count: 12 }}
      />,
    )
    expect(screen.queryByText(/new/)).not.toBeInTheDocument()
    // The item count line itself still renders.
    expect(screen.getByText('1 posts')).toBeInTheDocument()
  })

  it('does not render a standalone "{newCount} new" span outside the count line', () => {
    const items = [videoItem({ bookmarkId: '1' })]
    render(
      <DesktopDock {...dockBase} items={items} current={items[0]} currentKey={null} newCount={5} />,
    )
    // Exactly one "new"-bearing node — the suffix on the count line — not a
    // second standalone one elsewhere in the end cap.
    expect(screen.getAllByText(/new/)).toHaveLength(1)
  })
})

/**
 * Owner follow-up: the collection-mode "Loops" divider + ghosted first-card
 * preview announce the wrap — but while the repeat button is on 'one', the
 * queue isn't wrapping at all (the current post is looping in place), so
 * showing "Loops" there would be misleading.
 */
describe('DesktopDock: collection Loops divider hidden under repeat "one"', () => {
  const collection = { tag: 'claude-code', curator: 'weedauwl', count: 2 }

  it('shows the Loops divider + ghost first card by default (repeatMode absent/not "one")', () => {
    const items = [videoItem({ bookmarkId: '1' }), videoItem({ bookmarkId: '2' })]
    render(
      <DesktopDock
        {...dockBase}
        items={items}
        current={items[0]}
        currentKey={theaterItemKey(items[0])}
        playlist={collection}
      />,
    )
    expect(screen.getByText('Loops')).toBeInTheDocument()
    expect(screen.getByLabelText('Back to the first post')).toBeInTheDocument()
  })

  it('hides the Loops divider + ghost first card when repeatMode is "one"', () => {
    const items = [videoItem({ bookmarkId: '1' }), videoItem({ bookmarkId: '2' })]
    render(
      <DesktopDock
        {...dockBase}
        items={items}
        current={items[0]}
        currentKey={theaterItemKey(items[0])}
        playlist={collection}
        repeatMode="one"
      />,
    )
    expect(screen.queryByText('Loops')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Back to the first post')).not.toBeInTheDocument()
  })

  it('still shows the Loops divider when repeatMode is "all"', () => {
    const items = [videoItem({ bookmarkId: '1' }), videoItem({ bookmarkId: '2' })]
    render(
      <DesktopDock
        {...dockBase}
        items={items}
        current={items[0]}
        currentKey={theaterItemKey(items[0])}
        playlist={collection}
        repeatMode="all"
      />,
    )
    expect(screen.getByText('Loops')).toBeInTheDocument()
  })
})

// Desktop parity with TheaterMobileChrome's peek-bar relabel: the shared
// post repeats until deliberate navigation, so the transport needs the same
// "this is on purpose" cue — one small chip in the end cap plus an accented
// next chevron (the deliberate way past the loop).
describe('DesktopDock: shared-post-repeat cue', () => {
  it('the filmstrip current card shows "Repeat" instead of "NOW" while pinned', () => {
    const items = [videoItem({ bookmarkId: '1' }), videoItem({ bookmarkId: '2' })]
    render(
      <DesktopDock
        {...dockBase}
        items={items}
        current={items[0]}
        currentKey={theaterItemKey(items[0])}
        repeatCurrent
      />,
    )
    expect(screen.getByText('Repeat')).toBeInTheDocument()
    expect(screen.queryByText('NOW')).not.toBeInTheDocument()
  })

  it('the filmstrip current card shows "NOW" (not "Repeat") when not pinned', () => {
    const items = [videoItem({ bookmarkId: '1' }), videoItem({ bookmarkId: '2' })]
    render(
      <DesktopDock
        {...dockBase}
        items={items}
        current={items[0]}
        currentKey={theaterItemKey(items[0])}
      />,
    )
    expect(screen.getByText('NOW')).toBeInTheDocument()
    expect(screen.queryByText('Repeat')).not.toBeInTheDocument()
  })

  it('never shows both "NOW" and "Repeat" on the current card at once', () => {
    const items = [videoItem({ bookmarkId: '1' })]
    render(
      <DesktopDock
        {...dockBase}
        items={items}
        current={items[0]}
        currentKey={theaterItemKey(items[0])}
        repeatCurrent
      />,
    )
    const currentCard = screen.getByText('Repeat').closest('button')!
    expect(currentCard).toHaveAttribute('aria-current', 'true')
    expect(currentCard.textContent).not.toContain('NOW')
  })

  // The end-cap chip was removed after owner feedback (a third indicator
  // stacked next to the filmstrip's own tag read as redundant/garbled) —
  // the filmstrip card tag + accented chevron carry the state alone now.
  it('does not render a separate "On repeat" end-cap chip', () => {
    const items = [videoItem({ bookmarkId: '1' })]
    render(
      <DesktopDock
        {...dockBase}
        items={items}
        current={items[0]}
        currentKey={theaterItemKey(items[0])}
        repeatCurrent
      />,
    )
    expect(screen.queryByText('On repeat')).not.toBeInTheDocument()
  })

  it('accents the next transport chevron with clay while pinned and enabled', () => {
    const items = [videoItem({ bookmarkId: '1' })]
    render(
      <DesktopDock
        {...dockBase}
        items={items}
        current={items[0]}
        currentKey={theaterItemKey(items[0])}
        repeatCurrent
      />,
    )
    expect(screen.getByLabelText('Next post').className).toContain('text-clay')
  })

  it('does not accent the next chevron when not pinned', () => {
    const items = [videoItem({ bookmarkId: '1' })]
    render(
      <DesktopDock
        {...dockBase}
        items={items}
        current={items[0]}
        currentKey={theaterItemKey(items[0])}
      />,
    )
    expect(screen.getByLabelText('Next post').className).not.toContain('text-clay')
  })
})

/**
 * Gesture-unmute fix, desktop counterpart of the mobile chrome's tests: the
 * transport's audio button must dispatch a SYNCHRONOUS `theater-set-muted`
 * window event (the gesture-context fast path StageVideo/StageYouTube listen
 * for) alongside calling `onSetMuted` (persistence) — both moving toward the
 * DISPLAYED state's opposite, not a blind toggle of the `muted` prop.
 */
describe('DesktopDock: audio button gesture-context unmute', () => {
  const items = [videoItem({ bookmarkId: '1' })]

  it('dispatches theater-set-muted synchronously and calls onSetMuted with the computed value', () => {
    const onSetMuted = vi.fn()
    const heard: boolean[] = []
    const listener = (e: Event) => heard.push((e as CustomEvent<{ muted: boolean }>).detail.muted)
    window.addEventListener('theater-set-muted', listener)
    try {
      render(
        <DesktopDock
          {...dockBase}
          items={items}
          current={items[0]}
          currentKey={theaterItemKey(items[0])}
          muted
          onSetMuted={onSetMuted}
        />,
      )
      const audioBtn = screen.getByLabelText('Unmute')
      fireEvent.click(audioBtn)
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
      render(
        <DesktopDock
          {...dockBase}
          items={items}
          current={items[0]}
          currentKey={theaterItemKey(items[0])}
          muted={false}
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
})

describe('DesktopStageChrome', () => {
  const stageBase = {
    mode: 'home' as const,
    declutter: false,
    onToggleDeclutter: vi.fn(),
  }

  it('renders the merged meta line and caption for a video item, without top-bar meta chips', () => {
    const item = videoItem()
    render(<DesktopStageChrome {...stageBase} current={item} />)

    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('@alice')).toBeInTheDocument()
    expect(screen.getByText('a caption for the video')).toBeInTheDocument()

    // The platform/time link-out chip lives in the merged meta line for media
    // posts — it must not ALSO appear duplicated in the top bar. (The
    // bottom-right "Open" action button carries the same title, so exclude
    // it by its visible "Open" label to isolate the chip.)
    const chips = screen
      .getAllByTitle('Open on X')
      .filter((el) => !el.textContent?.includes('Open'))
    expect(chips).toHaveLength(1)
  })

  it('renders no caption overlay for a text item, but does render the top-bar platform/time chip', () => {
    const item = textItem()
    render(<DesktopStageChrome {...stageBase} current={item} />)

    expect(screen.queryByText('a text-only post with no media')).not.toBeInTheDocument()
    // The top-bar chip carries the platform glyph + relative time — assert via
    // title, excluding the bottom-right "Open" action button which shares it.
    const chips = screen
      .getAllByTitle('Open on X')
      .filter((el) => !el.textContent?.includes('Open'))
    expect(chips).toHaveLength(1)
  })

  it('resolves a pasted x.com URL to the preview path via window.location.assign', () => {
    const assignSpy = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { ...window.location, assign: assignSpy },
      writable: true,
    })

    render(<DesktopStageChrome {...stageBase} current={null} />)
    const input = screen.getByLabelText('Paste a link to preview')
    fireEvent.change(input, { target: { value: 'https://x.com/alice/status/123' } })
    fireEvent.submit(input.closest('form')!)

    expect(assignSpy).toHaveBeenCalledWith(
      new URL('/alice/status/123', window.location.origin).toString(),
    )
  })

  it('collection mode links the curator handle to their public profile', () => {
    render(
      <DesktopStageChrome
        {...stageBase}
        mode="playlist"
        current={videoItem()}
        playlist={{ tag: 'claude-code', curator: 'weedauwl', count: 12 }}
      />,
    )
    const curatorLink = screen.getByText('@weedauwl').closest('a')!
    expect(curatorLink).toHaveAttribute('href', '/t/weedauwl')
  })

  it('navigateToAppPath only navigates to same-origin app paths', () => {
    const assignSpy = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { ...window.location, assign: assignSpy },
      writable: true,
    })

    navigateToAppPath('//evil.com/x')
    navigateToAppPath('https://evil.com/x')

    navigateToAppPath('javascript:alert(1)')
    expect(assignSpy).not.toHaveBeenCalled()

    navigateToAppPath('/alice/status/123')
    expect(assignSpy).toHaveBeenCalledWith(
      new URL('/alice/status/123', window.location.origin).toString(),
    )
  })

  it('shows "Not a supported link" for a garbage paste', () => {
    render(<DesktopStageChrome {...stageBase} current={null} />)
    const input = screen.getByLabelText('Paste a link to preview')
    fireEvent.change(input, { target: { value: 'not a link at all' } })
    fireEvent.submit(input.closest('form')!)

    expect(screen.getByText('Not a supported link')).toBeInTheDocument()
  })

  // De-cluttering EXPANDS the stage (owner review: the previous icon was
  // backwards) — entering it reads outward (Maximize2); the reverse
  // (Minimize2) lives on TheaterShell's floating restore button, not here.
  it('the de-clutter toggle shows the outward (Maximize2) icon, never Minimize2', () => {
    render(<DesktopStageChrome {...stageBase} current={videoItem()} />)
    const toggle = screen.getByLabelText('Hide controls')
    expect(toggle.querySelector('.lucide-maximize-2')).toBeInTheDocument()
    expect(toggle.querySelector('.lucide-minimize-2')).not.toBeInTheDocument()
  })

  it('triage mode: the close button sits inside the tab-selector pill, not in the far-right cluster', () => {
    const triage = {
      tab: 'live' as const,
      onTabChange: vi.fn(),
      onDone: vi.fn(),
      onLater: vi.fn(),
      onDelete: vi.fn(),
      onTag: vi.fn(),
      onSave: vi.fn(),
      onLiveTag: vi.fn(),
      savedKeys: new Set<string>(),
      remaining: 0,
      onClose: vi.fn(),
    }
    render(<DesktopStageChrome {...stageBase} current={videoItem()} triage={triage} />)

    const closeBtn = screen.getByLabelText('Close')
    const liveTab = screen.getByText('Live', { selector: 'button' })
    // Same immediate pill container as the tab buttons (contained cluster).
    expect(closeBtn.parentElement).toBe(liveTab.parentElement)
    fireEvent.click(closeBtn)
    expect(triage.onClose).toHaveBeenCalled()

    // The far-right cluster (outside the tab pill) holds only the avatar
    // menu and the de-clutter toggle — no stray close button there.
    const declutterBtn = screen.getByLabelText('Hide controls')
    const rightCluster = declutterBtn.parentElement!
    expect(rightCluster.querySelector('[aria-label="Close"]')).toBeNull()
  })

  it('collection mode: "Make your own" opens the sign-in modal in place instead of navigating', () => {
    const onRequestMakeYourOwn = vi.fn()
    render(
      <DesktopStageChrome
        {...stageBase}
        mode="playlist"
        current={videoItem()}
        playlist={{ tag: 'claude-code', curator: 'weedauwl', count: 12 }}
        isPlaylistOwner={false}
        onRequestMakeYourOwn={onRequestMakeYourOwn}
      />,
    )
    const cta = screen.getByText('Make your own')
    expect(cta.tagName).toBe('BUTTON')
    expect(cta.closest('a')).toBeNull()
    fireEvent.click(cta)
    expect(onRequestMakeYourOwn).toHaveBeenCalledTimes(1)
  })

  it('collection mode: the owner never sees "Make your own"', () => {
    render(
      <DesktopStageChrome
        {...stageBase}
        mode="playlist"
        current={videoItem()}
        playlist={{ tag: 'claude-code', curator: 'weedauwl', count: 12 }}
        isPlaylistOwner
      />,
    )
    expect(screen.queryByText('Make your own')).not.toBeInTheDocument()
  })
})

/**
 * Save/Download button hierarchy (round 8, owner: the solid clay-grad Save
 * fill was "too much") — Save now uses SAVE_OUTLINE (a clay border on the
 * same glass background every other pill uses, distinguished from Download/
 * Link/Open only by that border accent), never the old solid `bg-clay-grad`
 * PRIMARY treatment. Download stays on plain GLASS (`border-white/25`).
 */
describe('DesktopStageChrome: Save/Download button hierarchy', () => {
  const stageBase = {
    mode: 'home' as const,
    declutter: false,
    onToggleDeclutter: vi.fn(),
  }

  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false })
  })

  it('signed-out Save (sign-in prompt) is outlined with a clay border, never the old solid fill', () => {
    render(<DesktopStageChrome {...stageBase} current={videoItem()} />)
    const saveBtn = screen.getByText('Save').closest('button')!
    expect(saveBtn.className).toContain('border-clay')
    expect(saveBtn.className).not.toContain('bg-clay-grad')
  })

  it("Download is secondary (glass, border-white/25), distinct from Save's clay border", () => {
    mockUseSendFile.mockReturnValue({
      supported: true,
      ready: true,
      sending: false,
      mode: 'download' as const,
      send: vi.fn(),
    })
    render(<DesktopStageChrome {...stageBase} current={videoItem()} />)
    const downloadBtn = screen.getByText('Download').closest('button')!
    expect(downloadBtn.className).not.toContain('bg-clay-grad')
    expect(downloadBtn.className).not.toContain('border-clay')
    expect(downloadBtn.className).toContain('border-white/25')

    // Save must still carry the clay-border outline alongside it.
    const saveBtn = screen.getByText('Save').closest('button')!
    expect(saveBtn.className).toContain('border-clay')
  })

  it('shared+authed SavePostButton carries the clay-border outline', async () => {
    render(<DesktopStageChrome {...stageBase} mode="shared" authed current={videoItem()} />)
    const saveBtn = await screen.findByText('Save')
    expect(saveBtn.closest('button')!.className).toContain('border-clay')
  })

  it('triage live-tab Save carries the clay-border outline, Download (when present) stays plain glass', () => {
    mockUseSendFile.mockReturnValue({
      supported: true,
      ready: true,
      sending: false,
      mode: 'download' as const,
      send: vi.fn(),
    })
    const triage = {
      tab: 'live' as const,
      onTabChange: vi.fn(),
      onDone: vi.fn(),
      onLater: vi.fn(),
      onDelete: vi.fn(),
      onTag: vi.fn(),
      onSave: vi.fn(),
      onLiveTag: vi.fn(),
      savedKeys: new Set<string>(),
      remaining: 0,
      onClose: vi.fn(),
    }
    render(<DesktopStageChrome {...stageBase} current={videoItem()} triage={triage} />)

    const saveBtn = screen.getByText('Save').closest('button')!
    expect(saveBtn.className).toContain('border-clay')

    const downloadBtn = screen.getByText('Download').closest('button')!
    expect(downloadBtn.className).not.toContain('border-clay')
  })

  it('playlist mode: the Save-playlist CTA also carries the clay-border outline, not the old solid clay-grad fill', () => {
    render(
      <DesktopStageChrome
        {...stageBase}
        mode="playlist"
        current={videoItem()}
        playlist={{ tag: 'claude-code', curator: 'weedauwl', count: 12 }}
        isPlaylistOwner={false}
      />,
    )
    const savePlaylistBtn = screen.getByText(/Save playlist/).closest('button')!
    expect(savePlaylistBtn.className).toContain('border-clay')
    expect(savePlaylistBtn.className).not.toContain('bg-clay-grad')
  })

  it('text posts never show Download (nothing sendable)', () => {
    mockUseSendFile.mockReturnValue({
      supported: false,
      ready: false,
      sending: false,
      mode: 'download' as const,
      send: vi.fn(),
    })
    render(<DesktopStageChrome {...stageBase} current={textItem()} />)
    expect(screen.queryByText('Download')).not.toBeInTheDocument()
  })

  it('renders Live before My Collection, not the bare "Collection" label', () => {
    const triage = {
      tab: 'live' as const,
      onTabChange: vi.fn(),
      onDone: vi.fn(),
      onLater: vi.fn(),
      onDelete: vi.fn(),
      onTag: vi.fn(),
      onSave: vi.fn(),
      onLiveTag: vi.fn(),
      savedKeys: new Set<string>(),
      remaining: 0,
      onClose: vi.fn(),
    }
    render(<DesktopStageChrome {...stageBase} current={videoItem()} triage={triage} />)

    expect(screen.queryByText('Collection')).not.toBeInTheDocument()
    const liveTab = screen.getByText('Live', { selector: 'button' })
    const collectionTab = screen.getByText('My Collection')
    expect(
      liveTab.compareDocumentPosition(collectionTab) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })
})

/**
 * Round 8: the Spotify-style repeat control in the transport cluster, after
 * the audio button and before the divider. Only renders when BOTH
 * `repeatMode` and `onCycleRepeat` are provided (home/shared mode) —
 * collection mode always loops on its own and triage is a finite backlog,
 * so neither passes these props.
 */
describe('DesktopDock: repeat control', () => {
  const items = [videoItem({ bookmarkId: '1' })]
  const currentKey = theaterItemKey(items[0])

  it('does not render when repeatMode/onCycleRepeat are both absent', () => {
    render(<DesktopDock {...dockBase} items={items} current={items[0]} currentKey={currentKey} />)
    expect(screen.queryByLabelText(/^Repeat:/)).not.toBeInTheDocument()
  })

  it('renders "Repeat: off" with the plain Repeat glyph by default', () => {
    render(
      <DesktopDock
        {...dockBase}
        items={items}
        current={items[0]}
        currentKey={currentKey}
        repeatMode="off"
        onCycleRepeat={vi.fn()}
      />,
    )
    const btn = screen.getByLabelText('Stop when caught up')
    expect(btn.querySelector('.lucide-repeat')).toBeInTheDocument()
    expect(btn.querySelector('.lucide-repeat-1')).not.toBeInTheDocument()
    expect(btn.className).not.toContain('text-clay')
  })

  it('renders "Repeat: whole queue" (clay) for mode "all"', () => {
    render(
      <DesktopDock
        {...dockBase}
        items={items}
        current={items[0]}
        currentKey={currentKey}
        repeatMode="all"
        onCycleRepeat={vi.fn()}
      />,
    )
    const btn = screen.getByLabelText('Keep playing')
    expect(btn.className).toContain('text-clay')
  })

  it('renders "Repeat: this post" (clay, Repeat1 glyph) for mode "one"', () => {
    render(
      <DesktopDock
        {...dockBase}
        items={items}
        current={items[0]}
        currentKey={currentKey}
        repeatMode="one"
        onCycleRepeat={vi.fn()}
      />,
    )
    const btn = screen.getByLabelText('Repeat this post')
    expect(btn.querySelector('.lucide-repeat-1')).toBeInTheDocument()
    expect(btn.className).toContain('text-clay')
  })

  it('calls onCycleRepeat on click', () => {
    const onCycleRepeat = vi.fn()
    render(
      <DesktopDock
        {...dockBase}
        items={items}
        current={items[0]}
        currentKey={currentKey}
        repeatMode="off"
        onCycleRepeat={onCycleRepeat}
      />,
    )
    fireEvent.click(screen.getByLabelText('Stop when caught up'))
    expect(onCycleRepeat).toHaveBeenCalledTimes(1)
  })

  // Owner follow-up: collection mode now exposes the repeat control too
  // (TheaterShell defaults it to 'all' there, cycling through
  // `nextRepeatMode`'s `wrapOnly`) — the transport itself doesn't gate the
  // button on `collection`, it just renders whatever `repeatMode`/
  // `onCycleRepeat` it's given.
  it('renders active ("Repeat: whole queue") when mounted in collection mode with repeatMode "all"', () => {
    render(
      <DesktopDock
        {...dockBase}
        items={items}
        current={items[0]}
        currentKey={currentKey}
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
 * Owner report: the collection theater rendered "56y" for a saved TikTok
 * whose `createdAt` fell back to an epoch sentinel. Every time-chip site now
 * renders `addedAt` (when the post was first saved to ADHX — never the
 * source platform's own publish date) gated by `hasKnownTimestamp` — a
 * missing/unknown `addedAt` hides the relative-time span but the platform
 * glyph must still render either way.
 */
describe('DesktopStageChrome: hides the time text for an unknown addedAt (PlatformTimeChip)', () => {
  const stageBase = {
    mode: 'home' as const,
    declutter: false,
    onToggleDeclutter: vi.fn(),
  }

  // Two elements share the "Open on X" title (this chip AND the bottom-right
  // "Open" link-out button) — the chip is the one with the dark pill
  // background (`bg-black/40`), distinct from the glass `Open` button.
  function findChip() {
    return screen.getAllByTitle('Open on X').find((el) => el.className.includes('bg-black/40'))!
  }

  it('omits the relative-time span but keeps the platform glyph when addedAt is null', () => {
    render(<DesktopStageChrome {...stageBase} current={videoItem({ addedAt: null })} />)
    const chip = findChip()
    expect(chip.querySelector('svg')).toBeInTheDocument()
    expect(chip.querySelector('span')).not.toBeInTheDocument()
  })

  it('omits the relative-time span when addedAt is the epoch sentinel', () => {
    render(
      <DesktopStageChrome
        {...stageBase}
        current={videoItem({ addedAt: new Date(0).toISOString() })}
      />,
    )
    expect(findChip().querySelector('span')).not.toBeInTheDocument()
  })

  it('shows the relative-time span for a real addedAt', () => {
    render(
      <DesktopStageChrome
        {...stageBase}
        current={videoItem({ addedAt: '2026-08-18T00:00:00Z' })}
      />,
    )
    expect(findChip().querySelector('span')).toBeInTheDocument()
  })
})

describe('DesktopDock: hides the time text for an unknown addedAt (filmstrip card)', () => {
  it('omits the relative-time span on the current filmstrip card when addedAt is unset', () => {
    const items = [videoItem({ bookmarkId: '1', addedAt: null })]
    render(
      <DesktopDock
        {...dockBase}
        items={items}
        current={items[0]}
        currentKey={theaterItemKey(items[0])}
      />,
    )
    const card = screen.getByText('NOW').closest('button')!
    expect(card.querySelector('svg')).toBeInTheDocument()
    expect(card.querySelector('span.font-mono')).not.toBeInTheDocument()
  })

  it('shows the relative-time span on the current filmstrip card for a real addedAt', () => {
    const items = [videoItem({ bookmarkId: '1', addedAt: '2026-08-18T00:00:00Z' })]
    render(
      <DesktopDock
        {...dockBase}
        items={items}
        current={items[0]}
        currentKey={theaterItemKey(items[0])}
      />,
    )
    const card = screen.getByText('NOW').closest('button')!
    expect(card.querySelector('span.font-mono')).toBeInTheDocument()
  })

  it('same gating applies to the collection-mode ghost first card', () => {
    const items = [
      videoItem({ bookmarkId: '1', addedAt: null }),
      videoItem({ bookmarkId: '2', addedAt: null }),
    ]
    render(
      <DesktopDock
        {...dockBase}
        items={items}
        current={items[0]}
        currentKey={theaterItemKey(items[0])}
        playlist={{ tag: 'claude-code', curator: 'weedauwl', count: 2 }}
      />,
    )
    const ghost = screen.getByLabelText('Back to the first post')
    expect(ghost.querySelector('svg')).toBeInTheDocument()
    expect(ghost.querySelector('span.font-mono')).not.toBeInTheDocument()
  })
})

/**
 * Round 8: text-like posts (text/quote/article) have no file to download,
 * so the Download slot carries a "Copy" pill (copies the post's full text)
 * instead of vanishing.
 */
describe('DesktopStageChrome: Copy button for text-like posts', () => {
  const stageBase = {
    mode: 'home' as const,
    declutter: false,
    onToggleDeclutter: vi.fn(),
  }

  const writeText = vi.fn().mockResolvedValue(undefined)

  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false })
    writeText.mockClear()
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
  })

  it('shows a Copy pill (not Download) for a text-like post with no sendable file', () => {
    render(<DesktopStageChrome {...stageBase} current={textItem()} />)
    expect(screen.getByText('Copy')).toBeInTheDocument()
    expect(screen.queryByText('Download')).not.toBeInTheDocument()
  })

  it('copies the post\'s full text and flashes "Copied" on click', async () => {
    render(<DesktopStageChrome {...stageBase} current={textItem({ text: 'the full post body' })} />)
    fireEvent.click(screen.getByText('Copy'))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('the full post body'))
    expect(await screen.findByText('Copied')).toBeInTheDocument()
  })

  it('renders no Copy pill for a text-like post with empty text', () => {
    render(<DesktopStageChrome {...stageBase} current={textItem({ text: '' })} />)
    expect(screen.queryByText('Copy')).not.toBeInTheDocument()
    expect(screen.queryByText('Download')).not.toBeInTheDocument()
  })
})

/**
 * Round 8: the bottom-left post overlay's author row is tappable — jumps to
 * the creator's profile on their own platform, via `authorProfileUrl()`.
 * Media posts only (text/quote/article render their own composition on the
 * stage, with no media overlay at all).
 */
describe('DesktopStageChrome: tappable author row', () => {
  const stageBase = {
    mode: 'home' as const,
    declutter: false,
    onToggleDeclutter: vi.fn(),
  }

  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false })
  })

  it('links the author row to their profile URL for a media post', () => {
    render(<DesktopStageChrome {...stageBase} current={videoItem({ author: 'alice' })} />)
    const link = screen.getByTitle('View @alice on X')
    expect(link.tagName).toBe('A')
    expect(link).toHaveAttribute('href', 'https://x.com/alice')
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('resolves the profile URL per-platform (youtube)', () => {
    render(
      <DesktopStageChrome
        {...stageBase}
        current={videoItem({ platform: 'youtube', author: 'dana' })}
      />,
    )
    expect(screen.getByTitle('View @dana on YouTube')).toHaveAttribute(
      'href',
      'https://www.youtube.com/@dana',
    )
  })

  it('renders a plain (non-link) row when there is no author handle', () => {
    render(
      <DesktopStageChrome
        {...stageBase}
        current={videoItem({ author: '', authorName: undefined })}
      />,
    )
    expect(screen.queryByTitle(/^View @/)).not.toBeInTheDocument()
    expect(screen.getByText('Saved post')).toBeInTheDocument()
  })
})

/**
 * Owner follow-up: the theater's URL-sync effect rewrites the address bar to
 * per-post preview paths mid-session, so `usePathname` alone can't tell the
 * chrome it's still inside the home theater — `theaterActive` is passed to
 * `TheaterAvatarMenu` explicitly as `mode === 'home' || !!triage`. Asserted
 * directly on the mocked `TheaterAvatarMenu`'s captured props (see the
 * module mock above).
 */
describe('DesktopStageChrome: theaterActive prop wiring', () => {
  const stageBase = {
    mode: 'home' as const,
    declutter: false,
    onToggleDeclutter: vi.fn(),
  }

  const triage = {
    tab: 'live' as const,
    onTabChange: vi.fn(),
    onDone: vi.fn(),
    onLater: vi.fn(),
    onDelete: vi.fn(),
    onTag: vi.fn(),
    onSave: vi.fn(),
    onLiveTag: vi.fn(),
    savedKeys: new Set<string>(),
    remaining: 0,
    onClose: vi.fn(),
  }

  it('passes theaterActive: true in home mode (no triage)', () => {
    render(<DesktopStageChrome {...stageBase} mode="home" current={videoItem()} />)
    expect(mockTheaterAvatarMenu).toHaveBeenCalledWith(
      expect.objectContaining({ theaterActive: true }),
    )
  })

  it('passes theaterActive: true whenever triage is present, regardless of mode', () => {
    render(
      <DesktopStageChrome {...stageBase} mode="triage" current={videoItem()} triage={triage} />,
    )
    expect(mockTheaterAvatarMenu).toHaveBeenCalledWith(
      expect.objectContaining({ theaterActive: true }),
    )
  })

  it('passes theaterActive: false in collection mode (no triage)', () => {
    render(
      <DesktopStageChrome
        {...stageBase}
        mode="playlist"
        current={videoItem()}
        playlist={{ tag: 'claude-code', curator: 'weedauwl', count: 12 }}
      />,
    )
    expect(mockTheaterAvatarMenu).toHaveBeenCalledWith(
      expect.objectContaining({ theaterActive: false }),
    )
  })

  it('passes theaterActive: false in shared mode (no triage)', () => {
    render(<DesktopStageChrome {...stageBase} mode="shared" current={videoItem()} />)
    expect(mockTheaterAvatarMenu).toHaveBeenCalledWith(
      expect.objectContaining({ theaterActive: false }),
    )
  })
})
