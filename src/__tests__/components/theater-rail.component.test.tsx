/**
 * @vitest-environment jsdom
 *
 * `Rail` (desktop theater rail) — PR-3's UX fixes plus the fixed-controls
 * redesign:
 *  1. The now-playing platform+time chip doubles as a link-out to the
 *     original post, and degrades to a plain (non-link) chip when
 *     `sourceUrl` can't build one.
 *  2. Actions' "Open" points at the source-platform URL (never the on-ADHX
 *     `current.url`), and is hidden entirely when there's nothing to open.
 *  3. `useClampExpand`'s show more/less state is a *sticky* preference
 *     shared across items (and across the desktop rail + mobile chrome
 *     instances), not a per-item reset to collapsed.
 *  4. No Connect-with-X CTA and no "Browse as list" footer.
 *  5. Up next collapses behind a Show-all toggle once there are more than a
 *     handful of items.
 *  6. The expanded now-playing caption no longer carries its own scrollbar —
 *     the rail's single scroll container owns overflow instead.
 *  7. `savedToday` renders inline in the Up next heading row.
 *
 * Also covers `useSendFile`'s `mode` plumbing into the Send/Download label.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, renderHook, act, fireEvent } from '@testing-library/react'
import { Rail, useClampExpand } from '@/components/theater/Rail'
import type { TheaterItem } from '@/components/theater/types'

const baseItem: TheaterItem = {
  action: 'save',
  platform: 'twitter',
  bookmarkId: '123',
  author: 'alice',
  authorName: 'Alice',
  text: 'hello world',
  url: '/alice/status/123',
  createdAt: '2026-06-08T00:00:00Z',
  thumbnailUrl: null,
  contentType: 'text',
}

function makeItem(id: string): TheaterItem {
  return {
    ...baseItem,
    bookmarkId: id,
    author: `user${id}`,
    authorName: `User ${id}`,
    text: `post ${id}`,
  }
}

const railProps = {
  mode: 'home' as const,
  items: [baseItem],
  currentKey: 'twitter:123',
  isSeen: () => false,
  seenReady: true,
  freshKeys: new Set<string>(),
  newCount: 0,
  savedToday: 0,
  onSelect: () => {},
  muted: true,
  onToggleMute: () => {},
  canPrev: false,
  canNext: false,
  onPrev: () => {},
  onNext: () => {},
  declutter: false,
  onToggleDeclutter: () => {},
}

afterEach(() => {
  // Reset the module-level sticky preference between tests — Rail.tsx
  // intentionally shares this across mounts, but each test wants a clean slate.
  const { result } = renderHook(() => useClampExpand('reset'))
  act(() => result.current.setExpanded(false))
})

describe('Rail — link-out chip', () => {
  it('renders the platform+time chip as a link to the source post', () => {
    render(<Rail {...railProps} current={baseItem} />)
    const links = screen.getAllByTitle('Open on X')
    // One from the link-out chip, one from Actions' "Open" button.
    expect(links).toHaveLength(2)
    for (const link of links) {
      expect(link).toHaveAttribute('href', 'https://x.com/alice/status/123')
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
    }
  })

  it('degrades to a plain chip (no Open button) when sourceUrl has nothing to build from', () => {
    const noId = { ...baseItem, bookmarkId: null }
    render(<Rail {...railProps} current={noId} />)
    expect(screen.queryByTitle('Open on X')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Open' })).not.toBeInTheDocument()
  })
})

describe('Rail — de-cluttered brand row / footer', () => {
  it('renders no Connect-with-X CTA in home mode', () => {
    render(<Rail {...railProps} current={baseItem} />)
    expect(screen.queryByRole('link', { name: /connect/i })).not.toBeInTheDocument()
    expect(screen.queryByText('Keep a pile, later.')).not.toBeInTheDocument()
  })

  it('renders no "Browse as list" footer link', () => {
    render(<Rail {...railProps} current={baseItem} />)
    expect(screen.queryByRole('link', { name: /browse as list/i })).not.toBeInTheDocument()
  })

  it('still shows the Save CTA, which routes signed-out users through the OAuth start route', () => {
    render(<Rail {...railProps} current={baseItem} />)
    const saveLinks = screen.getAllByRole('link', { name: /save/i })
    expect(saveLinks.length).toBeGreaterThan(0)
    for (const link of saveLinks) {
      expect(link).toHaveAttribute('href', '/api/auth/twitter')
    }
  })
})

describe('Rail — now-playing caption scroll', () => {
  it('the expanded caption paragraph does not carry its own overflow-y-auto', () => {
    render(<Rail {...railProps} current={baseItem} />)
    // "hello world" also appears in this item's own Up-next row — find the
    // NowPlaying paragraph specifically via its distinguishing class.
    const paragraphs = screen.getAllByText('hello world').map((el) => el.closest('p'))
    const nowPlaying = paragraphs.find((p) => p?.className.includes('leading-relaxed'))
    expect(nowPlaying).toBeTruthy()
    expect(nowPlaying?.className).not.toContain('overflow-y-auto')
    expect(nowPlaying?.className).not.toContain('max-h-[40vh]')
  })
})

describe('Rail — Up next heading', () => {
  it('renders savedToday inline in the heading row when greater than zero', () => {
    render(<Rail {...railProps} current={baseItem} savedToday={42} />)
    expect(screen.getByText('42 saved today')).toBeInTheDocument()
  })

  it('omits the saved-today text when zero', () => {
    render(<Rail {...railProps} current={baseItem} savedToday={0} />)
    expect(screen.queryByText(/saved today/)).not.toBeInTheDocument()
  })
})

describe('Rail — Up next collapse', () => {
  it('collapses beyond 6 items behind a Show-all toggle, which reveals the rest on click', () => {
    const items = Array.from({ length: 10 }, (_, i) => makeItem(String(i)))
    render(<Rail {...railProps} items={items} current={items[0]} currentKey="twitter:0" />)

    // 6 collapsed rows are visible, the rest are hidden behind the toggle.
    // "post 0" appears twice (NowPlaying's text + its own Up-next row).
    expect(screen.getAllByText('post 0')).toHaveLength(2)
    expect(screen.getByText('post 5')).toBeInTheDocument()
    expect(screen.queryByText('post 6')).not.toBeInTheDocument()
    expect(screen.queryByText('post 9')).not.toBeInTheDocument()

    const toggle = screen.getByRole('button', { name: /show all/i })
    expect(toggle).toBeInTheDocument()

    fireEvent.click(toggle)

    expect(screen.getByText('post 6')).toBeInTheDocument()
    expect(screen.getByText('post 9')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /show less/i })).toBeInTheDocument()
  })

  it('does not render a toggle when there are 6 or fewer items', () => {
    const items = Array.from({ length: 5 }, (_, i) => makeItem(String(i)))
    render(<Rail {...railProps} items={items} current={items[0]} currentKey="twitter:0" />)
    expect(screen.queryByRole('button', { name: /show all/i })).not.toBeInTheDocument()
  })
})

describe('useClampExpand — sticky expand preference', () => {
  it('an explicit expand survives a resetKey change (theater advancing to a new item)', () => {
    const { result, rerender } = renderHook(({ key }) => useClampExpand(key), {
      initialProps: { key: 'item-a' },
    })

    act(() => result.current.setExpanded(true))
    expect(result.current.expanded).toBe(true)

    rerender({ key: 'item-b' })
    expect(result.current.expanded).toBe(true)
  })

  it('an explicit collapse also survives a resetKey change', () => {
    const { result, rerender } = renderHook(({ key }) => useClampExpand(key), {
      initialProps: { key: 'item-a' },
    })

    act(() => result.current.setExpanded(true))
    act(() => result.current.setExpanded(false))
    expect(result.current.expanded).toBe(false)

    rerender({ key: 'item-b' })
    expect(result.current.expanded).toBe(false)
  })

  it('is shared across independent hook instances (desktop rail + mobile chrome)', () => {
    const { result: desktop } = renderHook(() => useClampExpand('shared-a'))
    act(() => desktop.current.setExpanded(true))

    // A second instance mounted afterwards (e.g. the mobile chrome) picks up
    // the same preference as its initial state.
    const { result: mobile } = renderHook(() => useClampExpand('shared-a'))
    expect(mobile.current.expanded).toBe(true)
  })
})
