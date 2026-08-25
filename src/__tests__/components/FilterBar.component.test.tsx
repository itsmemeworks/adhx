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
 * - Tag selection + "Make public" (tag-collections-as-theater feature —
 *   tagging UI was removed in the original Matter redesign, then reintroduced
 *   here specifically to drive the selected-tag toolbar's share flow)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, screen, waitFor } from '@testing-library/react'
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
  hideArchived: false,
  onHideArchivedChange: vi.fn(),
  selectedTags: [] as string[],
  onSelectedTagsChange: vi.fn(),
  availableTags: [
    { tag: 'work', count: 5 },
    { tag: 'personal', count: 3 },
    { tag: 'important', count: 2 },
  ] as TagItem[],
  stats: { total: 100, active: 50 },
}

describe('FilterBar Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Type Filter Pills', () => {
    it('renders All / Photos / Videos / Text / Articles', () => {
      render(<FilterBar {...defaultProps} />)

      expect(screen.getByRole('button', { name: 'All' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Photos' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Videos' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Text' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Articles' })).toBeTruthy()
      expect(screen.queryByRole('button', { name: 'Quoted' })).toBeNull()
      expect(screen.queryByRole('button', { name: 'Manual' })).toBeNull()
    })

    it('does NOT include needsTranscript filter', () => {
      render(<FilterBar {...defaultProps} />)

      expect(screen.queryByRole('button', { name: /needs transcript/i })).toBeNull()
      expect(screen.queryByRole('button', { name: /transcript/i })).toBeNull()
    })

    it('FILTER_OPTIONS constant has exactly 5 items', () => {
      expect(FILTER_OPTIONS).toHaveLength(5)
      expect(FILTER_OPTIONS.map((o) => o.value)).not.toContain('needsTranscript')
      expect(FILTER_OPTIONS.map((o) => o.value)).not.toContain('quoted')
      expect(FILTER_OPTIONS.map((o) => o.value)).not.toContain('manual')
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

    it('hides the type filter pills while a tag is selected', () => {
      render(<FilterBar {...defaultProps} selectedTags={['work']} />)

      expect(screen.queryByRole('button', { name: 'All' })).toBeFalsy()
      expect(screen.queryByRole('button', { name: 'Photos' })).toBeFalsy()
      expect(screen.queryByRole('button', { name: 'Videos' })).toBeFalsy()
    })

    it('shows the type filter pills again once the tag is cleared', () => {
      const { rerender } = render(<FilterBar {...defaultProps} selectedTags={['work']} />)
      expect(screen.queryByRole('button', { name: 'All' })).toBeFalsy()

      rerender(<FilterBar {...defaultProps} selectedTags={[]} />)
      expect(screen.getByRole('button', { name: 'All' })).toBeTruthy()
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
    // The user-facing idea is archiving, not read state (owner) — the
    // underlying `hideArchived` flag keeps its name.
    it('renders the "Hide archived" toggle', () => {
      render(<FilterBar {...defaultProps} hideArchived={false} />)

      expect(screen.getByText(/hide archived/i)).toBeTruthy()
    })

    it('shows the active count, and offers to show archived, when archived are hidden', () => {
      render(<FilterBar {...defaultProps} hideArchived={true} />)

      const buttons = screen.getAllByRole('button')
      // The label names the view the press will TAKE you to, since there are
      // only two views and neither is a mode you switch on.
      const toggleButton = buttons.find((b) => b.textContent?.includes('Show archived'))
      expect(toggleButton?.textContent).toContain('50')
    })

    it('shows the archived count when hideArchived is false', () => {
      render(
        <FilterBar {...defaultProps} hideArchived={false} stats={{ total: 100, active: 70 }} />,
      )

      const buttons = screen.getAllByRole('button')
      const toggleButton = buttons.find((b) => b.textContent?.includes('Hide archived'))
      expect(toggleButton?.textContent).toContain('30')
      expect(toggleButton?.textContent).not.toContain('100')
    })

    // Owner: "there's no need for it to have an orange CTA. You're either
    // viewing your collection with archive or without." A view switch is not a
    // call to action, so neither state gets the accent treatment.
    it('never uses the accent CTA styling in either state', () => {
      const { rerender } = render(<FilterBar {...defaultProps} hideArchived={true} />)
      const find = (label: string) =>
        screen.getAllByRole('button').find((b) => b.textContent?.includes(label))

      expect(find('Show archived')?.className).not.toContain('bg-clay-grad')
      expect(find('Show archived')?.className).not.toContain('shadow-glow')

      rerender(<FilterBar {...defaultProps} hideArchived={false} />)
      expect(find('Hide archived')?.className).not.toContain('bg-clay-grad')
      expect(find('Hide archived')?.className).not.toContain('shadow-glow')
    })

    it('reflects which view is active for assistive tech', () => {
      const { rerender } = render(<FilterBar {...defaultProps} hideArchived={true} />)
      const btn = () =>
        screen.getAllByRole('button').find((b) => /archived/.test(b.textContent ?? ''))
      // Pressed = viewing archived posts only.
      expect(btn()?.getAttribute('aria-pressed')).toBe('false')
      rerender(<FilterBar {...defaultProps} hideArchived={false} />)
      expect(btn()?.getAttribute('aria-pressed')).toBe('true')
    })

    it('calls onHideArchivedChange on toggle', () => {
      const onHideArchivedChange = vi.fn()
      render(<FilterBar {...defaultProps} onHideArchivedChange={onHideArchivedChange} />)

      const buttons = screen.getAllByRole('button')
      const toggleButton = buttons.find((b) => b.textContent?.includes('Hide archived'))
      fireEvent.click(toggleButton!)

      expect(onHideArchivedChange).toHaveBeenCalledWith(true)
    })
  })

  describe('Tag selection + Make public', () => {
    it('renders a Tags dropdown listing available tags with counts', () => {
      render(<FilterBar {...defaultProps} />)

      const buttons = screen.getAllByRole('button')
      const tagsButton = buttons.find((b) => b.textContent?.includes('Tags'))
      expect(tagsButton).toBeTruthy()

      fireEvent.click(tagsButton!)
      expect(screen.getByText('#work')).toBeTruthy()
      expect(screen.getByText('#personal')).toBeTruthy()
      expect(screen.getByText('#important')).toBeTruthy()
    })

    it('does not render the Tags dropdown when there are no tags', () => {
      render(<FilterBar {...defaultProps} availableTags={[]} />)

      const buttons = screen.getAllByRole('button')
      const tagsButton = buttons.find((b) => b.textContent === 'Tags')
      expect(tagsButton).toBeFalsy()
    })

    it('selecting a tag calls onSelectedTagsChange with just that tag', () => {
      const onSelectedTagsChange = vi.fn()
      render(<FilterBar {...defaultProps} onSelectedTagsChange={onSelectedTagsChange} />)

      const buttons = screen.getAllByRole('button')
      const tagsButton = buttons.find((b) => b.textContent?.includes('Tags'))
      fireEvent.click(tagsButton!)
      fireEvent.click(screen.getByText('#work'))

      expect(onSelectedTagsChange).toHaveBeenCalledWith(['work'])
    })

    it('shows the selected-tag toolbar with post count and a Make public button', () => {
      render(<FilterBar {...defaultProps} selectedTags={['work']} />)

      // "#work" appears twice while selected: the Tags dropdown pill's own
      // label, and the toolbar's tag heading — both are expected here.
      expect(screen.getAllByText('#work').length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText(/5 post/)).toBeTruthy()
      expect(screen.getByRole('button', { name: /make public/i })).toBeTruthy()
    })

    it('does not show the toolbar when no tag is selected', () => {
      render(<FilterBar {...defaultProps} selectedTags={[]} />)

      expect(screen.queryByRole('button', { name: /make public/i })).toBeFalsy()
    })

    it('shows a Public chip when the selected tag is already public', () => {
      render(
        <FilterBar
          {...defaultProps}
          selectedTags={['work']}
          availableTags={[{ tag: 'work', count: 5, isPublic: true, shareUrl: '/t/user/work' }]}
        />,
      )

      expect(screen.getByText('Public')).toBeTruthy()
    })

    it('clears the selected tag via the clear button', () => {
      const onSelectedTagsChange = vi.fn()
      render(
        <FilterBar
          {...defaultProps}
          selectedTags={['work']}
          onSelectedTagsChange={onSelectedTagsChange}
        />,
      )

      fireEvent.click(screen.getByLabelText(/clear tag filter/i))
      expect(onSelectedTagsChange).toHaveBeenCalledWith([])
    })

    it('PATCHes /api/tags, copies the share link, and notifies onTagUpdated', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined)
      Object.assign(navigator, { clipboard: { writeText } })
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, shareUrl: '/t/user/work', isPublic: true }),
      }) as unknown as typeof fetch
      const onTagUpdated = vi.fn()

      render(<FilterBar {...defaultProps} selectedTags={['work']} onTagUpdated={onTagUpdated} />)
      fireEvent.click(screen.getByRole('button', { name: /make public/i }))

      await waitFor(() => expect(writeText).toHaveBeenCalled())
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/tags',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ tag: 'work', isPublic: true }),
        }),
      )
      expect(onTagUpdated).toHaveBeenCalledWith('work', true, '/t/user/work')
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/t/user/work'))
      await waitFor(() => expect(screen.getByText(/copied/i)).toBeTruthy())
    })
  })

  describe('"+ New tag" (tags: create + fill)', () => {
    it('renders a "+ New tag" row in the Tags dropdown', () => {
      render(<FilterBar {...defaultProps} onTagSelectChange={vi.fn()} />)

      const buttons = screen.getAllByRole('button')
      fireEvent.click(buttons.find((b) => b.textContent?.includes('Tags'))!)

      expect(screen.getByRole('button', { name: /new tag/i })).toBeTruthy()
    })

    it('shows an inline input with a sanitized preview after clicking "+ New tag"', () => {
      render(<FilterBar {...defaultProps} onTagSelectChange={vi.fn()} />)

      const buttons = screen.getAllByRole('button')
      fireEvent.click(buttons.find((b) => b.textContent?.includes('Tags'))!)
      fireEvent.click(screen.getByRole('button', { name: /new tag/i }))

      const input = screen.getByPlaceholderText('tag name')
      fireEvent.change(input, { target: { value: 'Claude Code!' } })

      expect(screen.getByText('→ #claude-code')).toBeTruthy()
    })

    it('submitting the new-tag form selects it and enters Add-posts mode', () => {
      const onSelectedTagsChange = vi.fn()
      const onTagSelectChange = vi.fn()
      render(
        <FilterBar
          {...defaultProps}
          onSelectedTagsChange={onSelectedTagsChange}
          onTagSelectChange={onTagSelectChange}
        />,
      )

      const buttons = screen.getAllByRole('button')
      fireEvent.click(buttons.find((b) => b.textContent?.includes('Tags'))!)
      fireEvent.click(screen.getByRole('button', { name: /new tag/i }))

      const input = screen.getByPlaceholderText('tag name')
      fireEvent.change(input, { target: { value: 'Reading List' } })
      fireEvent.submit(input.closest('form')!)

      expect(onSelectedTagsChange).toHaveBeenCalledWith(['reading-list'])
      expect(onTagSelectChange).toHaveBeenCalledWith('reading-list')
    })

    it('keeps the Tags dropdown visible with zero tags when onTagSelectChange is wired', () => {
      render(<FilterBar {...defaultProps} availableTags={[]} onTagSelectChange={vi.fn()} />)

      const buttons = screen.getAllByRole('button')
      expect(buttons.find((b) => b.textContent === 'Tags')).toBeTruthy()
    })
  })

  describe('"Add posts" / "Done adding" toolbar toggle', () => {
    it('shows "Add posts" for the selected tag when onTagSelectChange is wired', () => {
      render(<FilterBar {...defaultProps} selectedTags={['work']} onTagSelectChange={vi.fn()} />)

      expect(screen.getByRole('button', { name: /add posts/i })).toBeTruthy()
    })

    it('clicking "Add posts" calls onTagSelectChange with the selected tag', () => {
      const onTagSelectChange = vi.fn()
      render(
        <FilterBar
          {...defaultProps}
          selectedTags={['work']}
          onTagSelectChange={onTagSelectChange}
        />,
      )

      fireEvent.click(screen.getByRole('button', { name: /add posts/i }))
      expect(onTagSelectChange).toHaveBeenCalledWith('work')
    })

    it('shows "Done adding" and calls onTagSelectChange(null) when tagSelect matches', () => {
      const onTagSelectChange = vi.fn()
      render(
        <FilterBar
          {...defaultProps}
          selectedTags={['work']}
          tagSelect="work"
          onTagSelectChange={onTagSelectChange}
        />,
      )

      const doneButton = screen.getByRole('button', { name: /done adding/i })
      fireEvent.click(doneButton)
      expect(onTagSelectChange).toHaveBeenCalledWith(null)
    })

    it('sticks below the header so Done adding stays on screen while the grid scrolls', () => {
      const { container } = render(
        <FilterBar
          {...defaultProps}
          selectedTags={['work']}
          tagSelect="work"
          onTagSelectChange={vi.fn()}
        />,
      )
      // Header is `h-16` / sticky top-0. FilterBar used to be `top-0` too, so
      // it slid under the header and the add-posts chrome vanished on scroll.
      expect(container.firstChild).toHaveClass('sticky', 'top-16')
    })

    it('does not render the Add posts/Done adding button without onTagSelectChange', () => {
      render(<FilterBar {...defaultProps} selectedTags={['work']} />)

      expect(screen.queryByRole('button', { name: /add posts/i })).toBeFalsy()
      expect(screen.queryByRole('button', { name: /done adding/i })).toBeFalsy()
    })

    it('pressing Escape while tagSelect is active exits selection mode', () => {
      const onTagSelectChange = vi.fn()
      render(
        <FilterBar
          {...defaultProps}
          selectedTags={['work']}
          tagSelect="work"
          onTagSelectChange={onTagSelectChange}
        />,
      )

      fireEvent.keyDown(window, { key: 'Escape' })
      expect(onTagSelectChange).toHaveBeenCalledWith(null)
    })
  })
})
