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
import { TheaterProgressLine } from '@/components/theater/TheaterProgressLine'
import { theaterItemKey } from '@/components/theater/types'
import type { TheaterItem } from '@/components/theater/types'
import { peekPreviewOpenIntent } from '@/lib/theater/autosave-shared'
import { resetArticleMarkdownCache } from '@/lib/theater/article-body'
import { resetSavePostOwnershipCache } from '@/components/theater/SavePostButton'
import { resetClampExpandPreference } from '@/components/theater/useClampExpand'

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
  onToggleDeclutter: vi.fn(),
}

beforeEach(() => {
  resetClampExpandPreference()
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
  it('puts de-clutter under prev and repeat under play, not in the top bar', () => {
    const onToggleDeclutter = vi.fn()
    const items = [videoItem({ bookmarkId: '1' })]
    render(
      <DesktopDock
        {...dockBase}
        items={items}
        current={items[0]}
        currentKey={theaterItemKey(items[0])}
        onToggleDeclutter={onToggleDeclutter}
        repeatMode="off"
        onCycleRepeat={vi.fn()}
      />,
    )
    const prev = screen.getByLabelText('Previous post')
    const next = screen.getByLabelText('Next post')
    expect(prev.className).toContain('hover:bg-white/15')
    expect(next.className).toContain('hover:bg-white/15')
    // One play/pause toggle — video starts playing, so it reads Pause.
    expect(screen.getByLabelText('Pause')).toBeInTheDocument()
    expect(screen.queryByLabelText('Play')).not.toBeInTheDocument()
    const hide = screen.getByLabelText('Hide controls')
    const repeat = screen.getByLabelText('Stop when caught up')
    const mute = screen.getByLabelText('Unmute')
    expect(hide.compareDocumentPosition(repeat) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(repeat.compareDocumentPosition(mute) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(hide.querySelector('.lucide-maximize-2')).toBeInTheDocument()
    fireEvent.click(hide)
    expect(onToggleDeclutter).toHaveBeenCalled()
  })

  it('Space pauses the 10s dwell on a text post (dock icon flips to Play)', () => {
    const items = [textItem()]
    const key = theaterItemKey(items[0])
    render(
      <>
        <TheaterProgressLine itemKey={key} kind="timed" />
        <DesktopDock
          {...dockBase}
          items={items}
          current={items[0]}
          currentKey={key}
          repeatMode="off"
          onCycleRepeat={vi.fn()}
        />
      </>,
    )
    expect(screen.getByLabelText('Pause')).toBeInTheDocument()
    fireEvent(window, new CustomEvent('theater-toggle-play'))
    expect(screen.getByLabelText('Play')).toBeInTheDocument()
    fireEvent(window, new CustomEvent('theater-toggle-play'))
    expect(screen.getByLabelText('Pause')).toBeInTheDocument()
  })

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
    // NOW / NEXT must not grow the card: same fixed-height meta row as
    // cards with no status label (body line-height used to stretch them).
    const nowRow = screen.getByText('NOW').parentElement
    const nextRow = screen.getByText('NEXT →').parentElement
    expect(nowRow?.className).toContain('h-4')
    expect(nextRow?.className).toContain('h-4')
    expect(screen.getByText('NEXT →').className).toContain('whitespace-nowrap')
  })

  it('greys watched filmstrip thumbs like the queue, and hides NOW/NEXT while caught up', () => {
    const items = [
      videoItem({ bookmarkId: '1', text: 'playing-now' }),
      videoItem({ bookmarkId: '2', text: 'watched-a' }),
      videoItem({ bookmarkId: '3', text: 'watched-b' }),
    ]
    const seen = new Set([theaterItemKey(items[1]), theaterItemKey(items[2])])
    const { rerender } = render(
      <DesktopDock
        {...dockBase}
        items={items}
        current={items[0]}
        currentKey={theaterItemKey(items[0])}
        isSeen={(key) => seen.has(key)}
      />,
    )
    const watched = screen.getByText('watched-a').closest('button')!
    expect(watched.className).toContain('opacity-45')
    expect(watched.querySelector('.grayscale')).toBeInTheDocument()
    const current = screen.getByText('NOW').closest('button')!
    expect(current.className).not.toContain('opacity-45')

    rerender(
      <DesktopDock
        {...dockBase}
        items={items}
        current={items[2]}
        currentKey={theaterItemKey(items[2])}
        isSeen={(key) => seen.has(key)}
        waiting
      />,
    )
    expect(screen.queryByText('NOW')).not.toBeInTheDocument()
    expect(screen.queryByText('NEXT →')).not.toBeInTheDocument()
    const parked = screen.getByText('watched-b').closest('button')!
    expect(parked.className).toContain('opacity-45')
    expect(parked.querySelector('.grayscale')).toBeInTheDocument()
  })

  it('labels NEXT on the following card', () => {
    const items = [
      videoItem({ bookmarkId: '1', text: 'playing-now' }),
      videoItem({ bookmarkId: '2', text: 'up-next' }),
    ]
    render(
      <DesktopDock
        {...dockBase}
        items={items}
        current={items[0]}
        currentKey={theaterItemKey(items[0])}
      />,
    )
    expect(screen.getByText('NOW')).toBeInTheDocument()
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

  it('"Queue" opens the panel showing UpNextList rows, Escape closes it', () => {
    const items = [videoItem({ bookmarkId: '1', text: 'unique caption text' })]
    render(
      <DesktopDock
        {...dockBase}
        items={items}
        current={items[0]}
        currentKey={theaterItemKey(items[0])}
      />,
    )

    expect(screen.queryByRole('dialog', { name: 'Playlist' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Queue' }))
    expect(screen.getByRole('dialog', { name: 'Playlist' })).toBeInTheDocument()
    expect(screen.getByText('Now playing')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Playlist' })).not.toBeInTheDocument()
  })

  it('clicking away from Queue closes the playlist', () => {
    const items = [videoItem({ bookmarkId: '1', text: 'unique caption text' })]
    render(
      <DesktopDock
        {...dockBase}
        items={items}
        current={items[0]}
        currentKey={theaterItemKey(items[0])}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Queue' }))
    expect(screen.getByRole('dialog', { name: 'Playlist' })).toBeInTheDocument()
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('dialog', { name: 'Playlist' })).not.toBeInTheDocument()
  })

  it('↑/↓ move through Queue rows', async () => {
    const items = [
      videoItem({ bookmarkId: '1', text: 'first playlist row' }),
      videoItem({ bookmarkId: '2', text: 'second playlist row' }),
    ]
    render(
      <DesktopDock
        {...dockBase}
        items={items}
        current={items[0]}
        currentKey={theaterItemKey(items[0])}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Queue' }))
    const rows = () => document.querySelectorAll<HTMLElement>('[data-theater-queue-item]')
    await waitFor(() => expect(rows()[0]).toHaveFocus())
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    expect(rows()[1]).toHaveFocus()
  })

  it('Q toggles Queue via the theater action event', () => {
    const items = [videoItem({ bookmarkId: '1', text: 'unique caption text' })]
    render(
      <DesktopDock
        {...dockBase}
        items={items}
        current={items[0]}
        currentKey={theaterItemKey(items[0])}
      />,
    )
    fireEvent(window, new CustomEvent('theater-toggle-show-all'))
    expect(screen.getByRole('dialog', { name: 'Playlist' })).toBeInTheDocument()
    fireEvent(window, new CustomEvent('theater-toggle-show-all'))
    expect(screen.queryByRole('dialog', { name: 'Playlist' })).not.toBeInTheDocument()
  })

  it('keeps Queue open when the stage advances to the next post', () => {
    const items = [
      videoItem({ bookmarkId: '1', text: 'first playlist row' }),
      videoItem({ bookmarkId: '2', text: 'second playlist row' }),
    ]
    const { rerender } = render(
      <DesktopDock
        {...dockBase}
        items={items}
        current={items[0]}
        currentKey={theaterItemKey(items[0])}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Queue' }))
    expect(screen.getByRole('dialog', { name: 'Playlist' })).toBeInTheDocument()

    rerender(
      <DesktopDock
        {...dockBase}
        items={items}
        current={items[1]}
        currentKey={theaterItemKey(items[1])}
      />,
    )
    expect(screen.getByRole('dialog', { name: 'Playlist' })).toBeInTheDocument()
  })

  it('keeps Queue open when Next is pressed on the dock', () => {
    const items = [
      videoItem({ bookmarkId: '1', text: 'first playlist row' }),
      videoItem({ bookmarkId: '2', text: 'second playlist row' }),
    ]
    const onNext = vi.fn()
    render(
      <DesktopDock
        {...dockBase}
        items={items}
        current={items[0]}
        currentKey={theaterItemKey(items[0])}
        onNext={onNext}
        canNext
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Queue' }))
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Next post' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next post' }))
    expect(onNext).toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Playlist' })).toBeInTheDocument()
  })

  it('keeps Queue open after picking a row', () => {
    const items = [
      videoItem({ bookmarkId: '1', text: 'first playlist row' }),
      videoItem({ bookmarkId: '2', text: 'second playlist row' }),
    ]
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
    fireEvent.click(screen.getByRole('button', { name: 'Queue' }))
    const rows = document.querySelectorAll<HTMLElement>('[data-theater-queue-item]')
    fireEvent.click(rows[1]!)
    expect(onSelect).toHaveBeenCalledWith(theaterItemKey(items[1]))
    expect(screen.getByRole('dialog', { name: 'Playlist' })).toBeInTheDocument()
  })

  it('puts type pills in Queue, not the filmstrip', () => {
    const onToggleQueueType = vi.fn()
    const onClearQueueTypes = vi.fn()
    const items = [videoItem({ bookmarkId: '1', text: 'unique caption text' })]
    const { rerender } = render(
      <DesktopDock
        {...dockBase}
        items={items}
        current={items[0]}
        currentKey={theaterItemKey(items[0])}
        queueTypes={[]}
        onToggleQueueType={onToggleQueueType}
        onClearQueueTypes={onClearQueueTypes}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Videos' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Queue' }))
    const all = screen.getByRole('button', { name: 'All' })
    const videos = screen.getByRole('button', { name: 'Videos' })
    const photos = screen.getByRole('button', { name: 'Photos' })
    const text = screen.getByRole('button', { name: 'Text' })
    expect(all).toHaveAttribute('aria-pressed', 'true')
    expect(videos).toHaveAttribute('aria-pressed', 'false')
    expect(photos).toHaveAttribute('aria-pressed', 'false')
    expect(text).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Articles' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Quotes' })).not.toBeInTheDocument()
    fireEvent.click(videos)
    expect(onToggleQueueType).toHaveBeenCalledWith('video')
    onToggleQueueType.mockClear()
    fireEvent.click(text)
    expect(onToggleQueueType.mock.calls).toEqual([['text'], ['article']])

    rerender(
      <DesktopDock
        {...dockBase}
        items={items}
        current={items[0]}
        currentKey={theaterItemKey(items[0])}
        queueTypes={['video', 'photo']}
        onToggleQueueType={onToggleQueueType}
        onClearQueueTypes={onClearQueueTypes}
      />,
    )
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Videos' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Photos' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'All' }))
    expect(onClearQueueTypes).toHaveBeenCalledTimes(1)

    rerender(
      <DesktopDock
        {...dockBase}
        items={items}
        current={items[0]}
        currentKey={theaterItemKey(items[0])}
        queueTypes={['video', 'photo']}
        onToggleQueueType={onToggleQueueType}
        onClearQueueTypes={onClearQueueTypes}
        collection={{
          tab: 'collection',
          onTabChange: vi.fn(),
          onDone: vi.fn(),
          onTag: vi.fn(),
          onSave: vi.fn(),
          onLiveTag: vi.fn(),
          savedKeys: new Set<string>(),
          remaining: 0,
          onClose: vi.fn(),
        }}
      />,
    )
    expect(screen.getByRole('button', { name: 'Videos' })).toBeInTheDocument()
  })
})

