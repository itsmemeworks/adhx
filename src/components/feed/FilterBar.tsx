'use client'

import { useRef, useState, useEffect } from 'react'
import { Tag, X, Eye, EyeOff } from 'lucide-react'
import { FILTER_OPTIONS, type FilterType, type TagItem } from './types'

interface FilterBarProps {
  filter: FilterType
  onFilterChange: (filter: FilterType) => void
  unreadOnly: boolean
  onUnreadOnlyChange: (unreadOnly: boolean) => void
  selectedTags: string[]
  onSelectedTagsChange: (tags: string[]) => void
  availableTags: TagItem[]
  stats: { total: number; unread: number }
}

export function FilterBar({
  filter,
  onFilterChange,
  unreadOnly,
  onUnreadOnlyChange,
  selectedTags,
  onSelectedTagsChange,
  availableTags,
  stats,
}: FilterBarProps): React.ReactElement {
  const [showTagDropdown, setShowTagDropdown] = useState(false)
  const [tagDropdownPos, setTagDropdownPos] = useState({ top: 0, left: 0 })
  const [focusedTagIndex, setFocusedTagIndex] = useState(-1)
  const tagButtonRef = useRef<HTMLButtonElement>(null)
  const tagDropdownRef = useRef<HTMLDivElement>(null)

  // Calculate total items in dropdown (clear button + tags)
  const hasClearButton = selectedTags.length > 0
  const totalItems = availableTags.length + (hasClearButton ? 1 : 0)

  // Listen for keyboard shortcut to toggle tag filter
  useEffect(() => {
    const handleToggleTagFilter = () => {
      if (availableTags.length > 0 && tagButtonRef.current) {
        const rect = tagButtonRef.current.getBoundingClientRect()
        setTagDropdownPos({ top: rect.bottom + 4, left: rect.left })
        setShowTagDropdown((prev) => !prev)
      }
    }

    window.addEventListener('toggle-tag-filter', handleToggleTagFilter)
    return () => window.removeEventListener('toggle-tag-filter', handleToggleTagFilter)
  }, [availableTags.length])

  // Reset focused index when dropdown opens/closes
  useEffect(() => {
    if (showTagDropdown) {
      setFocusedTagIndex(0) // Start at first item
    } else {
      setFocusedTagIndex(-1)
    }
  }, [showTagDropdown])

  // Keyboard navigation for tag dropdown
  useEffect(() => {
    if (!showTagDropdown) return

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setFocusedTagIndex((prev) => (prev + 1) % totalItems)
          break
        case 'ArrowUp':
          e.preventDefault()
          setFocusedTagIndex((prev) => (prev - 1 + totalItems) % totalItems)
          break
        case 'Enter':
        case ' ':
          e.preventDefault()
          if (focusedTagIndex >= 0) {
            if (hasClearButton && focusedTagIndex === 0) {
              // Clear all tags
              onSelectedTagsChange([])
              setShowTagDropdown(false)
            } else {
              // Toggle the tag
              const tagIndex = hasClearButton ? focusedTagIndex - 1 : focusedTagIndex
              if (tagIndex >= 0 && tagIndex < availableTags.length) {
                toggleTag(availableTags[tagIndex].tag)
              }
            }
          }
          break
        case 'Escape':
          e.preventDefault()
          setShowTagDropdown(false)
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showTagDropdown, focusedTagIndex, totalItems, hasClearButton, availableTags, onSelectedTagsChange])

  // Auto-scroll focused item into view
  useEffect(() => {
    if (!showTagDropdown || focusedTagIndex < 0 || !tagDropdownRef.current) return

    const container = tagDropdownRef.current
    const focusedElement = container.children[focusedTagIndex] as HTMLElement
    if (focusedElement) {
      focusedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [focusedTagIndex, showTagDropdown])

  function handleTagButtonClick(): void {
    if (!showTagDropdown && tagButtonRef.current) {
      const rect = tagButtonRef.current.getBoundingClientRect()
      setTagDropdownPos({ top: rect.bottom + 4, left: rect.left })
    }
    setShowTagDropdown(!showTagDropdown)
  }

  function toggleTag(tag: string): void {
    onSelectedTagsChange(
      selectedTags.includes(tag) ? selectedTags.filter((t) => t !== tag) : [...selectedTags, tag]
    )
  }

  return (
    <div className="sticky top-0 z-30 bg-white dark:bg-gray-950 border-b dark:border-gray-800">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4 px-3 sm:px-4 py-2 sm:py-3">
        {/* Filter Chips */}
        <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-1 sm:pb-0 -mx-1 px-1 scrollbar-hide">
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onFilterChange(opt.value)}
              className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-medium whitespace-nowrap transition-colors ${
                filter === opt.value
                  ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {opt.label}
            </button>
          ))}

          {/* Tag Filter Dropdown */}
          {availableTags.length > 0 && (
            <div className="relative ml-1 sm:ml-2">
              <button
                ref={tagButtonRef}
                onClick={handleTagButtonClick}
                className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-medium transition-colors ${
                  selectedTags.length > 0
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                <Tag className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="hidden xs:inline">{selectedTags.length > 0 ? `${selectedTags.length} tag${selectedTags.length > 1 ? 's' : ''}` : 'Tags'}</span>
              </button>

              {showTagDropdown && (
                <>
                  <div className="fixed inset-0 z-[100]" onClick={() => setShowTagDropdown(false)} />
                  <div
                    ref={tagDropdownRef}
                    className="fixed w-48 bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 py-2 z-[101] max-h-64 overflow-y-auto"
                    style={{ top: tagDropdownPos.top, left: tagDropdownPos.left }}
                  >
                    {selectedTags.length > 0 && (
                      <button
                        onClick={() => {
                          onSelectedTagsChange([])
                          setShowTagDropdown(false)
                        }}
                        className={`w-full px-3 py-2 text-left text-sm text-red-500 ${
                          focusedTagIndex === 0
                            ? 'bg-gray-100 dark:bg-gray-800 ring-2 ring-inset ring-blue-500'
                            : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                        }`}
                      >
                        Clear all tags
                      </button>
                    )}
                    {availableTags.map(({ tag, count }, index) => {
                      const itemIndex = hasClearButton ? index + 1 : index
                      const isFocused = focusedTagIndex === itemIndex
                      return (
                        <button
                          key={tag}
                          onClick={() => toggleTag(tag)}
                          className={`w-full px-3 py-2 text-left text-sm flex items-center justify-between ${
                            isFocused
                              ? 'bg-gray-100 dark:bg-gray-800 ring-2 ring-inset ring-blue-500'
                              : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                          }`}
                        >
                          <span
                            className={
                              selectedTags.includes(tag) ? 'text-blue-500 font-medium' : 'text-gray-700 dark:text-gray-300'
                            }
                          >
                            {tag}
                          </span>
                          <span className="text-gray-400 text-xs">{count}</span>
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Selected tag chips */}
          {selectedTags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 px-2 sm:px-3 py-1 sm:py-1.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full text-xs sm:text-sm"
            >
              {tag}
              <button
                onClick={() => onSelectedTagsChange(selectedTags.filter((t) => t !== tag))}
                className="hover:bg-blue-200 dark:hover:bg-blue-800 rounded-full p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>

        {/* Unread Toggle */}
        <button
          onClick={() => onUnreadOnlyChange(!unreadOnly)}
          className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-medium transition-colors flex-shrink-0 ${
            unreadOnly
              ? 'bg-blue-500 text-white'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
          }`}
        >
          {unreadOnly ? (
            <>
              <EyeOff className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">Unread only</span>
              <span className="sm:hidden">Unread</span>
              <span className="text-xs bg-white/20 px-1.5 py-0.5 rounded">{stats.unread}</span>
            </>
          ) : (
            <>
              <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">Showing all</span>
              <span className="sm:hidden">All</span>
              <span className="text-xs bg-black/10 dark:bg-white/10 px-1.5 py-0.5 rounded">{stats.total}</span>
            </>
          )}
        </button>
      </div>
    </div>
  )
}
