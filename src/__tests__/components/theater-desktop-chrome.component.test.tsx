/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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
  onToggleMute: vi.fn(),
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
})

/**
 * Save-is-always-primary / Download-is-secondary (product decision: Save
 * drives account signups, so it must always carry the clay-grad primary
 * treatment; Download is a power-user affordance and stays on the glass
 * secondary style, matching Link/Open) — see TASK 1 of the
 * save-primary-image-download PR.
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

  it('signed-out Save (sign-in prompt) is primary (bg-clay-grad)', () => {
    render(<DesktopStageChrome {...stageBase} current={videoItem()} />)
    const saveBtn = screen.getByText('Save').closest('button')!
    expect(saveBtn.className).toContain('bg-clay-grad')
  })

  it('Download is secondary (glass), never bg-clay-grad, even when it is the only sendable action', () => {
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
    expect(downloadBtn.className).toContain('border-white/25')

    // Save must still be primary alongside it.
    const saveBtn = screen.getByText('Save').closest('button')!
    expect(saveBtn.className).toContain('bg-clay-grad')
  })

  it('shared+authed SavePostButton is primary', async () => {
    render(<DesktopStageChrome {...stageBase} mode="shared" authed current={videoItem()} />)
    const saveBtn = await screen.findByText('Save')
    expect(saveBtn.closest('button')!.className).toContain('bg-clay-grad')
  })

  it('triage live-tab Save is primary, Download (when present) stays secondary', () => {
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
      streak: { current: 0, longest: 0 },
      onClose: vi.fn(),
    }
    render(<DesktopStageChrome {...stageBase} current={videoItem()} triage={triage} />)

    const saveBtn = screen.getByText('Save').closest('button')!
    expect(saveBtn.className).toContain('bg-clay-grad')

    const downloadBtn = screen.getByText('Download').closest('button')!
    expect(downloadBtn.className).not.toContain('bg-clay-grad')
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
})