/**
 * End cap: compact Queue/count + Filter controls matching mobile. The cap
 * overlays the filmstrip with a left fade so cards pass behind it.
 */
describe('DesktopDock: end cap restructure', () => {
  it('replaces the Queue copy stack with a compact playlist icon and count', () => {
    const items = [videoItem({ bookmarkId: '1' }), videoItem({ bookmarkId: '2' })]
    render(
      <DesktopDock
        {...dockBase}
        items={items}
        current={items[0]}
        currentKey={theaterItemKey(items[0])}
      />,
    )
    const toggle = screen.getByRole('button', { name: 'Queue' })
    expect(toggle.querySelector('.lucide-list')).toBeInTheDocument()
    expect(toggle.querySelector('[data-theater-play-count]')).toHaveTextContent('2')
    expect(toggle).not.toHaveTextContent('Queue')
    expect(toggle.parentElement).toHaveClass('flex-col')
  })

  it('keeps the full queue meaning in the playlist button title', () => {
    const items = [videoItem({ bookmarkId: '1' }), videoItem({ bookmarkId: '2' })]
    render(
      <DesktopDock
        {...dockBase}
        items={items}
        current={items[0]}
        currentKey={theaterItemKey(items[0])}
        queueTotal={2}
        queuePlayed={0}
        queueToPlay={2}
      />,
    )
    expect(screen.getByRole('button', { name: 'Queue' })).toHaveAttribute('title', '2 in queue')
    expect(screen.getByText('2 in queue').closest('.sr-only')).toBeInTheDocument()
  })

  it('names Now playing + Next off-repeat, and the pile when looping', () => {
    const items = Array.from({ length: 23 }, (_, i) => videoItem({ bookmarkId: `${i + 1}` }))
    const { rerender } = render(
      <DesktopDock
        {...dockBase}
        items={items}
        current={items[0]}
        currentKey={theaterItemKey(items[0])}
        queueTotal={40}
        queuePlayed={0}
        queueToPlay={23}
      />,
    )
    expect(screen.getByRole('button', { name: 'Queue' })).toHaveAttribute('title', '23 in queue')
    expect(document.querySelector('[data-theater-play-count]')).toHaveTextContent('23')

    rerender(
      <DesktopDock
        {...dockBase}
        items={items}
        current={items[0]}
        currentKey={theaterItemKey(items[0])}
        queueTotal={23}
        queueLooping
      />,
    )
    expect(screen.getByRole('button', { name: 'Queue' })).toHaveAttribute('title', '23 on repeat')
    expect(document.querySelector('[data-theater-play-count]')).toHaveTextContent('23')

    rerender(
      <DesktopDock
        {...dockBase}
        items={items}
        current={items[0]}
        currentKey={theaterItemKey(items[0])}
        queueTotal={1}
        queueToPlay={1}
        queueLooping
      />,
    )
    expect(screen.getByRole('button', { name: 'Queue' })).toHaveAttribute('title', '1 on repeat')
    expect(document.querySelector('[data-theater-play-count]')).toHaveTextContent('1')
  })

  it('shows a separate filter icon with a clay active cue and opens the playlist filters', () => {
    const items = [videoItem({ bookmarkId: '1' })]
    render(
      <DesktopDock
        {...dockBase}
        items={items}
        current={items[0]}
        currentKey={theaterItemKey(items[0])}
        queueTypes={['video']}
        onToggleQueueType={vi.fn()}
        onClearQueueTypes={vi.fn()}
      />,
    )
    const queue = screen.getByRole('button', { name: 'Queue' })
    const filter = screen.getByRole('button', { name: 'Filter post types' })
    expect(queue.querySelector('.lucide-list-filter')).not.toBeInTheDocument()
    expect(filter).toHaveAttribute('data-theater-queue-filter')
    expect(filter).toHaveAttribute('title', 'Videos')
    expect(filter.className).toContain('text-clay')
    expect(filter.querySelector('.lucide-list-filter')).toBeInTheDocument()
    expect(filter).toHaveAccessibleDescription('Filtered to Videos.')
    expect(screen.queryByText('Videos')).not.toBeInTheDocument()
    fireEvent.click(filter)
    expect(screen.getByRole('dialog', { name: 'Playlist' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Videos' })).toBeInTheDocument()
  })

  it('omits the filter control when filtering is unavailable', () => {
    const items = [videoItem({ bookmarkId: '1' })]
    render(
      <DesktopDock
        {...dockBase}
        items={items}
        current={items[0]}
        currentKey={theaterItemKey(items[0])}
        queueTypes={['video']}
      />,
    )
    expect(screen.getByRole('button', { name: 'Queue' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Filter post types' })).not.toBeInTheDocument()
  })

  it('moves the unseen count into a badge on the playlist control', () => {
    const items = [videoItem({ bookmarkId: '1' }), videoItem({ bookmarkId: '2' })]
    render(
      <DesktopDock
        {...dockBase}
        items={items}
        current={items[0]}
        currentKey={theaterItemKey(items[0])}
        isSeen={(key) => key === theaterItemKey(items[0])}
        queuePlayed={0}
        queueToPlay={2}
        queueTotal={2}
      />,
    )
    const unseen = document.querySelector('[data-theater-unseen-count]')
    expect(unseen).toHaveTextContent('1')
    expect(unseen).toHaveAttribute('data-theater-unseen-count')
    expect(screen.getByRole('button', { name: 'Queue' })).toHaveAccessibleDescription(
      '2 in queue. 1 unseen.',
    )
    expect(screen.queryByText(/new/)).not.toBeInTheDocument()
  })

  it('omits the unseen badge when every queued post is seen', () => {
    const items = [videoItem({ bookmarkId: '1' })]
    render(
      <DesktopDock
        {...dockBase}
        items={items}
        current={items[0]}
        currentKey={theaterItemKey(items[0])}
        isSeen={() => true}
      />,
    )
    expect(document.querySelector('[data-theater-unseen-count]')).not.toBeInTheDocument()
  })

  it('uses one as the playlist count in repeat-this-post mode', () => {
    const items = [videoItem({ bookmarkId: '1' })]
    render(
      <DesktopDock
        {...dockBase}
        items={items}
        current={items[0]}
        currentKey={theaterItemKey(items[0])}
        queuePlayed={0}
        queueToPlay={1}
        queueTotal={12}
        repeatCurrent
      />,
    )
    expect(document.querySelector('[data-theater-play-count]')).toHaveTextContent('1')
  })

  it('does not show saved-today or remaining-left leftovers', () => {
    const items = [videoItem({ bookmarkId: '1' })]
    render(
      <DesktopDock
        {...dockBase}
        items={items}
        current={items[0]}
        currentKey={theaterItemKey(items[0])}
        savedToday={63}
        collection={{
          tab: 'collection',
          onTabChange: vi.fn(),
          onDone: vi.fn(),
          onTag: vi.fn(),
          onSave: vi.fn(),
          onLiveTag: vi.fn(),
          savedKeys: new Set<string>(),
          remaining: 4,
          onClose: vi.fn(),
        }}
      />,
    )
    expect(screen.queryByText(/today/)).not.toBeInTheDocument()
    expect(screen.queryByText(/left/)).not.toBeInTheDocument()
  })

  it('fades the end cap over the filmstrip instead of a hard vertical seam', () => {
    const items = [videoItem({ bookmarkId: '1' })]
    const { container } = render(
      <DesktopDock {...dockBase} items={items} current={items[0]} currentKey={null} />,
    )
    const cap = container.querySelector('[data-theater-dock-cap]')
    expect(cap).toBeTruthy()
    expect(cap!.className).toContain('absolute')
    expect((cap as HTMLElement).style.background).toContain('linear-gradient')
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

    expect(screen.getByRole('link', { name: 'Open on X' })).toHaveAttribute(
      'href',
      'https://x.com/alice/status/1',
    )
    expect(screen.queryByText('Open')).not.toBeInTheDocument()
  })

  it('pins the flame left of paste on media, never next to the author', () => {
    const item = videoItem({ trendCount: 12 })
    render(<DesktopStageChrome {...stageBase} current={item} />)

    const flame = screen.getByLabelText('12 trending')
    const paste = screen.getByRole('button', { name: 'Paste a link' })
    expect(flame.compareDocumentPosition(paste) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByText('Alice').closest('a')?.contains(flame)).toBe(false)
    expect(screen.getByText('Alice').parentElement?.contains(flame)).toBe(false)
  })

  it('keeps the flame left of paste on text, articles, and Read mode', () => {
    const { rerender } = render(
      <DesktopStageChrome {...stageBase} current={textItem({ trendCount: 12 })} />,
    )
    expect(screen.getByLabelText('12 trending')).toBeInTheDocument()

    rerender(
      <DesktopStageChrome
        {...stageBase}
        current={textItem({ trendCount: 12, contentType: 'article' })}
      />,
    )
    expect(screen.getByLabelText('12 trending')).toBeInTheDocument()

    rerender(
      <DesktopStageChrome {...stageBase} current={videoItem({ trendCount: 12 })} articleMode />,
    )
    const flame = screen.getByLabelText('12 trending')
    const paste = screen.getByRole('button', { name: 'Paste a link' })
    expect(flame.compareDocumentPosition(paste) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('has no more/less caption control — overflow uses Read, not tap-to-expand', () => {
    render(<DesktopStageChrome {...stageBase} current={videoItem()} />)
    expect(screen.getByText('a caption for the video')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'more' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'less' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Read' })).not.toBeInTheDocument()
  })

  it('opens a video+quote item from its caption without a separate Read button', () => {
    const onToggleArticleMode = vi.fn()
    render(
      <DesktopStageChrome
        {...stageBase}
        current={videoItem({
          quote: { author: 'other', text: 'the quoted tweet' },
        })}
        onToggleArticleMode={onToggleArticleMode}
      />,
    )
    const caption = screen.getByText('a caption for the video')
    expect(screen.queryByRole('button', { name: /^Read$/ })).not.toBeInTheDocument()
    fireEvent.click(caption)
    expect(onToggleArticleMode).toHaveBeenCalledTimes(1)
    fireEvent(window, new Event('theater-toggle-article'))
    expect(onToggleArticleMode).toHaveBeenCalledTimes(2)
  })

  it('hides the media caption in article mode, offers Watch, and keeps Download', () => {
    mockUseSendFile.mockReturnValue({
      supported: true,
      ready: true,
      sending: false,
      mode: 'download' as const,
      send: vi.fn(),
    })
    render(
      <DesktopStageChrome
        {...stageBase}
        current={videoItem({
          quote: { author: 'other', text: 'the quoted tweet' },
        })}
        articleMode
        onToggleArticleMode={vi.fn()}
      />,
    )
    expect(screen.queryByText('a caption for the video')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Watch' })).toHaveAttribute(
      'title',
      'Back to watching',
    )
    expect(screen.getByRole('button', { name: 'Download' })).toBeInTheDocument()
  })

  it('renders no caption overlay for a text item, and opens the source via the platform glyph', () => {
    const item = textItem()
    render(<DesktopStageChrome {...stageBase} current={item} />)

    expect(screen.queryByText('a text-only post with no media')).not.toBeInTheDocument()
    const open = screen.getByRole('link', { name: 'Open on X' })
    expect(open).toHaveAttribute('href', 'https://x.com/bob/status/2')
    expect(open.querySelector('svg')).toBeInTheDocument()
    expect(screen.queryByText('Open')).not.toBeInTheDocument()
  })

  it('resolves a pasted x.com URL to the preview path via window.location.assign', () => {
    const assignSpy = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { ...window.location, assign: assignSpy },
      writable: true,
    })

    render(<DesktopStageChrome {...stageBase} current={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'Paste a link' }))
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
    expect(peekPreviewOpenIntent()).toBe('paste')
  })

  it('keeps the paste field collapsed until the paste button is clicked', () => {
    render(<DesktopStageChrome {...stageBase} current={null} />)
    expect(screen.queryByLabelText('Paste a link to preview')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Paste a link' }))
    expect(screen.getByLabelText('Paste a link to preview')).toBeInTheDocument()
  })

  it('keeps the expanded paste field the same height as the icon cluster', () => {
    const { rerender } = render(<DesktopStageChrome {...stageBase} current={null} />)
    expect(screen.getByRole('button', { name: 'Paste a link' }).className).toContain('h-10')
    fireEvent.click(screen.getByRole('button', { name: 'Paste a link' }))
    expect(screen.getByLabelText('Paste a link to preview').closest('form')?.className).toContain(
      'h-10',
    )
    expect(screen.queryByLabelText('Hide controls')).not.toBeInTheDocument()
    rerender(<DesktopStageChrome {...stageBase} current={null} />)
  })

  it('collapses the paste field on Escape', () => {
    render(<DesktopStageChrome {...stageBase} current={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'Paste a link' }))
    expect(screen.getByLabelText('Paste a link to preview')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByLabelText('Paste a link to preview')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Paste a link' })).toBeInTheDocument()
  })

  it('shows "Not a supported link" for a garbage paste', () => {
    render(<DesktopStageChrome {...stageBase} current={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'Paste a link' }))
    const input = screen.getByLabelText('Paste a link to preview')
    fireEvent.change(input, { target: { value: 'not a link at all' } })
    fireEvent.submit(input.closest('form')!)

    expect(screen.getByText('Not a supported link')).toBeInTheDocument()
  })

  const personalCollection = {
    tab: 'live' as const,
    onTabChange: vi.fn(),
    onDone: vi.fn(),
    onTag: vi.fn(),
    onSave: vi.fn(),
    onLiveTag: vi.fn(),
    savedKeys: new Set<string>(),
    remaining: 0,
    onClose: vi.fn(),
  }

  it('shows the paste control on the personal Live tab', () => {
    render(
      <DesktopStageChrome
        {...stageBase}
        mode="personal"
        current={videoItem()}
        collection={personalCollection}
        onPastePost={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Paste a link' })).toBeInTheDocument()
  })

  it('shows the paste control on Saved', () => {
    render(
      <DesktopStageChrome
        {...stageBase}
        mode="personal"
        current={videoItem()}
        collection={{ ...personalCollection, tab: 'collection' }}
        onPastePost={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Paste a link' })).toBeInTheDocument()
  })

  it('does not put the type filter in the top bar', () => {
    render(<DesktopStageChrome {...stageBase} current={videoItem({ trendCount: 12 })} />)
    expect(screen.queryByRole('group', { name: 'Playlist filter' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Videos' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Paste a link' })).toBeInTheDocument()
  })

  it('adds in place on the personal theater and does not navigate away', async () => {
    const assignSpy = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { ...window.location, assign: assignSpy },
      writable: true,
    })
    const onPastePost = vi.fn().mockResolvedValue(true)

    render(
      <DesktopStageChrome
        {...stageBase}
        mode="personal"
        current={videoItem()}
        collection={personalCollection}
        onPastePost={onPastePost}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Paste a link' }))
    const input = screen.getByLabelText('Paste a link to preview')
    fireEvent.change(input, { target: { value: 'https://x.com/alice/status/123' } })
    fireEvent.submit(input.closest('form')!)

    await waitFor(() => {
      expect(onPastePost).toHaveBeenCalledWith('https://x.com/alice/status/123')
    })
    expect(assignSpy).not.toHaveBeenCalled()
  })

  it('does not fall back to navigating away when personal paste has no handler', () => {
    const assignSpy = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { ...window.location, assign: assignSpy },
      writable: true,
    })

    render(
      <DesktopStageChrome
        {...stageBase}
        mode="personal"
        current={videoItem()}
        collection={personalCollection}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Paste a link' }))
    const input = screen.getByLabelText('Paste a link to preview')
    fireEvent.change(input, { target: { value: 'https://x.com/alice/status/123' } })
    fireEvent.submit(input.closest('form')!)

    expect(assignSpy).not.toHaveBeenCalled()
    expect(screen.getByText('Not a supported link')).toBeInTheDocument()
  })

  it('hides paste on a playlist (Make your own stays)', () => {
    render(
      <DesktopStageChrome
        {...stageBase}
        mode="playlist"
        current={videoItem()}
        playlist={{ tag: 'claude-code', curator: 'weedauwl', count: 12 }}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Paste a link' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Make your own' })).toBeInTheDocument()
  })

  it('keeps de-clutter out of the top bar so the avatar stays put', () => {
    render(<DesktopStageChrome {...stageBase} current={videoItem()} />)
    expect(screen.queryByLabelText('Hide controls')).not.toBeInTheDocument()
  })

  it('collection mode: the close button sits inside the tab-selector pill, not in the far-right cluster', () => {
    const collection = {
      tab: 'live' as const,
      onTabChange: vi.fn(),
      onDone: vi.fn(),
      onTag: vi.fn(),
      onSave: vi.fn(),
      onLiveTag: vi.fn(),
      savedKeys: new Set<string>(),
      remaining: 0,
      onClose: vi.fn(),
    }
    render(<DesktopStageChrome {...stageBase} current={videoItem()} collection={collection} />)

    const closeBtn = screen.getByLabelText('Close')
    const liveTab = screen.getByText('Live', { selector: 'button' })
    // Same immediate pill container as the tab buttons (contained cluster).
    expect(closeBtn.parentElement).toBe(liveTab.parentElement)
    fireEvent.click(closeBtn)
    expect(collection.onClose).toHaveBeenCalled()

    // The far-right cluster (outside the tab pill) holds paste + avatar —
    // no stray close button, and de-clutter lives in the dock.
    const paste = screen.getByRole('button', { name: 'Paste a link' })
    const rightCluster = paste.parentElement!.parentElement!
    expect(rightCluster.querySelector('[aria-label="Close"]')).toBeNull()
    expect(screen.queryByLabelText('Hide controls')).not.toBeInTheDocument()
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

  it('labels video and photo Download, distinguished by film vs image icon', () => {
    mockUseSendFile.mockReturnValue({
      supported: true,
      ready: true,
      sending: false,
      mode: 'download' as const,
      send: vi.fn(),
    })
    const { rerender } = render(<DesktopStageChrome {...stageBase} current={videoItem()} />)
    const videoBtn = screen.getByRole('button', { name: 'Download' })
    expect(videoBtn.querySelector('.lucide-film')).toBeTruthy()
    expect(screen.getByTitle('Download the video')).toBeInTheDocument()
    rerender(<DesktopStageChrome {...stageBase} current={videoItem({ contentType: 'photo' })} />)
    const photoBtn = screen.getByRole('button', { name: 'Download' })
    expect(photoBtn.querySelector('.lucide-image')).toBeTruthy()
    expect(screen.getByTitle('Download the photo')).toBeInTheDocument()
    expect(screen.queryByTitle('Download the video')).not.toBeInTheDocument()
  })

  it('shared+authed SavePostButton carries the clay-border outline', async () => {
    render(<DesktopStageChrome {...stageBase} mode="shared" authed current={videoItem()} />)
    const saveBtn = await screen.findByText('Save')
    expect(saveBtn.closest('button')!.className).toContain('border-clay')
  })

  it('does not show tag name chips in the action row', () => {
    render(
      <DesktopStageChrome
        {...stageBase}
        current={textItem({ contentType: 'article', text: 'Army title' })}
        itemTags={['ai']}
      />,
    )
    expect(screen.queryByText('#ai')).not.toBeInTheDocument()
    expect(screen.getByText('Copy')).toBeInTheDocument()
  })

  it('shared+authed shows Tag N when the lead has tags, not action-row chips', async () => {
    resetSavePostOwnershipCache()
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [{ id: '1', platform: 'twitter' }] }),
    })
    render(
      <DesktopStageChrome
        {...stageBase}
        mode="shared"
        authed
        current={videoItem()}
        itemTags={['social']}
        onSharedTag={vi.fn()}
      />,
    )
    expect(screen.queryByText('#social')).not.toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Tag 1' })).toBeInTheDocument()
    const tag = screen.getByRole('button', { name: 'Tag 1' })
    expect(tag.className).toContain('border-white/25')
    expect(tag.className).not.toContain('text-clay')
    expect(tag.querySelector('.lucide-tag')?.classList.contains('text-clay')).toBe(true)
  })

  it('collection Tag keeps the glass border when tagged — clay is on the icon only', () => {
    const collection = {
      tab: 'collection' as const,
      onTabChange: vi.fn(),
      onDone: vi.fn(),
      onTag: vi.fn(),
      onSave: vi.fn(),
      savedKeys: new Set<string>(),
      remaining: 1,
      onClose: vi.fn(),
      tags: ['cats'],
    }
    render(<DesktopStageChrome {...stageBase} current={videoItem()} collection={collection} />)
    const tag = screen.getByRole('button', { name: 'Tag 1' })
    expect(tag.className).toContain('border-white/25')
    expect(tag.className).not.toContain('text-clay')
    expect(tag.querySelector('.lucide-tag')?.classList.contains('text-clay')).toBe(true)
    expect(tag).toHaveTextContent('1')
  })

  it('caps the Tag button count at 5', () => {
    const collection = {
      tab: 'collection' as const,
      onTabChange: vi.fn(),
      onDone: vi.fn(),
      onTag: vi.fn(),
      onSave: vi.fn(),
      savedKeys: new Set<string>(),
      remaining: 1,
      onClose: vi.fn(),
      tags: ['a', 'b', 'c', 'd', 'e', 'f'],
    }
    render(<DesktopStageChrome {...stageBase} current={videoItem()} collection={collection} />)
    expect(screen.getByRole('button', { name: 'Tag 5' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tag 6' })).not.toBeInTheDocument()
  })

  it('signed-in shared preview shows Live ⇄ Saved, not the visitor LIVE badge', () => {
    const onTabChange = vi.fn()
    const onClose = vi.fn()
    render(
      <DesktopStageChrome
        {...stageBase}
        mode="shared"
        authed
        current={videoItem()}
        accountTabs={{ tab: 'live', onTabChange, onClose }}
      />,
    )
    expect(screen.getByRole('button', { name: 'Live' })).toHaveAttribute('aria-current', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Saved' }))
    expect(onTabChange).toHaveBeenCalledWith('collection')
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalled()
    // Visitor live-dot badge is gone — only the Live tab button remains.
    expect(screen.getAllByText('Live')).toHaveLength(1)
  })

  it('collection live-tab Save carries the clay-border outline, Download (when present) stays plain glass', () => {
    mockUseSendFile.mockReturnValue({
      supported: true,
      ready: true,
      sending: false,
      mode: 'download' as const,
      send: vi.fn(),
    })
    const collection = {
      tab: 'live' as const,
      onTabChange: vi.fn(),
      onDone: vi.fn(),
      onTag: vi.fn(),
      onSave: vi.fn(),
      onLiveTag: vi.fn(),
      savedKeys: new Set<string>(),
      remaining: 0,
      onClose: vi.fn(),
    }
    render(<DesktopStageChrome {...stageBase} current={videoItem()} collection={collection} />)

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

  it('collection tab uses Live actions plus Archive — no Later or Delete', () => {
    mockUseSendFile.mockReturnValue({
      supported: true,
      ready: true,
      sending: false,
      mode: 'download' as const,
      send: vi.fn(),
    })
    const collection = {
      tab: 'collection' as const,
      onTabChange: vi.fn(),
      onDone: vi.fn(),
      onTag: vi.fn(),
      onSave: vi.fn(),
      onLiveTag: vi.fn(),
      savedKeys: new Set<string>(),
      remaining: 3,
      onClose: vi.fn(),
    }
    render(<DesktopStageChrome {...stageBase} current={videoItem()} collection={collection} />)
    const archive = screen.getByRole('button', { name: 'Archive' })
    const download = screen.getByRole('button', { name: 'Download' })
    expect(
      archive.compareDocumentPosition(download) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(archive.className).toContain('border-clay')
    expect(archive.className).not.toContain('bg-clay-grad')
    expect(screen.getByRole('button', { name: 'Link' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tag' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open on X' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Later' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
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

  it('renders Live before Saved, not the bare "Collection" label', () => {
    const collection = {
      tab: 'live' as const,
      onTabChange: vi.fn(),
      onDone: vi.fn(),
      onTag: vi.fn(),
      onSave: vi.fn(),
      onLiveTag: vi.fn(),
      savedKeys: new Set<string>(),
      remaining: 0,
      onClose: vi.fn(),
    }
    render(<DesktopStageChrome {...stageBase} current={videoItem()} collection={collection} />)

    expect(screen.queryByText('Collection')).not.toBeInTheDocument()
    const liveTab = screen.getByText('Live', { selector: 'button' })
    const collectionTab = screen.getByText('Saved')
    expect(
      liveTab.compareDocumentPosition(collectionTab) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })
})

/**
 * Round 8: the Spotify-style repeat control in the transport cluster, under
 * play/pause. Only renders when BOTH
 * `repeatMode` and `onCycleRepeat` are provided (home/shared mode) —
 * collection mode always loops on its own and the collection theater is a finite backlog,
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

describe('DesktopStageChrome: Open action uses the source platform glyph', () => {
  const stageBase = {
    mode: 'home' as const,
    declutter: false,
    onToggleDeclutter: vi.fn(),
  }

  it('is a platform-glyph link with no added-to-ADHX time', () => {
    render(
      <DesktopStageChrome
        {...stageBase}
        current={videoItem({ addedAt: '2026-08-18T00:00:00Z' })}
      />,
    )
    const open = screen.getByRole('link', { name: 'Open on X' })
    expect(open.querySelector('svg')).toBeInTheDocument()
    expect(open.textContent?.trim()).toBe('')
    expect(screen.queryByLabelText(/Added to ADHX/)).not.toBeInTheDocument()
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
    resetArticleMarkdownCache()
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

  it('uses a file-text icon for articles and a copy icon for tweets', () => {
    const { rerender } = render(
      <DesktopStageChrome {...stageBase} current={textItem({ contentType: 'article' })} />,
    )
    expect(
      screen.getByRole('button', { name: 'Copy' }).querySelector('.lucide-file-text'),
    ).toBeTruthy()
    expect(screen.getByTitle('Copy the article')).toBeInTheDocument()
    rerender(<DesktopStageChrome {...stageBase} current={textItem()} />)
    expect(screen.getByRole('button', { name: 'Copy' }).querySelector('.lucide-copy')).toBeTruthy()
    expect(screen.getByTitle("Copy the post's text")).toBeInTheDocument()
  })

  it('copies the article body, not just the title', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        article: { content: '# Why an army\n\nOne account has a ceiling.' },
      }),
    })
    render(
      <DesktopStageChrome
        {...stageBase}
        current={textItem({
          contentType: 'article',
          text: 'Army title',
          author: 'adriamatz',
          bookmarkId: '99',
        })}
      />,
    )
    fireEvent.click(screen.getByText('Copy'))
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        'Army title\n\n# Why an army\n\nOne account has a ceiling.',
      ),
    )
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
 * `TheaterAvatarMenu` explicitly as `mode === 'home' || !!collection`. Asserted
 * directly on the mocked `TheaterAvatarMenu`'s captured props (see the
 * module mock above).
 */
describe('DesktopStageChrome: theaterActive prop wiring', () => {
  const stageBase = {
    mode: 'home' as const,
    declutter: false,
    onToggleDeclutter: vi.fn(),
  }

  const collection = {
    tab: 'live' as const,
    onTabChange: vi.fn(),
    onDone: vi.fn(),
    onTag: vi.fn(),
    onSave: vi.fn(),
    onLiveTag: vi.fn(),
    savedKeys: new Set<string>(),
    remaining: 0,
    onClose: vi.fn(),
  }

  it('passes theaterActive: true in home mode (no collection)', () => {
    render(<DesktopStageChrome {...stageBase} mode="home" current={videoItem()} />)
    expect(mockTheaterAvatarMenu).toHaveBeenCalledWith(
      expect.objectContaining({ theaterActive: true }),
    )
  })

  it('passes theaterActive: true whenever the collection theater is present, regardless of mode', () => {
    render(
      <DesktopStageChrome
        {...stageBase}
        mode="personal"
        current={videoItem()}
        collection={collection}
      />,
    )
    expect(mockTheaterAvatarMenu).toHaveBeenCalledWith(
      expect.objectContaining({ theaterActive: true }),
    )
  })

  it('passes theaterActive: false in collection mode (no collection)', () => {
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

  it('passes theaterActive: false in shared mode (no collection)', () => {
    render(<DesktopStageChrome {...stageBase} mode="shared" current={videoItem()} />)
    expect(mockTheaterAvatarMenu).toHaveBeenCalledWith(
      expect.objectContaining({ theaterActive: false }),
    )
  })

  it('passes theaterActive: true in shared mode when account tabs are set', () => {
    render(
      <DesktopStageChrome
        {...stageBase}
        mode="shared"
        current={videoItem()}
        accountTabs={{ tab: 'live', onTabChange: vi.fn(), onClose: vi.fn() }}
      />,
    )
    expect(mockTheaterAvatarMenu).toHaveBeenCalledWith(
      expect.objectContaining({ theaterActive: true }),
    )
  })
})

describe('DesktopStageChrome: theaterTabs prop wiring', () => {
  const stageBase = {
    mode: 'home' as const,
    declutter: false,
    onToggleDeclutter: vi.fn(),
  }

  const collection = {
    tab: 'live' as const,
    onTabChange: vi.fn(),
    onDone: vi.fn(),
    onTag: vi.fn(),
    onSave: vi.fn(),
    onLiveTag: vi.fn(),
    savedKeys: new Set<string>(),
    remaining: 0,
    onClose: vi.fn(),
  }

  it('passes Live / Saved into the avatar menu from the collection chrome', () => {
    render(
      <DesktopStageChrome
        {...stageBase}
        mode="personal"
        current={videoItem()}
        collection={collection}
      />,
    )
    expect(mockTheaterAvatarMenu).toHaveBeenCalledWith(
      expect.objectContaining({
        theaterTabs: { tab: 'live', onTabChange: collection.onTabChange },
      }),
    )
    expect(screen.getByRole('button', { name: 'Saved' })).toBeInTheDocument()
  })

  it('passes Live / Saved into the avatar menu from signed-in shared tabs', () => {
    const onTabChange = vi.fn()
    render(
      <DesktopStageChrome
        {...stageBase}
        mode="shared"
        current={videoItem()}
        accountTabs={{ tab: 'live', onTabChange, onClose: vi.fn() }}
      />,
    )
    expect(mockTheaterAvatarMenu).toHaveBeenCalledWith(
      expect.objectContaining({ theaterTabs: { tab: 'live', onTabChange } }),
    )
  })

  it('omits theaterTabs when there is no Live / Collection switch', () => {
    render(<DesktopStageChrome {...stageBase} mode="home" current={videoItem()} />)
    expect(mockTheaterAvatarMenu.mock.calls[0][0].theaterTabs).toBeUndefined()
  })
})
