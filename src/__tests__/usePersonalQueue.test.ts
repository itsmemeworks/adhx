/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useState } from 'react'
import { usePersonalQueue } from '@/app/usePersonalQueue'
import type { FeedItem } from '@/components/feed/types'

function item(id: string, platform: string): FeedItem {
  return {
    id,
    platform,
    author: 'a',
    authorName: 'A',
    text: id,
    tweetUrl: `https://example.com/${id}`,
    createdAt: '2026-08-18T00:00:00Z',
    processedAt: '2026-08-18T00:00:00Z',
    isArchived: false,
    tags: [],
    media: [],
    links: [],
  } as unknown as FeedItem
}

function useHarness(initial: FeedItem[], hideArchived: boolean) {
  const [items, setItems] = useState(initial)
  const [stats, setStats] = useState({ total: initial.length, active: initial.length })
  const queue = usePersonalQueue({ hideArchived, setItems, setStats })
  return { items, stats, ...queue }
}

describe('usePersonalQueue identity is (platform, id)', () => {
  it('does not archive a TikTok just because an X post shares its numeric id', () => {
    const twitter = item('123', 'twitter')
    const tiktok = item('123', 'tiktok')
    const { result } = renderHook(() => useHarness([twitter, tiktok], false))

    act(() => result.current.handlePostResolved(twitter, 'archive'))

    expect(result.current.items).toHaveLength(2)
    expect(result.current.items.find((i) => i.platform === 'twitter')?.isArchived).toBe(true)
    expect(result.current.items.find((i) => i.platform === 'tiktok')?.isArchived).toBe(false)
  })

  it('does not restore the other platform on undo', () => {
    const twitter = item('123', 'twitter')
    const tiktok = { ...item('123', 'tiktok'), isArchived: true }
    const { result } = renderHook(() => useHarness([twitter, tiktok], false))

    act(() => result.current.handlePostRestored(item('123', 'tiktok')))

    expect(result.current.items.find((i) => i.platform === 'twitter')?.isArchived).toBe(false)
    expect(result.current.items.find((i) => i.platform === 'tiktok')?.isArchived).toBe(false)
  })
})
