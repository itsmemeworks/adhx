'use client'

import { useRef, useState, useEffect } from 'react'
import { Tag, Eye, EyeOff, Globe, Link, Check, Filter, ChevronDown } from 'lucide-react'
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
  onTagUpdated?: (tag: string, isPublic: boolean, shareCode: string) => void
}

/**
 * Inline share button for a single selected tag
 * Shows "Make Public" (Globe) for private tags, copy link (Link/Check) for public tags
 */
function TagShareButton({
  tag,
  tagInfo,
  onTagUpdated,
}: {
  tag: string
  tagInfo: TagItem | undefined
  onTagUpdated?: (tag: string, isPublic: boolean, shareCode: string) => void
}): React.ReactElement | null {
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(false)

  const shareUrl = tagInfo?.shareCode
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/t/${tagInfo.shareCode}`
    : null

  const handleMakePublic = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/tags', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag, isPublic: true }),
      })
      if (!res.ok) throw new Error('Failed to make tag public')
      const data = await res.json()

      // Copy URL to clipboard
      const url = `${window.location.origin}/t/${data.shareCode}`
      try {
        await navigator.clipboard.writeText(url)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } catch {
        // Clipboard failed - still update state, user can copy manually
      }

      onTagUpdated?.(tag, true, data.shareCode)
    } catch (error) {
      console.error('Failed to make tag public:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCopyUrl = async () => {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard failed silently
    }
  }

  if (tagInfo?.isPublic && shareUrl) {
    return (
      <button
        onClick={handleCopyUrl}
        className="flex items-center gap-1 px-2 py-1.5 rounded-full text-xs font-medium transition-colors bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50"
        title={copied ? 'Copied!' : 'Copy share link'}
      >
        {copied ? <Check className="w-3.5 h-3.5" /> : <Link className="w-3.5 h-3.5" />}
        <span className="hidden sm:inline">{copied ? 'Copied!' : 'Share'}</span>
      </button>
    )
  }

  return (
    <button
      onClick={handleMakePublic}
      disabled={loading}
      className="flex items-center gap-1 px-2 py-1.5 rounded-full text-xs font-medium transition-colors bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50"
      title="Make tag public to share"
    >
      <Globe className="w-3.5 h-3.5" />
      <span className="hidden sm:inline">{loading ? 'Sharing...' : 'Make Public'}</span>
    </button>
  )
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
  onTagUpdated,
}: FilterBarProps): React.ReactElement {
  const [showTagDropdown, setShowTagDropdown] = useState(false)
  const [showFilterDropdown, setShowFilterDropdown] = useState(false)
  const [tagDropdownPos, setTagDropdownPos] = useState({ top: 0, left: 0 })
  const [filterDropdownPos, setFilterDropdownPos] = useState({ top: 0, left: 0 })
  const [focusedTagIndex, setFocusedTagIndex] = useState(-1)
  const tagButtonRef = useRef<HTMLButtonElement>(null)
  const filterButtonRef = useRef<HTMLButtonElement>(null)
  const tagDropdownRef = useRef<HTMLDivElement>(null)

  // Calculate total items in dropdown (clear button + tags)
  const hasClearButton = selectedTags.length > 0
  const totalItems = availableTags.length + (hasClearButton ? 1 : 0)

  // Get current filter label
  const currentFilterLabel = FILTER_OPTIONS.find((opt) => opt.value === filter)?.label || 'All'

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
              // Select the tag (single selection)
              const tagIndex = hasClearButton ? focusedTagIndex - 1 : focusedTagIndex
              if (tagIndex >= 0 && tagIndex < availableTags.length) {
                selectTag(availableTags[tagIndex].tag)
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

  function handleFilterButtonClick(): void {
    if (!showFilterDropdown && filterButtonRef.current) {
      const rect = filterButtonRef.current.getBoundingClientRect()
      setFilterDropdownPos({ top: rect.bottom + 4, left: rect.left })
    }
    setShowFilterDropdown(!showFilterDropdown)
  }

  function selectTag(tag: string): void {
    // Single selection only - if already selected, deselect; otherwise select only this tag
    if (selectedTags.includes(tag)) {
      onSelectedTagsChange([])
    } else {
      onSelectedTagsChange([tag])
    }
    setShowTagDropdown(false)
  }

  return (
    <div className="sticky top-0 z-30 bg-white dark:bg-gray-950 border-b dark:border-gray-800">
      <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-2 sm:py-3">
        {/* Mobile Filter Dropdown */}
        <div className="sm:hidden relative">
          <button
            ref={filterButtonRef}
            onClick={handleFilterButtonClick}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-gray-900 dark:bg-white text-white dark:text-gray-900"
          >
            <Filter className="w-3.5 h-3.5" />
            <span>{currentFilterLabel}</span>
            <ChevronDown className="w-3 h-3" />
          </button>

          {showFilterDropdown && (
            <>
              <div className="fixed inset-0 z-[100]" onClick={() => setShowFilterDropdown(false)} />
              <div
                className="fixed w-36 bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 py-2 z-[101]"
                style={{ top: filterDropdownPos.top, left: filterDropdownPos.left }}
              >
                {FILTER_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => {
                      onFilterChange(opt.value)
                      setShowFilterDropdown(false)
                    }}
                    className={`w-full px-3 py-2 text-left text-sm ${
                      filter === opt.value
                        ? 'text-blue-500 font-medium'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Desktop Filter Chips */}
        <div className="hidden sm:flex items-center gap-2 overflow-x-auto scrollbar-hide">
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onFilterChange(opt.value)}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                filter === opt.value
                  ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Right side: Tags + Unread */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Tag Filter Dropdown */}
          {availableTags.length > 0 && (
            <div className="relative">
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
                {selectedTags.length > 0 ? (
                  <span className="max-w-[80px] truncate">{selectedTags[0]}</span>
                ) : (
                  <span className="hidden sm:inline">Tags</span>
                )}
                <ChevronDown className="w-3 h-3" />
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
                        Clear tag
                      </button>
                    )}
                    {availableTags.map(({ tag, count }, index) => {
                      const itemIndex = hasClearButton ? index + 1 : index
                      const isFocused = focusedTagIndex === itemIndex
                      return (
                        <button
                          key={tag}
                          onClick={() => selectTag(tag)}
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

          {/* Tag Share Button - shown when exactly one tag is selected */}
          {selectedTags.length === 1 && (
            <TagShareButton
              tag={selectedTags[0]}
              tagInfo={availableTags.find((t) => t.tag === selectedTags[0])}
              onTagUpdated={onTagUpdated}
            />
          )}

          {/* Unread Toggle */}
          <button
            onClick={() => onUnreadOnlyChange(!unreadOnly)}
            className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-medium transition-colors flex-shrink-0 ${
              unreadOnly
                ? 'bg-blue-500 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
            }`}
          >
            {unreadOnly ? (
              <>
                <EyeOff className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">Unread only</span>
                <span className="text-xs bg-white/20 px-1.5 py-0.5 rounded">{stats.unread}</span>
              </>
            ) : (
              <>
                <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">Showing all</span>
                <span className="text-xs bg-black/10 dark:bg-white/10 px-1.5 py-0.5 rounded">{stats.total}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
