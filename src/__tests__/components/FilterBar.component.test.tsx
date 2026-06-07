/**
 * @vitest-environment jsdom
 *
 * FilterBar Component Tests (Matter redesign)
 *
 * Tests for the FilterBar component including:
 * - Type filter pills rendering + active styling
 * - Platform dropdown
 * - Sort dropdown
 * - Unread-only toggle
 *
 * Note: tagging UI was fully removed in the Matter redesign. The component
 * still accepts tag-related props for caller compatibility but renders nothing
 * for them, so those test cases have been deleted.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, screen } from '@testing-library/react'
import { FilterBar } from '@/components/feed/FilterBar'
import { FILTER_OPTIONS, type FilterType, type TagItem } from '@/components/feed/types'

// Mock scrollIntoView for jsdom
Element.prototype.scrollIntoView = vi.fn()

// Mock window.matchMedia for responsive tests
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Default props for FilterBar
const defaultProps = {
  filter: 'all' as FilterType,
  onFilterChange: vi.fn(),
  sort: 'added' as const,
  onSortChange: vi.fn(),
  sortDirection: 'desc' as const,
  onSortDirectionChange: vi.fn(),
  unreadOnly: false,
  onUnreadOnlyChange: vi.fn(),
  selectedTags: [] as string[],
  onSelectedTagsChange: vi.fn(),
  availableTags: [
    { tag: 'work', count: 5 },
    { tag: 'personal', count: 3 },
    { tag: 'important', count: 2 },
  ] as TagItem[],
  stats: { total: 100, unread: 50 },
}

describe('FilterBar Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Type Filter Pills', () => {
    it('renders all 7 filter options', () => {
      render(<FilterBar {...defaultProps} />)

      expect(screen.getByRole('button', { name: 'All' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Photos' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Videos' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Text' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Articles' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Quoted' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Manual' })).toBeTruthy()
    })

    it('does NOT include needsTranscript filter', () => {
      render(<FilterBar {...defaultProps} />)

      expect(screen.queryByRole('button', { name: /needs transcript/i })).toBeNull()
      expect(screen.queryByRole('button', { name: /transcript/i })).toBeNull()
    })

    it('FILTER_OPTIONS constant has exactly 7 items', () => {
      expect(FILTER_OPTIONS).toHaveLength(7)
      expect(FILTER_OPTIONS.map((o) => o.value)).not.toContain('needsTranscript')
    })

    it('applies active gradient styling to selected filter', () => {
      render(<FilterBar {...defaultProps} filter="photos" />)

      const photosButton = screen.getByRole('button', { name: 'Photos' })
      expect(photosButton.className).toContain('bg-clay-grad')
    })

    it('calls onFilterChange when a filter pill is clicked', () => {
      const onFilterChange = vi.fn()
      render(<FilterBar {...defaultProps} onFilterChange={onFilterChange} />)

      fireEvent.click(screen.getByRole('button', { name: 'Videos' }))
      expect(onFilterChange).toHaveBeenCalledWith('videos')
    })
  })

  describe('Platform Dropdown', () => {
    it('shows the platform dropdown when onPlatformChange is provided', () => {
      render(<FilterBar {...defaultProps} platform="all" onPlatformChange={vi.fn()} />)

      const buttons = screen.getAllByRole('button')
      const platformButton = buttons.find((b) => b.textContent?.includes('All platforms'))
      expect(platformButton).toBeTruthy()
    })

    it('does not render the platform dropdown without onPlatformChange', () => {
      render(<FilterBar {...defaultProps} />)

      const buttons = screen.getAllByRole('button')
      const platformButton = buttons.find((b) => b.textContent?.includes('All platforms'))
      expect(platformButton).toBeFalsy()
    })

    it('opens the platform dropdown and lists platforms', () => {
      render(<FilterBar {...defaultProps} platform="all" onPlatformChange={vi.fn()} />)

      const buttons = screen.getAllByRole('button')
      const platformButton = buttons.find((b) => b.textContent?.includes('All platforms'))
      fireEvent.click(platformButton!)

      expect(screen.getByText('X / Twitter')).toBeTruthy()
      expect(screen.getByText('Instagram')).toBeTruthy()
      expect(screen.getByText('TikTok')).toBeTruthy()
      expect(screen.getByText('YouTube')).toBeTruthy()
    })

    it('calls onPlatformChange when a platform is selected', () => {
      const onPlatformChange = vi.fn()
      render(<FilterBar {...defaultProps} platform="all" onPlatformChange={onPlatformChange} />)

      const buttons = screen.getAllByRole('button')
      const platformButton = buttons.find((b) => b.textContent?.includes('All platforms'))
      fireEvent.click(platformButton!)

      fireEvent.click(screen.getByText('Instagram'))
      expect(onPlatformChange).toHaveBeenCalledWith('instagram')
    })
  })

  describe('Sort Dropdown', () => {
    it('shows the current sort label ("Added")', () => {
      render(<FilterBar {...defaultProps} sort="added" />)

      const buttons = screen.getAllByRole('button')
      const sortButton = buttons.find((b) => b.textContent?.includes('Added'))
      expect(sortButton).toBeTruthy()
    })

    it('opens the sort dropdown with sort + direction options', () => {
      render(<FilterBar {...defaultProps} />)

      const buttons = screen.getAllByRole('button')
      const sortButton = buttons.find((b) => b.textContent?.includes('Added'))
      fireEvent.click(sortButton!)

      expect(screen.getByText('Date added')).toBeTruthy()
      expect(screen.getByText('Date posted')).toBeTruthy()
      expect(screen.getByText('Newest first')).toBeTruthy()
      expect(screen.getByText('Oldest first')).toBeTruthy()
    })

    it('calls onSortChange when a sort option is selected', () => {
      const onSortChange = vi.fn()
      render(<FilterBar {...defaultProps} onSortChange={onSortChange} />)

      const buttons = screen.getAllByRole('button')
      const sortButton = buttons.find((b) => b.textContent?.includes('Added'))
      fireEvent.click(sortButton!)

      fireEvent.click(screen.getByText('Date posted'))
      expect(onSortChange).toHaveBeenCalledWith('posted')
    })

    it('calls onSortDirectionChange when a direction is selected', () => {
      const onSortDirectionChange = vi.fn()
      render(<FilterBar {...defaultProps} onSortDirectionChange={onSortDirectionChange} />)

      const buttons = screen.getAllByRole('button')
      const sortButton = buttons.find((b) => b.textContent?.includes('Added'))
      fireEvent.click(sortButton!)

      fireEvent.click(screen.getByText('Oldest first'))
      expect(onSortDirectionChange).toHaveBeenCalledWith('asc')
    })
  })

  describe('Unread Toggle', () => {
    it('renders an "Unread only" toggle', () => {
      render(<FilterBar {...defaultProps} unreadOnly={false} />)

      expect(screen.getByText(/unread only/i)).toBeTruthy()
    })

    it('shows the unread count when unreadOnly is true', () => {
      render(<FilterBar {...defaultProps} unreadOnly={true} />)

      const buttons = screen.getAllByRole('button')
      const toggleButton = buttons.find((b) => b.textContent?.includes('Unread only'))
      expect(toggleButton?.textContent).toContain('50')
    })

    it('shows the total count when unreadOnly is false', () => {
      render(<FilterBar {...defaultProps} unreadOnly={false} />)

      const buttons = screen.getAllByRole('button')
      const toggleButton = buttons.find((b) => b.textContent?.includes('Unread only'))
      expect(toggleButton?.textContent).toContain('100')
    })

    it('applies active gradient styling when unreadOnly is true', () => {
      render(<FilterBar {...defaultProps} unreadOnly={true} />)

      const buttons = screen.getAllByRole('button')
      const toggleButton = buttons.find((b) => b.textContent?.includes('Unread only'))
      expect(toggleButton?.className).toContain('bg-clay-grad')
    })

    it('calls onUnreadOnlyChange on toggle', () => {
      const onUnreadOnlyChange = vi.fn()
      render(<FilterBar {...defaultProps} onUnreadOnlyChange={onUnreadOnlyChange} />)

      const buttons = screen.getAllByRole('button')
      const toggleButton = buttons.find((b) => b.textContent?.includes('Unread only'))
      fireEvent.click(toggleButton!)

      expect(onUnreadOnlyChange).toHaveBeenCalledWith(true)
    })
  })

  describe('Tagging removed', () => {
    it('does not render any Tags button (tagging removed in Matter redesign)', () => {
      render(<FilterBar {...defaultProps} availableTags={defaultProps.availableTags} />)

      const buttons = screen.getAllByRole('button')
      const tagsButton = buttons.find((b) => b.textContent?.includes('Tags'))
      expect(tagsButton).toBeFalsy()
    })
  })
})
