/** @vitest-environment jsdom */
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { usePostPlayback } from '@/components/theater/usePostPlayback'
import { pingAnalytic } from '@/lib/analytics/client'
import type { TheaterItem } from '@/components/theater/types'

vi.mock('@/lib/analytics/client', () => ({ pingAnalytic: vi.fn() }))

describe('confirmed playback analytics', () => {
  it('does not count loading, counts a confirmed start once, and counts the next post separately', () => {
    vi.mocked(pingAnalytic).mockClear()
    const { result, rerender } = renderHook(
      ({ id }) => usePostPlayback({ platform: 'twitter', bookmarkId: id } as TheaterItem),
      { initialProps: { id: 'one' } },
    )
    expect(pingAnalytic).not.toHaveBeenCalled()
    act(() => result.current())
    act(() => result.current())
    expect(pingAnalytic).toHaveBeenCalledTimes(1)
    expect(pingAnalytic).toHaveBeenCalledWith('post.play', { platform: 'twitter', id: 'one' })
    rerender({ id: 'two' })
    expect(pingAnalytic).toHaveBeenCalledTimes(1)
    act(() => result.current())
    expect(pingAnalytic).toHaveBeenCalledTimes(2)
  })
})
