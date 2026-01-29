'use client'

import { useState, useRef, forwardRef, useImperativeHandle, useEffect } from 'react'
import { X, Plus, Tag } from 'lucide-react'
import type { TagItem } from './types'

export interface TagInputHandle {
  focus: () => void
}

interface TagInputProps {
  tags: string[]
  availableTags: TagItem[]
  onAddTag: (tag: string) => Promise<void>
  onRemoveTag: (tag: string) => void
}

export const TagInput = forwardRef<TagInputHandle, TagInputProps>(function TagInput(
  { tags, availableTags, onAddTag, onRemoveTag },
  ref
) {
  const [newTag, setNewTag] = useState('')
  const [tagError, setTagError] = useState<string | null>(null)
  const [_addingTag, setAddingTag] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
  }))

  const suggestions = availableTags
    .filter(({ tag }) => !tags.includes(tag))
    .filter(({ tag }) => newTag && tag.toLowerCase().includes(newTag.toLowerCase()))
    .slice(0, 5)

  // Reset focused index when suggestions change
  useEffect(() => {
    setFocusedIndex(-1)
  }, [newTag])

  // Handle keyboard navigation
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (!showSuggestions || suggestions.length === 0) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setFocusedIndex((prev) => (prev + 1) % suggestions.length)
        break
      case 'ArrowUp':
        e.preventDefault()
        setFocusedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length)
        break
      case 'Enter':
        if (focusedIndex >= 0 && focusedIndex < suggestions.length) {
          e.preventDefault()
          handleSelectSuggestion(suggestions[focusedIndex].tag)
        }
        break
      case 'Escape':
        e.preventDefault()
        setShowSuggestions(false)
        setFocusedIndex(-1)
        break
    }
  }

  async function handleAddTag(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    const tag = newTag.trim().toLowerCase()
    if (!tag) return

    if (tag.length > 10) {
      setTagError('Max 10 characters')
      return
    }

    setAddingTag(true)
    setTagError(null)
    setShowSuggestions(false)
    try {
      await onAddTag(tag)
      setNewTag('')
    } catch {
      setTagError('Failed to add tag')
    } finally {
      setAddingTag(false)
    }
  }

  async function handleSelectSuggestion(tag: string): Promise<void> {
    setAddingTag(true)
    setTagError(null)
    setShowSuggestions(false)
    try {
      await onAddTag(tag)
      setNewTag('')
    } catch {
      setTagError('Failed to add tag')
    } finally {
      setAddingTag(false)
    }
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-300 rounded text-xs border border-transparent"
        >
          {tag}
          <button onClick={() => onRemoveTag(tag)} className="hover:text-blue-800 dark:hover:text-white transition-colors">
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      <div className="relative">
        <form onSubmit={handleAddTag}>
          <span className="inline-flex items-center px-2 py-0.5 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded text-xs focus-within:border-blue-400 dark:focus-within:border-blue-500 transition-colors">
            <input
              ref={inputRef}
              type="text"
              value={newTag}
              onChange={(e) => {
                setNewTag(e.target.value)
                setTagError(null)
                setShowSuggestions(true)
              }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              onKeyDown={handleKeyDown}
              placeholder="add tag"
              maxLength={10}
              className="w-12 bg-transparent text-xs text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none"
            />
            {newTag.trim() ? (
              <button
                type="submit"
                onMouseDown={(e) => e.preventDefault()}
                className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
                title="Add tag"
              >
                <Plus className="w-3 h-3" />
              </button>
            ) : (
              <Tag className="w-3 h-3 text-gray-400 dark:text-gray-500" />
            )}
          </span>
        </form>
        {showSuggestions && suggestions.length > 0 && (
          <div
            ref={suggestionsRef}
            className="absolute bottom-full left-0 mb-1 w-32 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded shadow-lg z-10"
          >
            {suggestions.map(({ tag, count }, index) => (
              <button
                key={tag}
                type="button"
                onClick={() => handleSelectSuggestion(tag)}
                className={`w-full px-2 py-1.5 text-left text-xs text-gray-900 dark:text-white flex justify-between items-center ${
                  index === focusedIndex
                    ? 'bg-blue-100 dark:bg-blue-900/50'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <span>{tag}</span>
                <span className="text-gray-400 dark:text-gray-500">{count}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {tagError && <span className="text-red-500 dark:text-red-400 text-xs">{tagError}</span>}
    </div>
  )
})
