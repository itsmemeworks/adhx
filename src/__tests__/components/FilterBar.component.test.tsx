/**
 * FilterBar Component Tests
 *
 * Tests for the FilterBar component including:
 * - Filter options rendering (desktop) and dropdown (mobile)
 * - Tags single-select dropdown behavior
 * - Tags button shows selected tag name
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, screen, within } from '@testing-library/react'
import { FilterBar } from '@/components/feed/FilterBar'
import { FILTER_OPTIONS, type FilterType, type TagItem } from '@/components/feed/types'

// Mock scrollIntoView for jsdom
Element.prototype.scrollIntoView = vi.fn()

// Mock window.matchMedia for responsive tests
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false, // Default to mobile view
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

  describe('Filter Options (Desktop)', () => {
    it('renders all 7 filter options in desktop container', () => {
      const { container } = render(<FilterBar {...defaultProps} />)

      // Find the desktop filter container (hidden sm:flex)
      const desktopContainer = container.querySelector('.sm\\:flex')
      expect(desktopContainer).toBeTruthy()

      // All filter labels should be in the desktop container
      const buttons = within(desktopContainer as HTMLElement).getAllByRole('button')
      const buttonLabels = buttons.map(b => b.textContent)

      expect(buttonLabels).toContain('All')
      expect(buttonLabels).toContain('Photos')
      expect(buttonLabels).toContain('Videos')
      expect(buttonLabels).toContain('Text')
      expect(buttonLabels).toContain('Articles')
      expect(buttonLabels).toContain('Quoted')
      expect(buttonLabels).toContain('Manual')
    })

    it('does NOT include needsTranscript filter', () => {
      render(<FilterBar {...defaultProps} />)

      expect(screen.queryByRole('button', { name: /needs transcript/i })).toBeNull()
      expect(screen.queryByRole('button', { name: /transcript/i })).toBeNull()
    })

    it('FILTER_OPTIONS constant has exactly 7 items', () => {
      expect(FILTER_OPTIONS).toHaveLength(7)
      expect(FILTER_OPTIONS.map(o => o.value)).not.toContain('needsTranscript')
    })

    it('applies active styling to selected filter', () => {
      const { container } = render(<FilterBar {...defaultProps} filter="photos" />)

      // Find desktop container
      const desktopContainer = container.querySelector('.sm\\:flex')
      const photosButton = within(desktopContainer as HTMLElement).getByRole('button', { name: 'Photos' })
      expect(photosButton.className).toContain('bg-gray-900')
    })
  })

  describe('Mobile Filter Dropdown', () => {
    it('shows current filter label in mobile dropdown button', () => {
      const { container } = render(<FilterBar {...defaultProps} filter="videos" />)

      // Find the mobile filter container (sm:hidden)
      const mobileContainer = container.querySelector('.sm\\:hidden')
      expect(mobileContainer).toBeTruthy()
      expect(mobileContainer?.textContent).toContain('Videos')
    })

    it('opens filter dropdown on mobile button click', () => {
      const { container } = render(<FilterBar {...defaultProps} />)

      // Find the mobile filter button
      const mobileContainer = container.querySelector('.sm\\:hidden')
      const mobileButton = within(mobileContainer as HTMLElement).getByRole('button')

      fireEvent.click(mobileButton)

      // All filter options should appear in dropdown
      // The dropdown should be visible with all 7 options
      const allButtons = screen.getAllByText('All')
      expect(allButtons.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('Tags Button', () => {
    it('shows "Tags" label on desktop when no tag selected', () => {
      render(<FilterBar {...defaultProps} />)

      // When no tag is selected, there should be a button with "Tags" text
      const tagsButtons = screen.getAllByRole('button')
      const tagsButton = tagsButtons.find(b => b.textContent?.includes('Tags'))
      expect(tagsButton).toBeTruthy()
    })

    it('shows selected tag name when a tag is selected', () => {
      render(<FilterBar {...defaultProps} selectedTags={['work']} />)

      // Button should show "work" instead of "Tags"
      const buttons = screen.getAllByRole('button')
      const tagButton = buttons.find(b => b.textContent?.includes('work') && !b.textContent?.includes('Tags'))
      expect(tagButton).toBeTruthy()
    })

    it('has blue background when a tag is selected', () => {
      render(<FilterBar {...defaultProps} selectedTags={['work']} />)

      // Find button with "work" that has blue background
      const buttons = screen.getAllByRole('button')
      const tagButton = buttons.find(b =>
        b.textContent?.includes('work') && b.className.includes('bg-blue-500')
      )
      expect(tagButton).toBeTruthy()
    })

    it('has gray background when no tags selected', () => {
      render(<FilterBar {...defaultProps} selectedTags={[]} />)

      // Find button with "Tags" that has gray background
      const buttons = screen.getAllByRole('button')
      const tagButton = buttons.find(b =>
        b.textContent?.includes('Tags') && b.className.includes('bg-gray-100')
      )
      expect(tagButton).toBeTruthy()
    })
  })

  describe('Single Tag Selection', () => {
    it('selecting a tag replaces previous selection (single select)', () => {
      const onSelectedTagsChange = vi.fn()
      render(
        <FilterBar
          {...defaultProps}
          selectedTags={['work']}
          onSelectedTagsChange={onSelectedTagsChange}
        />
      )

      // Find and click the tags button (shows "work")
      const buttons = screen.getAllByRole('button')
      const tagsButton = buttons.find(b =>
        b.textContent?.includes('work') && b.className.includes('bg-blue-500')
      )
      fireEvent.click(tagsButton!)

      // Click on "personal" tag in dropdown
      const personalTags = screen.getAllByText('personal')
      const personalInDropdown = personalTags.find(el =>
        el.closest('button')?.className.includes('w-full')
      )
      fireEvent.click(personalInDropdown!)

      // Should replace with just "personal"
      expect(onSelectedTagsChange).toHaveBeenCalledWith(['personal'])
    })

    it('clicking selected tag deselects it', () => {
      const onSelectedTagsChange = vi.fn()
      render(
        <FilterBar
          {...defaultProps}
          selectedTags={['work']}
          onSelectedTagsChange={onSelectedTagsChange}
        />
      )

      // Find and click the tags button (shows "work")
      const buttons = screen.getAllByRole('button')
      const tagsButton = buttons.find(b =>
        b.textContent?.includes('work') && b.className.includes('bg-blue-500')
      )
      fireEvent.click(tagsButton!)

      // Click on already selected "work" tag in dropdown
      const workTags = screen.getAllByText('work')
      const workInDropdown = workTags.find(el =>
        el.closest('button')?.className.includes('w-full')
      )
      fireEvent.click(workInDropdown!)

      // Should deselect
      expect(onSelectedTagsChange).toHaveBeenCalledWith([])
    })
  })

  describe('Tags Dropdown', () => {
    it('opens dropdown on button click', () => {
      render(<FilterBar {...defaultProps} />)

      // Find tags button
      const buttons = screen.getAllByRole('button')
      const tagsButton = buttons.find(b => b.textContent?.includes('Tags'))
      fireEvent.click(tagsButton!)

      // Dropdown should now be visible with tag options
      expect(screen.getByText('work')).toBeTruthy()
      expect(screen.getByText('personal')).toBeTruthy()
      expect(screen.getByText('important')).toBeTruthy()
    })

    it('shows tag counts in dropdown', () => {
      render(<FilterBar {...defaultProps} />)

      // Find tags button
      const buttons = screen.getAllByRole('button')
      const tagsButton = buttons.find(b => b.textContent?.includes('Tags'))
      fireEvent.click(tagsButton!)

      // Check that counts are displayed
      expect(screen.getByText('5')).toBeTruthy() // work count
      expect(screen.getByText('3')).toBeTruthy() // personal count
      expect(screen.getByText('2')).toBeTruthy() // important count
    })

    it('calls onSelectedTagsChange when tag is clicked', () => {
      const onSelectedTagsChange = vi.fn()
      render(<FilterBar {...defaultProps} onSelectedTagsChange={onSelectedTagsChange} />)

      // Find tags button
      const buttons = screen.getAllByRole('button')
      const tagsButton = buttons.find(b => b.textContent?.includes('Tags'))
      fireEvent.click(tagsButton!)

      // Find work tag in dropdown
      const workTag = screen.getByText('work')
      fireEvent.click(workTag)

      expect(onSelectedTagsChange).toHaveBeenCalledWith(['work'])
    })

    it('shows "Clear tag" option when a tag is selected', () => {
      render(<FilterBar {...defaultProps} selectedTags={['work']} />)

      // Find tags button (shows "work")
      const buttons = screen.getAllByRole('button')
      const tagsButton = buttons.find(b =>
        b.textContent?.includes('work') && b.className.includes('bg-blue-500')
      )
      fireEvent.click(tagsButton!)

      expect(screen.getByText('Clear tag')).toBeTruthy()
    })

    it('does not show "Clear tag" when no tags selected', () => {
      render(<FilterBar {...defaultProps} selectedTags={[]} />)

      // Find tags button
      const buttons = screen.getAllByRole('button')
      const tagsButton = buttons.find(b => b.textContent?.includes('Tags'))
      fireEvent.click(tagsButton!)

      expect(screen.queryByText('Clear tag')).toBeNull()
    })

    it('highlights selected tag in dropdown', () => {
      render(<FilterBar {...defaultProps} selectedTags={['work']} />)

      // Find tags button (shows "work")
      const buttons = screen.getAllByRole('button')
      const tagsButton = buttons.find(b =>
        b.textContent?.includes('work') && b.className.includes('bg-blue-500')
      )
      fireEvent.click(tagsButton!)

      // Get all elements with "work" text and find the one with blue text
      const workTags = screen.getAllByText('work')
      const highlightedTag = workTags.find(el => el.className.includes('text-blue-500'))
      expect(highlightedTag).toBeTruthy()
    })
  })

  describe('Unread Toggle', () => {
    it('shows "Unread only" when unreadOnly is true', () => {
      render(<FilterBar {...defaultProps} unreadOnly={true} />)

      expect(screen.getByText(/unread only/i)).toBeTruthy()
    })

    it('shows "Showing all" when unreadOnly is false', () => {
      render(<FilterBar {...defaultProps} unreadOnly={false} />)

      expect(screen.getByText(/showing all/i)).toBeTruthy()
    })

    it('calls onUnreadOnlyChange on toggle', () => {
      const onUnreadOnlyChange = vi.fn()
      render(<FilterBar {...defaultProps} onUnreadOnlyChange={onUnreadOnlyChange} />)

      // Find the unread toggle button
      const buttons = screen.getAllByRole('button')
      const toggleButton = buttons.find(b =>
        b.textContent?.includes('Showing all') || b.textContent?.includes('Unread')
      )
      fireEvent.click(toggleButton!)

      expect(onUnreadOnlyChange).toHaveBeenCalledWith(true)
    })
  })

  describe('No available tags', () => {
    it('does not render Tags button when no tags available', () => {
      render(<FilterBar {...defaultProps} availableTags={[]} />)

      const buttons = screen.getAllByRole('button')
      const tagsButton = buttons.find(b => b.textContent?.includes('Tags'))
      expect(tagsButton).toBeFalsy()
    })
  })
})
