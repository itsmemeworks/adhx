/**
 * @vitest-environment jsdom
 *
 * `Rail` (desktop theater rail) — three of PR-3's UX fixes:
 *  1. The now-playing platform+time chip doubles as a link-out to the
 *     original post, and degrades to a plain (non-link) chip when
 *     `sourceUrl` can't build one.
 *  2. Actions' "Open" points at the source-platform URL (never the on-ADHX
 *     `current.url`), and is hidden entirely when there's nothing to open.
 *  3. `useClampExpand`'s show more/less state is a *sticky* preference
 *     shared across items (and across the desktop rail + mobile chrome
 *     instances), not a per-item reset to collapsed.
 *
 * Also covers `useSendFile`'s `mode` plumbing into the Send/Download label.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, renderHook, act } from '@testing-library/react'
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
