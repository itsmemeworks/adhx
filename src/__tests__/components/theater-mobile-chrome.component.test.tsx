/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TheaterMobileChrome } from '@/components/theater/TheaterMobileChrome'
import { resetSavePostOwnershipCache } from '@/components/theater/SavePostButton'
import { theaterItemKey } from '@/components/theater/types'
import type { TheaterItem, TheaterPersonalChrome } from '@/components/theater/types'
import { resetArticleMarkdownCache } from '@/lib/theater/article-body'
import { resetClampExpandPreference } from '@/components/theater/useClampExpand'

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
  mode: 'download' as 'download' | 'share',
  send: vi.fn(),
  download: vi.fn(),
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
  resetClampExpandPreference()
  resetSavePostOwnershipCache()
  mockUseSendFile.mockReturnValue({
    supported: false,
    ready: false,
    sending: false,
    mode: 'download' as const,
    send: vi.fn(),
    download: vi.fn(),
  })
  mockTheaterAvatarMenu.mockClear()
})

/**
 * The peek bar's centre label. Two buttons carry the "Expand up next" label
 * (the drag handle above it does too), so pick the one that actually holds
 * text — the handle is a bare chevron.
 */
function peekCentreText(): string {
  const count = document.querySelector('[data-theater-queue-count]')
  expect(count).not.toBeNull()
  return (count?.textContent ?? '').trim()
}

function openShareOptions() {
  fireEvent.click(screen.getByRole('button', { name: 'Share' }))
  return screen.getByRole('menu', { name: 'Share options' })
}

describe('TheaterMobileChrome: iOS viewport anchoring', () => {
  it('keeps Paste and the account menu inside the visual-viewport chrome layer', () => {
    const { container } = render(<TheaterMobileChrome {...base} current={videoItem()} />)

    expect(container.firstElementChild).toHaveClass('absolute')
    const paste = screen.getByRole('button', { name: 'Paste a link' })
    expect(paste.closest('.theater-mobile-top-chrome')).not.toBeNull()
    expect(mockTheaterAvatarMenu).toHaveBeenCalled()
  })
})

