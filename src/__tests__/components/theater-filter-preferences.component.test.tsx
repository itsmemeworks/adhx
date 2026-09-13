/** @vitest-environment jsdom */
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useTheaterQueueTypes } from '@/components/theater/useTheaterQueueTypes'
import {
  FILTER_STORAGE_KEYS,
  readTheaterFilters,
  type FilterDestination,
} from '@/lib/theater/filter-preferences'

describe('destination filters', () => {
  beforeEach(() => localStorage.clear())

  it('gives new visitors video discovery and an unfiltered Saved collection', () => {
    expect(readTheaterFilters('discover', localStorage)).toEqual({
      types: ['video'],
      watch: 'unwatched',
    })
    expect(readTheaterFilters('saved', localStorage)).toEqual({ types: [], watch: 'all' })
  })

  it('remembers explicit All separately from a missing preference across remounts', () => {
    const first = renderHook(() => useTheaterQueueTypes(true, 'discover'))
    act(() => {
      first.result.current.clearQueueTypes()
      first.result.current.setWatchFilter('all')
    })
    first.unmount()
    const second = renderHook(() => useTheaterQueueTypes(true, 'discover'))
    expect(second.result.current.queueTypes).toEqual([])
    expect(second.result.current.watchFilter).toBe('all')
  })

  it('keeps independent choices when switching destinations', () => {
    const { result, rerender } = renderHook(
      ({ destination }: { destination: FilterDestination }) =>
        useTheaterQueueTypes(true, destination),
      { initialProps: { destination: 'discover' as FilterDestination } },
    )
    act(() => result.current.toggleQueueType('photo'))
    rerender({ destination: 'saved' })
    expect(result.current.queueTypes).toEqual([])
    expect(result.current.watchFilter).toBe('all')
    act(() => result.current.setWatchFilter('unwatched'))
    rerender({ destination: 'discover' })
    expect(result.current.queueTypes).toEqual(['photo'])
    expect(JSON.parse(localStorage.getItem(FILTER_STORAGE_KEYS.saved)!)).toEqual({
      types: [],
      watch: 'unwatched',
    })
  })

  it('uses single choices, grouping posts and articles as Text', () => {
    const { result } = renderHook(() => useTheaterQueueTypes(true, 'discover'))
    act(() => result.current.toggleQueueType('photo'))
    expect(result.current.queueTypes).toEqual(['photo'])
    act(() => result.current.toggleQueueType('text'))
    expect(result.current.queueTypes).toEqual(['text', 'article'])
    act(() => result.current.toggleQueueType('text'))
    expect(result.current.queueTypes).toEqual(['text', 'article'])
  })

  it('does not let personal filters hide a shared link or overwrite preferences', () => {
    localStorage.setItem(
      FILTER_STORAGE_KEYS.discover,
      JSON.stringify({ types: ['photo'], watch: 'unwatched' }),
    )
    const { result } = renderHook(() => useTheaterQueueTypes(true, 'shared'))
    expect(result.current.queueTypes).toEqual([])
    expect(result.current.watchFilter).toBe('all')
    act(() => result.current.toggleQueueType('text'))
    expect(readTheaterFilters('discover', localStorage).types).toEqual(['photo'])
  })

  it('migrates deliberate legacy choices without overriding destination watch defaults', () => {
    localStorage.setItem('adhx-theater-types', '[]')
    expect(readTheaterFilters('discover', localStorage)).toEqual({ types: [], watch: 'unwatched' })
    localStorage.removeItem('adhx-theater-types')
    localStorage.setItem('adhx-theater-visual', '1')
    expect(readTheaterFilters('saved', localStorage)).toEqual({
      types: ['video', 'photo'],
      watch: 'all',
    })
  })

  it('recovers from malformed or inaccessible storage', () => {
    localStorage.setItem(FILTER_STORAGE_KEYS.discover, '{')
    expect(readTheaterFilters('discover', localStorage).types).toEqual(['video'])
    expect(
      readTheaterFilters('saved', {
        getItem() {
          throw new Error('denied')
        },
      }),
    ).toEqual({ types: [], watch: 'all' })
  })
})