// Mobile actions use a frosted vertical rail. Save remains distinguishable
// through its clay icon while transport stays grouped in the bottom bar.
describe('TheaterMobileChrome: caption', () => {
  it('shows a two-line caption and no more/less control', () => {
    render(<TheaterMobileChrome {...base} current={videoItem()} />)
    const caption = screen.getByText('a caption for the video')
    expect(caption.closest('p')).toHaveClass('line-clamp-2')
    expect(screen.queryByRole('button', { name: 'more' })).not.toBeInTheDocument()
  })

  it('turns measured caption overflow into a Safari-safe inner clamp and Read control', async () => {
    const clientHeight = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(32)
    const scrollHeight = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(96)
    try {
      render(
        <TheaterMobileChrome
          {...base}
          current={videoItem({ text: 'A long media caption that needs the full reading mode.' })}
          onToggleArticleMode={vi.fn()}
        />,
      )

      const read = await screen.findByRole('button', { name: 'Read the full post' })
      expect(read).not.toHaveClass('line-clamp-2')
      expect(read.querySelector('span.line-clamp-2')).not.toBeNull()
    } finally {
      clientHeight.mockRestore()
      scrollHeight.mockRestore()
    }
  })

  it('opens Read from the caption without a separate reading button', () => {
    const onToggle = vi.fn()
    render(
      <TheaterMobileChrome
        {...base}
        current={videoItem({
          quote: { author: 'other', text: 'the quoted tweet' },
        })}
        onToggleArticleMode={onToggle}
      />,
    )
    const caption = screen.getByText('a caption for the video')
    expect(screen.queryByRole('button', { name: /^Read$/ })).not.toBeInTheDocument()
    fireEvent.click(caption)
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('hides the caption in article mode and keeps Watch on the left of the action row', () => {
    render(
      <TheaterMobileChrome
        {...base}
        current={videoItem({
          quote: { author: 'other', text: 'the quoted tweet' },
        })}
        articleMode
        onToggleArticleMode={vi.fn()}
      />,
    )
    expect(screen.queryByText('a caption for the video')).not.toBeInTheDocument()
    const watch = screen.getByRole('button', { name: 'Watch' })
    expect(watch.nextElementSibling?.className).toContain('fixed')
    expect(watch).not.toHaveTextContent('Watch')
  })

  it('does not show tag name chips in the action row', () => {
    render(
      <TheaterMobileChrome
        {...base}
        current={textItem({ contentType: 'article', text: 'Army title' })}
        itemTags={['ai']}
      />,
    )
    expect(screen.queryByText('#ai')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument()
    openShareOptions()
    expect(screen.getByRole('menuitem', { name: 'Copy the article' })).toBeInTheDocument()
  })

  it('lets article body scroll through the empty caption zone', () => {
    render(
      <TheaterMobileChrome
        {...base}
        current={textItem({ contentType: 'article', text: 'Army title' })}
        itemTags={['ai']}
      />,
    )
    const share = screen.getByRole('button', { name: 'Share' })
    const cluster = share.parentElement?.parentElement
    expect(cluster?.className).toContain('pointer-events-auto')
    expect(cluster?.className).toContain('fixed')
    expect(cluster?.className).toContain('right-3')
    expect(cluster?.className).not.toContain('flex-1')
    const actionRow = cluster?.parentElement
    expect(actionRow?.className).not.toContain('pointer-events-auto')
    expect(actionRow?.parentElement?.className).toContain('pointer-events-none')
    expect(share.className).toContain('bg-black/20')
    expect(share.className).toContain('backdrop-blur-md')
  })
})

describe('TheaterMobileChrome: Save/Download button hierarchy', () => {
  it('sign-in prompt Save uses the action-rail style with a clay icon', () => {
    render(<TheaterMobileChrome {...base} current={videoItem()} />)
    const saveBtn = screen.getByRole('button', { name: 'Save' })
    expect(saveBtn.className).toContain('border-white/15')
    expect(saveBtn.className).toContain('bg-black/20')
    expect(saveBtn.className).toContain('text-clay')
    expect(saveBtn.className).not.toContain('bg-clay-grad')
    expect(saveBtn).not.toHaveTextContent('Save')
    expect(saveBtn.parentElement).toHaveAttribute('data-testid', 'mobile-control-actions')
  })

  it('moves Download behind Share while Save stays directly on the action rail', () => {
    mockUseSendFile.mockReturnValue({
      supported: true,
      ready: true,
      sending: false,
      mode: 'download' as const,
      send: vi.fn(),
      download: vi.fn(),
    })
    render(<TheaterMobileChrome {...base} current={videoItem()} />)
    expect(screen.queryByRole('button', { name: 'Download' })).not.toBeInTheDocument()
    openShareOptions()
    expect(screen.getByRole('menuitem', { name: 'Download the video' })).toBeInTheDocument()

    const saveBtn = screen.getByRole('button', { name: 'Save' })
    expect(saveBtn.className).toContain('text-clay')
  })

  it('labels video and photo downloads by the staged media type', () => {
    mockUseSendFile.mockReturnValue({
      supported: true,
      ready: true,
      sending: false,
      mode: 'download' as const,
      send: vi.fn(),
      download: vi.fn(),
    })
    const { rerender } = render(<TheaterMobileChrome {...base} current={videoItem()} />)
    openShareOptions()
    expect(screen.getByRole('menuitem', { name: 'Download the video' })).toBeInTheDocument()
    rerender(<TheaterMobileChrome {...base} current={videoItem({ contentType: 'photo' })} />)
    expect(screen.getByRole('menuitem', { name: 'Download the photo' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Download the video' })).not.toBeInTheDocument()
  })

  it('collection live-tab Save carries the clay cue while Download stays in Share', () => {
    mockUseSendFile.mockReturnValue({
      supported: true,
      ready: true,
      sending: false,
      mode: 'download' as const,
      send: vi.fn(),
      download: vi.fn(),
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
    expect(saveBtn.className).toContain('border-white/15')
    expect(saveBtn.className).toContain('text-clay')
    expect(saveBtn).not.toHaveTextContent('Save')

    openShareOptions()
    expect(screen.getByRole('menuitem', { name: 'Download the video' })).toBeInTheDocument()
  })

  it('collection tab uses Live actions plus Archive — no Later or Delete', () => {
    mockUseSendFile.mockReturnValue({
      supported: true,
      ready: true,
      sending: false,
      mode: 'download' as const,
      send: vi.fn(),
      download: vi.fn(),
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
    const archive = screen.getByRole('button', { name: 'Archive' })
    expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tag' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tag' }).className).toContain('border-white/15')
    expect(screen.getByRole('link', { name: 'Open on X' })).toBeInTheDocument()
    expect(archive.className).toContain('rounded-full')
    expect(archive.className).toContain('border-clay')
    expect(archive.className).not.toContain('flex-col')
    expect(archive.className).not.toContain('bg-done')
    expect(archive.className).not.toContain('bg-clay-grad')
    expect(screen.queryByRole('button', { name: 'Later' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Paste a link' })).toBeInTheDocument()
    openShareOptions()
    expect(screen.getByRole('menuitem', { name: 'Download the video' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Share link' })).toBeInTheDocument()
  })

  it('tagged collection Tag keeps the neutral rail style — clay is on the icon only', () => {
    const collection: TheaterPersonalChrome = {
      tab: 'collection',
      onTabChange: vi.fn(),
      onDone: vi.fn(),
      onTag: vi.fn(),
      onSave: vi.fn(),
      savedKeys: new Set<string>(),
      remaining: 3,
      onClose: vi.fn(),
      tags: ['cats'],
    }
    render(<TheaterMobileChrome {...base} current={videoItem()} collection={collection} />)
    const tag = screen.getByRole('button', { name: 'Tag 1' })
    expect(tag.className).toContain('border-white/15')
    expect(tag.className).not.toContain('text-clay')
    const icon = tag.querySelector('.lucide-tag')
    expect(icon?.classList.contains('text-clay')).toBe(true)
    expect(icon).toHaveAttribute('fill', 'none')
    expect(tag).toHaveTextContent('1')
  })

  it('centers a shared zero-count Tag without reserving or coloring count space', async () => {
    const onSharedTag = vi.fn()
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [{ id: '1', platform: 'twitter' }] }),
    })
    const { rerender } = render(
      <TheaterMobileChrome
        {...base}
        mode="shared"
        authed
        current={videoItem()}
        itemTags={[]}
        onSharedTag={onSharedTag}
      />,
    )

    const tag = await screen.findByRole('button', { name: 'Tag' })
    expect(tag).toHaveClass('items-center', 'justify-center', 'text-white/90')
    expect(tag).not.toHaveClass('text-clay')
    expect(tag.querySelector('.lucide-tag')).not.toHaveClass('text-clay')
    expect(tag.querySelector('.lucide-tag')).toHaveAttribute('fill', 'none')
    expect(tag.textContent).toBe('')
    expect(tag.querySelectorAll('span')).toHaveLength(1)

    rerender(
      <TheaterMobileChrome
        {...base}
        mode="shared"
        authed
        current={videoItem()}
        itemTags={['cats']}
        onSharedTag={onSharedTag}
      />,
    )
    const tagged = screen.getByRole('button', { name: 'Tag 1' })
    expect(tagged).toHaveClass('items-center', 'justify-center', 'text-white/90')
    expect(tagged.querySelector('.lucide-tag')).toHaveClass('text-clay')
    expect(tagged).toHaveTextContent('1')
  })

  it('shows paste on the personal Live tab too', () => {
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
    expect(screen.getByRole('button', { name: 'Paste a link' })).toBeInTheDocument()
  })

  it('puts type pills in the up-next sheet, not the top bar', () => {
    const onToggleQueueType = vi.fn()
    const onClearQueueTypes = vi.fn()
    const { rerender } = render(
      <TheaterMobileChrome
        {...base}
        current={videoItem({ trendCount: 12 })}
        queueTypes={[]}
        onToggleQueueType={onToggleQueueType}
        onClearQueueTypes={onClearQueueTypes}
      />,
    )
    fireEvent.click(document.querySelector<HTMLButtonElement>('[data-theater-action="show-all"]')!)
    const videos = screen.getByRole('button', { name: 'Videos' })
    const paste = screen.getByRole('button', { name: 'Paste a link' })
    const text = screen.getByRole('button', { name: 'Text' })
    expect(videos).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Photos' })).toBeInTheDocument()
    expect(text).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Articles' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Quotes' })).not.toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Playlist filter' }).contains(paste)).toBe(false)
    videos.focus()
    fireEvent.keyDown(videos, { key: 'ArrowRight' })
    expect(videos).toHaveFocus()
    fireEvent.click(videos)
    expect(onToggleQueueType).toHaveBeenCalledWith('video')
    onToggleQueueType.mockClear()
    fireEvent.click(text)
    expect(onToggleQueueType.mock.calls).toEqual([['text'], ['article']])

    rerender(
      <TheaterMobileChrome
        {...base}
        current={videoItem()}
        queueTypes={['video', 'photo']}
        onToggleQueueType={onToggleQueueType}
        onClearQueueTypes={onClearQueueTypes}
      />,
    )
    expect(screen.getByRole('button', { name: 'Videos' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Photos' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false')

    const saved: TheaterPersonalChrome = {
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
    rerender(
      <TheaterMobileChrome
        {...base}
        current={videoItem()}
        collection={saved}
        queueTypes={['video', 'photo']}
        onToggleQueueType={onToggleQueueType}
        onClearQueueTypes={onClearQueueTypes}
      />,
    )
    expect(screen.getByRole('button', { name: 'Videos' })).toBeInTheDocument()
  })

  it('pins the flame left of paste on media and text', () => {
    const { rerender } = render(
      <TheaterMobileChrome {...base} current={videoItem({ trendCount: 12 })} />,
    )
    let flame = screen.getByLabelText('12 trending')
    const paste = screen.getByRole('button', { name: 'Paste a link' })
    expect(flame.compareDocumentPosition(paste) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    rerender(<TheaterMobileChrome {...base} current={textItem({ trendCount: 12 })} />)
    flame = screen.getByLabelText('12 trending')
    expect(
      flame.compareDocumentPosition(screen.getByRole('button', { name: 'Paste a link' })) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  /**
   * The Live ⇄ Saved switch is NOT a control this chrome draws. A tab
   * pill in the top scrim overlapped the logo, trend/time chips and paste
   * button at phone widths (owner), so mobile hands the pair to the burger as
   * Theater sub-options. Desktop keeps its top-bar pill and now also passes
   * the same rows so the keyboard menu can switch tabs. What this chrome
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
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument()
    // No tab buttons of its own — in the scrim or the peek bar.
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
    expect(screen.queryByText('Collection')).not.toBeInTheDocument()
    expect(screen.queryByText('Live', { selector: 'button' })).not.toBeInTheDocument()
  })

  /**
   * The slot the tabs vacated: the peek bar's centre now carries the queue
   * position in the collection theater too (owner asked the count to be boundary-aware, and
   * collection was the one mode with nowhere to put it).
   */
  it('spends the freed peek-bar centre on unseen remaining', () => {
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
        queuePlayed={0}
        queueToPlay={2}
        collection={collection}
      />,
    )

    expect(peekCentreText()).toBe('2 in queue')
  })

  it('names Now playing + Next off-repeat, and the pile when looping', () => {
    const items = Array.from({ length: 23 }, (_, i) => videoItem({ bookmarkId: `${i + 1}` }))
    const { rerender } = render(
      <TheaterMobileChrome
        {...base}
        current={items[0]}
        items={items}
        currentKey="twitter:1"
        queueTotal={40}
        queuePlayed={0}
        queueToPlay={23}
      />,
    )
    expect(peekCentreText()).toBe('23 in queue')

    rerender(
      <TheaterMobileChrome
        {...base}
        current={items[0]}
        items={items}
        currentKey="twitter:1"
        queueTotal={23}
        queueLooping
      />,
    )
    expect(peekCentreText()).toBe('23 on repeat')

    rerender(
      <TheaterMobileChrome
        {...base}
        current={items[0]}
        items={items}
        currentKey="twitter:1"
        queueTotal={1}
        queueToPlay={1}
        queueLooping
      />,
    )
    expect(peekCentreText()).toBe('1 on repeat')
  })

  it('opens the mobile queue with Now playing first and circular order below it', () => {
    const items = [
      videoItem({ bookmarkId: '1', text: 'previous post' }),
      videoItem({ bookmarkId: '2', text: 'playing post' }),
      videoItem({ bookmarkId: '3', text: 'next post' }),
    ]
    render(
      <TheaterMobileChrome
        {...base}
        current={items[1]}
        items={items}
        currentKey={theaterItemKey(items[1])}
      />,
    )

    fireEvent.click(document.querySelector<HTMLButtonElement>('[data-theater-action="show-all"]')!)
    const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-theater-queue-item]'))
    expect(rows.map((row) => row.dataset.theaterItemKey)).toEqual([
      'twitter:2',
      'twitter:3',
      'twitter:1',
    ])
    expect(screen.getAllByRole('separator')[0]).toHaveTextContent('Now playing')
    expect(rows[0]).toHaveAttribute('aria-current', 'true')
    expect(rows[1]).toHaveTextContent('next ↓')
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
        queuePlayed={0}
        queueToPlay={1}
        queueTotal={1}
        collection={collection}
      />,
    )
    expect(peekCentreText()).toBe('1 in queue')

    // The live tab, where "new" does mean something, keeps it.
    rerender(
      <TheaterMobileChrome
        {...base}
        current={items[0]}
        items={items}
        currentKey="twitter:1"
        newCount={3}
        queuePlayed={0}
        queueToPlay={1}
        queueTotal={1}
        collection={{ ...collection, tab: 'live' }}
      />,
    )
    expect(peekCentreText()).toBe('1 in queue · 3 new')
  })
})

describe('TheaterMobileChrome: text posts', () => {
  it('text posts never show Download (nothing sendable)', () => {
    render(<TheaterMobileChrome {...base} current={textItem()} />)
    expect(screen.queryByText('Download')).not.toBeInTheDocument()
  })
})

describe('TheaterMobileChrome: Open action uses the source platform glyph', () => {
  it('is a platform-glyph link with no added-to-ADHX time', () => {
    render(
      <TheaterMobileChrome {...base} current={videoItem({ addedAt: '2026-08-18T00:00:00Z' })} />,
    )
    const open = screen.getByRole('link', { name: 'Open on X' })
    expect(open).toHaveAttribute('href', 'https://x.com/alice/status/1')
    expect(open.className).toContain('order-first')
    expect(open.querySelector('svg')).toBeInTheDocument()
    expect(screen.queryByLabelText(/Added to ADHX/)).not.toBeInTheDocument()
  })
})

// Focus lives with the bottom transport controls. Entering focus fades the
// stage-mounted actions and joined swipe capsule while keeping an obvious
// exit control in the bar.
describe('TheaterMobileChrome: de-clutter icon', () => {
  it('shows the outward focus icon, then an always-visible restore icon', () => {
    render(<TheaterMobileChrome {...base} current={videoItem()} />)
    const toggle = screen.getByLabelText('Hide controls')
    expect(toggle.querySelector('.lucide-maximize-2')).toBeInTheDocument()

    fireEvent.click(toggle)
    const restored = screen.getByLabelText('Show controls')
    expect(restored.querySelector('.lucide-minimize-2')).toBeInTheDocument()
    expect(restored.closest('[data-testid="mobile-playback-controls"]')).toBeInTheDocument()
  })

  it('collapses an open playlist before entering clutter-free mode', () => {
    render(<TheaterMobileChrome {...base} current={videoItem()} />)
    const queue = document.querySelector<HTMLButtonElement>('[data-theater-action="show-all"]')!

    fireEvent.click(queue)
    expect(queue).toHaveAttribute('aria-expanded', 'true')

    fireEvent.click(screen.getByLabelText('Hide controls'))
    expect(queue).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByLabelText('Show controls')).toBeInTheDocument()
    const actions = screen.getByTestId('mobile-control-actions')
    expect(actions.className).toContain('opacity-0')
    expect(actions.className).toContain('bottom-[calc(70%+0.75rem)]')
  })

  it('presents Focus rather than Show controls when Up next is opened from clutter-free mode', () => {
    render(<TheaterMobileChrome {...base} current={videoItem()} />)
    const queue = document.querySelector<HTMLButtonElement>('[data-theater-action="show-all"]')!

    fireEvent.click(screen.getByLabelText('Hide controls'))
    fireEvent.click(queue)

    const focus = screen.getByLabelText('Hide controls')
    expect(focus.querySelector('.lucide-maximize-2')).toBeInTheDocument()
    fireEvent.click(focus)
    expect(queue).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByLabelText('Show controls')).toBeInTheDocument()
  })

  it('repositions hidden chrome before a rapid restore during the playlist-close fade', async () => {
    render(<TheaterMobileChrome {...base} current={videoItem()} />)
    const queue = document.querySelector<HTMLButtonElement>('[data-theater-action="show-all"]')!
    const actions = screen.getByTestId('mobile-control-actions')

    fireEvent.click(queue)
    fireEvent.click(screen.getByLabelText('Hide controls'))
    fireEvent.click(screen.getByLabelText('Show controls'))

    expect(actions.className).toContain('opacity-0')
    await waitFor(() => {
      expect(actions.className).not.toContain('bottom-[calc(70%+0.75rem)]')
      expect(actions.className).not.toContain('opacity-0')
    })
  })

  it('a stage tap hides chrome and resumes; a second tap only restores overlays', () => {
    const resumes: Event[] = []
    const onResume = (e: Event) => resumes.push(e)
    window.addEventListener('theater-resume', onResume)
    render(<TheaterMobileChrome {...base} current={videoItem()} />)

    expect(screen.getByLabelText('Hide controls')).toBeInTheDocument()
    fireEvent(window, new CustomEvent('theater-stage-tap'))
    expect(screen.getByLabelText('Show controls')).toBeInTheDocument()
    expect(resumes).toHaveLength(1)

    fireEvent(window, new CustomEvent('theater-stage-tap'))
    expect(screen.getByLabelText('Hide controls')).toBeInTheDocument()
    expect(resumes).toHaveLength(1)
    window.removeEventListener('theater-resume', onResume)
  })
})

describe('TheaterMobileChrome: bottom transport and swipe capsule', () => {
  it('groups prominent playback controls in the bottom bar', () => {
    render(<TheaterMobileChrome {...base} current={videoItem()} />)

    const pause = screen.getByRole('button', { name: 'Pause' })
    const volume = screen.getByRole('button', { name: 'Unmute' })
    const zone = screen.getByTestId('mobile-swipe-zone')
    expect(pause.className).toContain('h-11')
    expect(pause.className).toContain('w-11')
    expect(pause.className).toContain('text-clay')
    expect(pause.className).not.toContain('bg-clay')
    expect(pause.className).not.toContain('shadow-')
    expect(volume.className).toContain('h-11')
    expect(pause.parentElement).toHaveAttribute('data-testid', 'mobile-playback-controls')
    expect(pause.parentElement?.parentElement?.parentElement).toHaveStyle({
      height: 'calc(4.25rem + env(safe-area-inset-bottom))',
    })
    expect(zone.className).toContain('w-20')
    expect(zone.className).toContain('env(safe-area-inset-bottom)')
    const capsule = zone.querySelector('[data-theater-swipe-control]')
    expect(capsule).toHaveClass('rounded-full')
    expect(capsule).toHaveClass('bg-black/25')
    expect(capsule).toHaveClass('gap-2')
    expect(capsule).not.toHaveClass('divide-y')
    expect(capsule?.querySelector('[data-theater-swipe-hint]')).toBeNull()
    expect(zone).toHaveAttribute('aria-label', 'Swipe up for next post or down for previous post')
  })

  it('reflows short-height actions into one row above a compact swipe capsule', () => {
    render(<TheaterMobileChrome {...base} current={videoItem()} />)
    const actions = screen.getByTestId('mobile-control-actions')
    const capsule = screen
      .getByTestId('mobile-swipe-zone')
      .querySelector('[data-theater-swipe-control]')!

    expect(actions.className).toContain('w-12')
    expect(capsule.className).toContain('w-12')
    expect(actions.className).toContain('[@media(max-height:520px)]:w-auto')
    expect(actions.className).toContain('[@media(max-height:520px)]:flex-row')
    expect(actions.className).not.toContain('[@media(max-height:520px)]:grid')
    expect(capsule.className).toContain('[@media(max-height:520px)]:h-20')
  })

  it('keeps the playback control visible but disabled for a repeated text post', () => {
    render(<TheaterMobileChrome {...base} current={textItem()} repeatCurrent repeatMode="one" />)

    const pause = screen.getByRole('button', { name: 'Pause' })
    expect(pause).toBeDisabled()
    expect(pause).toHaveAttribute('aria-disabled', 'true')
    expect(pause.className).toContain('opacity-35')
  })

  it('advertises only the swipe directions that are available at queue boundaries', () => {
    const { rerender } = render(
      <TheaterMobileChrome {...base} current={videoItem()} canPrev={false} canNext />,
    )
    expect(screen.getByTestId('mobile-swipe-zone')).toHaveAttribute(
      'aria-label',
      'Swipe up for next post',
    )
    expect(screen.queryByText('NEXT')).not.toBeInTheDocument()
    expect(screen.queryByText('PREV')).not.toBeInTheDocument()

    rerender(<TheaterMobileChrome {...base} current={videoItem()} canPrev canNext={false} />)
    expect(screen.getByTestId('mobile-swipe-zone')).toHaveAttribute(
      'aria-label',
      'Swipe down for previous post',
    )

    rerender(
      <TheaterMobileChrome {...base} current={videoItem()} canPrev={false} canNext={false} />,
    )
    expect(
      screen.getByTestId('mobile-swipe-zone').querySelector('[data-theater-swipe-hint]'),
    ).toBeNull()
  })

  it('swipes up for next and down for previous', () => {
    const onNext = vi.fn()
    const onPrev = vi.fn()
    render(<TheaterMobileChrome {...base} current={videoItem()} onNext={onNext} onPrev={onPrev} />)
    const zone = screen.getByTestId('mobile-swipe-zone')

    fireEvent.touchStart(zone, {
      touches: [{ identifier: 1, clientX: 80, clientY: 320 }],
    })
    fireEvent.touchEnd(zone, {
      changedTouches: [{ identifier: 1, clientX: 82, clientY: 220 }],
    })
    expect(onNext).toHaveBeenCalledTimes(1)

    fireEvent.touchStart(zone, {
      touches: [{ identifier: 2, clientX: 82, clientY: 220 }],
    })
    fireEvent.touchEnd(zone, {
      changedTouches: [{ identifier: 2, clientX: 80, clientY: 320 }],
    })
    expect(onPrev).toHaveBeenCalledTimes(1)
  })

  it('accepts a vertical swipe from anywhere inside the joined arrow capsule', () => {
    const onNext = vi.fn()
    render(<TheaterMobileChrome {...base} current={videoItem()} onNext={onNext} />)
    const next = screen.getByRole('button', { name: 'Next post' })

    fireEvent.touchStart(next, {
      touches: [{ identifier: 1, clientX: 350, clientY: 720 }],
    })
    fireEvent.touchMove(next, {
      touches: [{ identifier: 1, clientX: 351, clientY: 650 }],
    })
    fireEvent.touchEnd(next, {
      changedTouches: [{ identifier: 1, clientX: 351, clientY: 620 }],
    })

    expect(onNext).toHaveBeenCalledTimes(1)
  })

  it('does not turn a control tap into navigation', () => {
    const onNext = vi.fn()
    render(<TheaterMobileChrome {...base} current={videoItem()} onNext={onNext} />)
    const pause = screen.getByRole('button', { name: 'Pause' })

    fireEvent.touchStart(pause, {
      touches: [{ identifier: 1, clientX: 80, clientY: 320 }],
    })
    fireEvent.touchEnd(pause, {
      changedTouches: [{ identifier: 1, clientX: 80, clientY: 220 }],
    })
    expect(onNext).not.toHaveBeenCalled()
  })

  it('hides the joined swipe capsule in focus mode while keeping its zone tappable', () => {
    render(<TheaterMobileChrome {...base} current={videoItem()} />)
    const zone = screen.getByTestId('mobile-swipe-zone')
    const controls = zone.querySelector('[data-theater-swipe-control]')!

    fireEvent.click(screen.getByLabelText('Hide controls'))
    expect(controls.className).toContain('opacity-0')
    expect(controls.className).toContain('pointer-events-none')
    expect(document.querySelectorAll('[inert]')).toHaveLength(3)
    expect(screen.getByTestId('mobile-sheet-content')).toHaveAttribute('inert')
    expect(screen.getByTestId('mobile-playback-controls')).toBeInTheDocument()

    fireEvent.click(zone)
    expect(controls.className).not.toContain('opacity-0')
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

  it('fully hides expanded filter content when the sheet is collapsed', () => {
    render(
      <TheaterMobileChrome
        {...base}
        current={videoItem()}
        queueTypes={['video']}
        onToggleQueueType={vi.fn()}
        onClearQueueTypes={vi.fn()}
      />,
    )
    const content = screen.getByTestId('mobile-sheet-content')
    const queue = document.querySelector<HTMLButtonElement>('[data-theater-action="show-all"]')!

    expect(content.className).toContain('invisible')
    expect(content).toHaveAttribute('aria-hidden', 'true')
    expect(content).toHaveAttribute('inert')

    fireEvent.click(queue)
    expect(content.className).not.toContain('invisible')
    expect(content).toHaveAttribute('aria-hidden', 'false')
    expect(content).not.toHaveAttribute('inert')

    fireEvent.click(queue)
    expect(content.className).not.toContain('invisible')
    fireEvent.transitionEnd(content.parentElement!, { propertyName: 'transform' })
    expect(content.className).toContain('invisible')
  })

  it('falls back to hiding after the close duration and cancels that hide when reopened', () => {
    vi.useFakeTimers()
    try {
      render(<TheaterMobileChrome {...base} current={videoItem()} />)
      const content = screen.getByTestId('mobile-sheet-content')
      const queue = document.querySelector<HTMLButtonElement>('[data-theater-action="show-all"]')!

      fireEvent.click(queue)
      fireEvent.click(queue)
      act(() => vi.advanceTimersByTime(349))
      expect(content.className).not.toContain('invisible')
      act(() => vi.advanceTimersByTime(1))
      expect(content.className).toContain('invisible')
      expect(content).toHaveAttribute('aria-hidden', 'true')
      expect(content).toHaveAttribute('inert')

      fireEvent.click(queue)
      fireEvent.click(queue)
      act(() => vi.advanceTimersByTime(100))
      fireEvent.click(queue)
      act(() => vi.advanceTimersByTime(300))
      expect(content.className).not.toContain('invisible')
      expect(content).not.toHaveAttribute('inert')
    } finally {
      vi.useRealTimers()
    }
  })

  it('Escape and a click away close the up-next sheet; arrows move rows', async () => {
    const items = [
      videoItem({ bookmarkId: '1', text: 'first playlist row' }),
      videoItem({ bookmarkId: '2', text: 'second playlist row' }),
    ]
    render(
      <TheaterMobileChrome
        {...base}
        items={items}
        current={items[0]}
        currentKey={theaterItemKey(items[0])}
      />,
    )
    const label = screen
      .getAllByLabelText('Expand up next')
      .find((el) => (el.textContent ?? '').trim().length > 0)!
    fireEvent.click(label)
    expect(label).toHaveAttribute('aria-label', 'Collapse up next')

    const rows = () => document.querySelectorAll<HTMLElement>('[data-theater-queue-item]')
    // Do not auto-focus a row on open — that pans the visual viewport and
    // yanks the sheet to the top of the screen (filters + peek disappear).
    expect(rows()[0]).not.toHaveFocus()
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    expect(rows()[0]).toHaveFocus()
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    expect(rows()[1]).toHaveFocus()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(label).toHaveAttribute('aria-label', 'Expand up next')

    fireEvent.click(label)
    fireEvent.mouseDown(document.body)
    expect(label).toHaveAttribute('aria-label', 'Expand up next')
  })

  it('Q toggles the up-next sheet via the theater action event', () => {
    render(<TheaterMobileChrome {...base} current={videoItem()} />)
    const label = () =>
      screen
        .getAllByLabelText(/(Expand|Collapse) up next/)
        .find((el) => (el.textContent ?? '').trim().length > 0)!
    expect(label()).toHaveAttribute('aria-label', 'Expand up next')
    fireEvent(window, new CustomEvent('theater-toggle-show-all'))
    expect(label()).toHaveAttribute('aria-label', 'Collapse up next')
    fireEvent(window, new CustomEvent('theater-toggle-show-all'))
    expect(label()).toHaveAttribute('aria-label', 'Expand up next')
  })

  it('moves the right-side action rail onto the sheet edge when Queue expands', () => {
    render(<TheaterMobileChrome {...base} current={videoItem()} />)
    const actions = screen.getByTestId('mobile-control-actions')
    const queue = screen
      .getAllByLabelText('Expand up next')
      .find((element) => (element.textContent ?? '').trim().length > 0)!

    expect(actions.className).toContain('bottom-[calc(13rem+env(safe-area-inset-bottom))]')
    expect(actions.className).toContain('flex-col')
    expect(screen.getByRole('button', { name: 'Save' }).className).toContain('h-11')
    fireEvent.click(queue)
    expect(actions.className).toContain('bottom-[calc(70%+0.75rem)]')
    expect(actions.className).toContain('flex-row')
    expect(actions.className).not.toContain('opacity-0')
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })

  it('top-aligns the Share menu when Queue is open so short viewports do not clip it', () => {
    mockUseSendFile.mockReturnValue({
      supported: true,
      ready: true,
      sending: false,
      mode: 'share' as const,
      send: vi.fn(),
      download: vi.fn(),
    })
    render(<TheaterMobileChrome {...base} current={videoItem()} />)
    const queue = screen
      .getAllByLabelText('Expand up next')
      .find((element) => (element.textContent ?? '').trim().length > 0)!

    fireEvent.click(queue)
    openShareOptions()
    const menu = screen.getByRole('menu', { name: 'Share options' })
    expect(menu.className).toContain('top-0')
    expect(menu.className).not.toContain('top-1/2')
  })

  it('keeps the up-next sheet open when the stage advances to the next post', () => {
    const items = [
      videoItem({ bookmarkId: '1', text: 'first playlist row' }),
      videoItem({ bookmarkId: '2', text: 'second playlist row' }),
    ]
    const { rerender } = render(
      <TheaterMobileChrome
        {...base}
        items={items}
        current={items[0]}
        currentKey={theaterItemKey(items[0])}
      />,
    )
    const label = () =>
      screen
        .getAllByLabelText(/(Expand|Collapse) up next/)
        .find((el) => (el.textContent ?? '').trim().length > 0)!
    fireEvent.click(label())
    expect(label()).toHaveAttribute('aria-label', 'Collapse up next')

    rerender(
      <TheaterMobileChrome
        {...base}
        items={items}
        current={items[1]}
        currentKey={theaterItemKey(items[1])}
      />,
    )
    expect(label()).toHaveAttribute('aria-label', 'Collapse up next')
  })

  // Owner report: the collapsed peek bar floated a few px too short, letting
  // the top of the Up-next list peek through underneath it. The wrapper is
  // pinned to PEEK_H plus the device safe area so the collapse transform's
  // visible window and the bottom bar's actual height match.
  it('pins the peek wrapper to 4.25rem plus the device safe area', () => {
    render(<TheaterMobileChrome {...base} current={videoItem()} />)
    const handle = screen
      .getAllByLabelText(/(Expand|Collapse) up next/)
      .find((el) => el.querySelector('span[aria-hidden]'))!
    const wrapper = handle.parentElement!
    expect(wrapper).toHaveStyle({
      height: 'calc(4.25rem + env(safe-area-inset-bottom))',
    })
    expect(wrapper.className).toContain('flex-none')
    expect(wrapper.className).toContain('overflow-hidden')
  })

  it('the sheet is 70% of the theater, clipped, and does not steal focus on expand', () => {
    render(
      <TheaterMobileChrome
        {...base}
        current={videoItem()}
        queueTypes={[]}
        onToggleQueueType={vi.fn()}
        onClearQueueTypes={vi.fn()}
      />,
    )
    const handle = screen
      .getAllByLabelText(/(Expand|Collapse) up next/)
      .find((el) => el.querySelector('span[aria-hidden]'))!
    const sheet = handle.closest('.rounded-t-2xl')!
    expect(sheet.className).toContain('h-[70%]')
    expect(sheet.className).toContain('overflow-hidden')

    fireEvent.click(handle)
    expect(document.activeElement).not.toHaveAttribute('data-theater-queue-item')
    expect(screen.getByRole('group', { name: 'Playlist filter' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Videos' })).toBeVisible()
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

  it('the Save-playlist CTA uses the frosted rail style with a clay cue', () => {
    render(
      <TheaterMobileChrome
        {...base}
        current={videoItem()}
        playlist={{ tag: 'claude-code', curator: 'weedauwl', count: 12 }}
        isPlaylistOwner={false}
      />,
    )
    const savePlaylistBtn = screen.getByRole('button', { name: 'Save playlist · 12' })
    expect(savePlaylistBtn.className).toContain('border-white/15')
    expect(savePlaylistBtn.className).toContain('bg-black/20')
    expect(savePlaylistBtn.className).toContain('text-clay')
    expect(savePlaylistBtn.className).not.toContain('bg-clay-grad')
  })

  it('keeps playlist media download inside Share', () => {
    mockUseSendFile.mockReturnValue({
      supported: true,
      ready: true,
      sending: false,
      mode: 'download' as const,
      send: vi.fn(),
      download: vi.fn(),
    })
    render(
      <TheaterMobileChrome
        {...base}
        current={videoItem()}
        playlist={{ tag: 'claude-code', curator: 'weedauwl', count: 12 }}
        isPlaylistOwner={false}
      />,
    )
    expect(screen.getByRole('button', { name: 'Save playlist · 12' })).toBeInTheDocument()
    openShareOptions()
    expect(screen.getByRole('menuitem', { name: 'Download the video' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Share link' })).toBeInTheDocument()
  })

  it('text posts on a playlist get Copy inside Share', () => {
    render(
      <TheaterMobileChrome
        {...base}
        current={textItem()}
        playlist={{ tag: 'claude-code', curator: 'weedauwl', count: 12 }}
        isPlaylistOwner={false}
      />,
    )
    expect(screen.getByRole('button', { name: 'Save playlist · 12' })).toBeInTheDocument()
    openShareOptions()
    expect(screen.getByRole('menuitem', { name: "Copy the post's text" })).toBeInTheDocument()
  })

  it('owner playlist keeps Download in Share beside Manage playlist', () => {
    mockUseSendFile.mockReturnValue({
      supported: true,
      ready: true,
      sending: false,
      mode: 'download' as const,
      send: vi.fn(),
      download: vi.fn(),
    })
    render(
      <TheaterMobileChrome
        {...base}
        current={videoItem()}
        playlist={{ tag: 'claude-code', curator: 'weedauwl', count: 12 }}
        isPlaylistOwner
      />,
    )
    expect(screen.getByRole('link', { name: 'Manage playlist' })).toBeInTheDocument()
    openShareOptions()
    expect(screen.getByRole('menuitem', { name: 'Download the video' })).toBeInTheDocument()
  })
})

// A direct shared post is repeat-one until deliberate swipe navigation.
// Repeat lives in the bottom transport group while previous / next share one
// joined swipe capsule on the right.
describe('TheaterMobileChrome: shared-post-repeat cue', () => {
  it('shows "On repeat" instead of "Up next" while pinned', () => {
    render(<TheaterMobileChrome {...base} current={videoItem()} repeatCurrent />)
    expect(screen.getByText('On repeat')).toBeInTheDocument()
    expect(screen.queryByText('Up next')).not.toBeInTheDocument()
  })

  it('reverts to Queue once unpinned', () => {
    render(<TheaterMobileChrome {...base} current={videoItem()} />)
    expect(screen.getByText('Queue')).toBeInTheDocument()
    expect(screen.queryByText('On repeat')).not.toBeInTheDocument()
  })

  it('tapping the "On repeat" label still opens the up-next sheet (same tap behavior)', () => {
    render(<TheaterMobileChrome {...base} current={videoItem()} repeatCurrent />)
    const label = screen.getByText('On repeat').closest('button')!
    expect(label).toHaveAttribute('aria-label', 'Expand up next')
    fireEvent.click(label)
    expect(label).toHaveAttribute('aria-label', 'Collapse up next')
  })

  it('shows repeat-one in the bottom transport and joins the up/down buttons', () => {
    const onPrev = vi.fn()
    const onNext = vi.fn()
    render(
      <TheaterMobileChrome
        {...base}
        current={videoItem()}
        repeatCurrent
        repeatMode="one"
        onCycleRepeat={vi.fn()}
        onPrev={onPrev}
        onNext={onNext}
      />,
    )
    const repeatOne = screen.getByLabelText('Repeat this post')
    const mute = screen.getByLabelText('Unmute')
    const next = screen.getByLabelText('Next post')
    const previous = screen.getByLabelText('Previous post')
    expect(repeatOne.querySelector('.lucide-repeat-1')).toBeInTheDocument()
    expect(repeatOne.className).toContain('text-clay')
    expect(repeatOne.parentElement).toHaveAttribute('data-testid', 'mobile-playback-controls')
    expect(next.parentElement).toBe(previous.parentElement)
    expect(next.parentElement).toHaveAttribute('data-theater-swipe-control')
    expect(next.parentElement).not.toHaveClass('py-2')
    expect(previous).toHaveClass('rounded-t-full', 'pt-2')
    expect(next).toHaveClass('rounded-b-full', 'pb-2')
    expect(mute.compareDocumentPosition(repeatOne) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(previous.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.click(previous)
    fireEvent.click(next)
    expect(onPrev).toHaveBeenCalledTimes(1)
    expect(onNext).toHaveBeenCalledTimes(1)
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
describe('TheaterMobileChrome: queue count label', () => {
  function buildItems(count: number): TheaterItem[] {
    return Array.from({ length: count }, (_, i) => videoItem({ bookmarkId: String(i + 1) }))
  }

  it('renders Now playing + Next when Repeat is off', () => {
    const items = buildItems(5)
    render(
      <TheaterMobileChrome
        {...base}
        items={items}
        current={items[1]}
        currentKey={theaterItemKey(items[1])}
        queuePlayed={0}
        queueToPlay={5}
        queueTotal={5}
      />,
    )
    expect(screen.getByText('5 in queue')).toBeInTheDocument()
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
        queuePlayed={0}
        queueToPlay={5}
        queueTotal={5}
      />,
    )
    expect(screen.getByText('5 in queue · 3 new')).toBeInTheDocument()
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
        queuePlayed={0}
        queueToPlay={5}
        queueTotal={5}
      />,
    )
    expect(screen.getByText('5 in queue')).toBeInTheDocument()
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

  it('falls back to Queue when the current key does not resolve and there is no new count', () => {
    const items = buildItems(5)
    render(
      <TheaterMobileChrome
        {...base}
        items={items}
        current={null}
        currentKey="twitter:does-not-exist"
      />,
    )
    expect(screen.getByText('Queue')).toBeInTheDocument()
  })

  it('separates playlist status from quick type filters and shows their counts', () => {
    const allItems = [
      videoItem({ bookmarkId: '1' }),
      videoItem({ bookmarkId: '2' }),
      videoItem({ bookmarkId: '3', contentType: 'photo' }),
      textItem({ bookmarkId: '4' }),
      textItem({ bookmarkId: '5', contentType: 'article' }),
    ]
    const items = allItems.slice(0, 2)
    const onToggleQueueType = vi.fn()
    render(
      <TheaterMobileChrome
        {...base}
        items={items}
        typeFilterItems={allItems}
        current={items[1]}
        currentKey={theaterItemKey(items[1])}
        queueTypes={['video']}
        onToggleQueueType={onToggleQueueType}
        onClearQueueTypes={vi.fn()}
        queuePlayed={0}
        queueToPlay={2}
        queueTotal={2}
      />,
    )
    const queue = document.querySelector<HTMLButtonElement>('[data-theater-action="show-all"]')!
    const filter = screen.getByRole('button', { name: 'Quick filter posts' })
    expect(screen.queryByRole('button', { name: 'Filter queue' })).not.toBeInTheDocument()
    expect(queue.querySelector('.lucide-list-filter')).not.toBeInTheDocument()
    expect(queue.querySelector('[data-theater-play-count]')).toHaveTextContent('2')
    expect(queue.querySelector('[data-theater-unseen-count]')).toHaveTextContent('2')
    expect(queue).toHaveAttribute('aria-expanded', 'false')
    expect(filter).toHaveAttribute('title', 'Videos')

    fireEvent.click(filter)
    expect(queue).toHaveAttribute('aria-expanded', 'false')
    const quickFilters = screen.getByRole('group', { name: 'Quick post filters' })
    expect(quickFilters).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'All posts, 5' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Videos, 2' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Photos, 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Text, 2' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Articles, 1' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Photos, 1' }))
    expect(onToggleQueueType).toHaveBeenCalledWith('photo')
    onToggleQueueType.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Text, 2' }))
    expect(onToggleQueueType.mock.calls).toEqual([['text'], ['article']])
  })

  it('restores the quick-filter trigger when filtering advances the staged post', async () => {
    const items = buildItems(2)
    const props = {
      ...base,
      items,
      typeFilterItems: items,
      queueTypes: ['video' as const],
      onToggleQueueType: vi.fn(),
      onClearQueueTypes: vi.fn(),
    }
    const { rerender } = render(
      <TheaterMobileChrome {...props} current={items[0]} currentKey={theaterItemKey(items[0])} />,
    )
    const trigger = screen.getByRole('button', { name: 'Quick filter posts' })
    fireEvent.click(trigger)
    expect(screen.getByRole('button', { name: 'Videos, 2' })).toHaveFocus()

    rerender(
      <TheaterMobileChrome {...props} current={items[1]} currentKey={theaterItemKey(items[1])} />,
    )

    await waitFor(() => expect(trigger).toHaveFocus())
    expect(screen.queryByRole('group', { name: 'Quick post filters' })).not.toBeInTheDocument()
  })

  it('focuses the grouped Text option for a partial legacy article selection', () => {
    const item = textItem({ contentType: 'article' })
    render(
      <TheaterMobileChrome
        {...base}
        items={[item]}
        typeFilterItems={[item]}
        current={item}
        currentKey={theaterItemKey(item)}
        queueTypes={['article']}
        onToggleQueueType={vi.fn()}
        onClearQueueTypes={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Quick filter posts' }))
    const text = screen.getByRole('button', { name: 'Text, 1' })
    expect(text).toHaveAttribute('aria-pressed', 'mixed')
    expect(text).toHaveFocus()
  })

  it('playlist mode keeps the pile size in the peek bar; the tag lives in the expanded sheet', () => {
    const items = buildItems(5)
    render(
      <TheaterMobileChrome
        {...base}
        items={items}
        current={items[1]}
        currentKey={theaterItemKey(items[1])}
        playlist={{ tag: 'claude-code', curator: 'weedauwl', count: 12 }}
        queuePlayed={0}
        queueToPlay={5}
        queueTotal={5}
      />,
    )
    expect(peekCentreText()).toBe('5 in queue')
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
    expect(screen.queryByText('5')).not.toBeInTheDocument()
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

  it('signed-in shared preview wires Live ⇄ Saved into the avatar menu and omits Close', () => {
    const onTabChange = vi.fn()
    const onClose = vi.fn()
    render(
      <TheaterMobileChrome
        {...base}
        mode="shared"
        current={videoItem()}
        accountTabs={{ tab: 'live', onTabChange, onClose }}
      />,
    )
    expect(mockTheaterAvatarMenu).toHaveBeenCalledWith(
      expect.objectContaining({
        theaterActive: true,
        theaterTabs: { tab: 'live', onTabChange },
      }),
    )
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument()
  })
})

/**
 * "Saved is just a different playlist in that same theater" (owner
 * directive): videos auto-advance on end, and photo/text/quote/article use
 * the same 10s dwell as Live (Repeat still applies). The line's fill node
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

describe('TheaterMobileChrome: Collection-tab progress line', () => {
  it('keeps the progress line for a video item in the Collection tab', () => {
    const { container } = render(
      <TheaterMobileChrome {...base} current={videoItem()} collection={collectionCollection()} />,
    )
    expect(container.querySelector('.bg-clay')).not.toBeNull()
  })

  it('keeps the 10s dwell line for a timed (text) item in the Collection tab', () => {
    const { container } = render(
      <TheaterMobileChrome {...base} current={textItem()} collection={collectionCollection()} />,
    )
    expect(container.querySelector('.bg-clay')).not.toBeNull()
  })

  it('a timed item still shows the progress line in the Live tab', () => {
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

  it('keeps the audio button on non-video posts, disabled like the desktop dock', () => {
    const onSetMuted = vi.fn()
    render(
      <TheaterMobileChrome
        {...base}
        muted
        current={textItem({ contentType: 'photo', thumbnailUrl: 'https://example.com/p.jpg' })}
        onSetMuted={onSetMuted}
      />,
    )
    const audioBtn = screen.getByLabelText('Unmute')
    expect(audioBtn).toBeDisabled()
    expect(audioBtn).toHaveAttribute('aria-disabled', 'true')
    expect(audioBtn.className).toContain('opacity-35')
    fireEvent.click(audioBtn)
    expect(onSetMuted).not.toHaveBeenCalled()
  })
})

/**
 * A Spotify-style repeat control in the bottom transport beside focus,
 * playback, and audio. Only renders when BOTH `repeatMode` and `onCycleRepeat` are
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

/** Share exposes only the actions supported by the staged post. */
describe('TheaterMobileChrome: contextual Share options', () => {
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

  it('offers Copy, Download, media Share, and Share link for a video with text', () => {
    const send = vi.fn()
    const download = vi.fn()
    mockUseSendFile.mockReturnValue({
      supported: true,
      ready: true,
      sending: false,
      mode: 'share' as const,
      send,
      download,
    })
    render(<TheaterMobileChrome {...base} current={videoItem()} />)

    expect(screen.getByRole('button', { name: 'Share' })).toHaveClass(
      'inline-flex',
      'items-center',
      'justify-center',
      'hover:bg-white/10',
      'active:bg-white/20',
    )
    expect(screen.getByRole('button', { name: 'Previous post' })).toHaveClass(
      'hover:bg-white/10',
      'active:bg-white/20',
    )
    expect(screen.getByRole('button', { name: 'Next post' })).toHaveClass(
      'hover:bg-white/10',
      'active:bg-white/20',
    )
    openShareOptions()
    expect(screen.getByRole('menuitem', { name: "Copy the post's text" })).toBeInTheDocument()
    const downloadOption = screen.getByRole('menuitem', { name: 'Download the video' })
    expect(screen.getByRole('menuitem', { name: 'Share video' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Share link' })).toBeInTheDocument()
    fireEvent.click(downloadOption)
    expect(download).toHaveBeenCalledTimes(1)

    openShareOptions()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Share video' }))
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('shows a green tick after the chosen Share action completes and resets it for the next post', async () => {
    let finishShare: ((completed: boolean) => void) | undefined
    const send = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finishShare = resolve
        }),
    )
    mockUseSendFile.mockReturnValue({
      supported: true,
      ready: true,
      sending: false,
      mode: 'share' as const,
      send,
      download: vi.fn(() => true),
    })
    const { rerender } = render(<TheaterMobileChrome {...base} current={videoItem()} />)
    const share = screen.getByRole('button', { name: 'Share' })

    openShareOptions()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Share video' }))
    expect(share.querySelector('.lucide-check')).not.toBeInTheDocument()

    await act(async () => finishShare?.(true))
    await waitFor(() => {
      expect(share.querySelector('.lucide-check')).toHaveClass('text-done')
    })

    rerender(<TheaterMobileChrome {...base} current={textItem({ bookmarkId: 'next' })} />)
    expect(share.querySelector('.lucide-check')).not.toBeInTheDocument()
  })

  it('does not show an old Share completion on a post reached while the action was in flight', async () => {
    let finishShare: ((completed: boolean) => void) | undefined
    mockUseSendFile.mockReturnValue({
      supported: true,
      ready: true,
      sending: false,
      mode: 'share' as const,
      send: vi.fn(
        () =>
          new Promise<boolean>((resolve) => {
            finishShare = resolve
          }),
      ),
      download: vi.fn(() => true),
    })
    const { rerender } = render(<TheaterMobileChrome {...base} current={videoItem()} />)
    const share = screen.getByRole('button', { name: 'Share' })

    openShareOptions()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Share video' }))
    rerender(<TheaterMobileChrome {...base} current={textItem({ bookmarkId: 'next' })} />)
    await act(async () => finishShare?.(true))

    expect(share.querySelector('.lucide-check')).not.toBeInTheDocument()
  })

  it('omits Copy when a sendable video has no text', () => {
    mockUseSendFile.mockReturnValue({
      supported: true,
      ready: true,
      sending: false,
      mode: 'share' as const,
      send: vi.fn(),
      download: vi.fn(),
    })
    render(<TheaterMobileChrome {...base} current={videoItem({ text: '' })} />)

    openShareOptions()
    expect(screen.queryByRole('menuitem', { name: /Copy/ })).not.toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Download the video' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Share video' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Share link' })).toBeInTheDocument()
  })

  it('focuses and roves Share options, suppresses theater keys, and restores the trigger', () => {
    render(<TheaterMobileChrome {...base} current={textItem()} />)
    const trigger = screen.getByRole('button', { name: 'Share' })
    const leakedKey = vi.fn()
    window.addEventListener('keydown', leakedKey)

    fireEvent.click(trigger)
    const copy = screen.getByRole('menuitem', { name: "Copy the post's text" })
    const link = screen.getByRole('menuitem', { name: 'Share link' })
    expect(copy).toHaveFocus()

    fireEvent.keyDown(window, { key: 'ArrowDown' })
    expect(link).toHaveFocus()
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    expect(copy).toHaveFocus()
    fireEvent.keyDown(window, { key: 'j' })
    expect(leakedKey).not.toHaveBeenCalled()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('menu', { name: 'Share options' })).not.toBeInTheDocument()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveFocus()
    window.removeEventListener('keydown', leakedKey)
  })

  it('closes Share on Tab and moves focus past or before the menu trigger', async () => {
    render(<TheaterMobileChrome {...base} current={textItem()} />)
    const trigger = screen.getByRole('button', { name: 'Share' })
    const open = screen.getByRole('link', { name: 'Open on X' })
    const save = screen.getByRole('button', { name: 'Save' })

    fireEvent.click(trigger)
    fireEvent.keyDown(window, { key: 'Tab' })
    await waitFor(() => expect(open).toHaveFocus())
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(trigger)
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true })
    await waitFor(() => expect(save).toHaveFocus())
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('offers Copy and Share link for a text-only post', () => {
    render(<TheaterMobileChrome {...base} current={textItem()} />)
    openShareOptions()
    expect(screen.getByRole('menuitem', { name: "Copy the post's text" })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Share link' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /Download/ })).not.toBeInTheDocument()
  })

  it('uses a file-text icon for articles and a copy icon for tweets', () => {
    const { rerender } = render(
      <TheaterMobileChrome {...base} current={textItem({ contentType: 'article' })} />,
    )
    openShareOptions()
    expect(
      screen.getByRole('menuitem', { name: 'Copy the article' }).querySelector('.lucide-file-text'),
    ).toBeTruthy()
    rerender(<TheaterMobileChrome {...base} current={textItem()} />)
    expect(
      screen.getByRole('menuitem', { name: "Copy the post's text" }).querySelector('.lucide-copy'),
    ).toBeTruthy()
  })

  it('copies the article body, not just the title', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        article: { content: '# Why an army\n\nOne account has a ceiling.' },
      }),
    })
    render(
      <TheaterMobileChrome
        {...base}
        current={textItem({
          contentType: 'article',
          text: 'Army title',
          author: 'adriamatz',
          bookmarkId: '99',
        })}
      />,
    )
    openShareOptions()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy the article' }))
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        'Army title\n\n# Why an army\n\nOne account has a ceiling.',
      ),
    )
  })

  it("copies the post's full text and flashes Copied on tap", async () => {
    render(<TheaterMobileChrome {...base} current={textItem({ text: 'the full post body' })} />)
    openShareOptions()
    fireEvent.click(screen.getByRole('menuitem', { name: "Copy the post's text" }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('the full post body'))
    openShareOptions()
    expect(await screen.findByRole('menuitem', { name: 'Copied' })).toBeInTheDocument()
  })

  it('offers only Share link for a text-like post with empty text', () => {
    render(<TheaterMobileChrome {...base} current={textItem({ text: '' })} />)
    openShareOptions()
    expect(screen.getByRole('menuitem', { name: 'Share link' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /Copy/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /Download/ })).not.toBeInTheDocument()
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
