'use client'

import { useState, useEffect, useRef } from 'react'
import { Folder, ChevronDown, Check, Plus, X } from 'lucide-react'
import { useCollections } from '@/lib/collections-context'
import { cn } from '@/lib/utils'

interface CollectionChipProps {
  selectedCollectionId: string | null
  onSelect: (collectionId: string | null) => void
  onCreateNew?: () => void
}

export function CollectionChip({ selectedCollectionId, onSelect, onCreateNew }: CollectionChipProps) {
  const { collections, loading } = useCollections()
  const [isOpen, setIsOpen] = useState(false)
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const selectedCollection = collections.find((c) => c.id === selectedCollectionId)

  // Close on escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsOpen(false)
    }
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  // Don't render if no collections and still loading
  if (loading && collections.length === 0) {
    return null
  }

  function handleButtonClick() {
    if (!isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setDropdownPos({ top: rect.bottom + 4, left: rect.left })
    }
    setIsOpen(!isOpen)
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Chip trigger */}
      <button
        ref={buttonRef}
        onClick={handleButtonClick}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
          selectedCollection
            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
            : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
        )}
      >
        {selectedCollection ? (
          <>
            <div
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: selectedCollection.color || '#6b7280' }}
            />
            <span className="max-w-[100px] truncate">{selectedCollection.name}</span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onSelect(null)
              }}
              className="ml-0.5 p-0.5 rounded-full hover:bg-blue-200 dark:hover:bg-blue-800"
            >
              <X className="w-3 h-3" />
            </button>
          </>
        ) : (
          <>
            <Folder className="w-4 h-4" />
            <span>Collections</span>
            <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', isOpen && 'rotate-180')} />
          </>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <>
          {/* Backdrop to close on click outside */}
          <div className="fixed inset-0 z-[100]" onClick={() => setIsOpen(false)} />
          <div
            className="fixed w-56 bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden z-[101]"
            style={{ top: dropdownPos.top, left: dropdownPos.left }}
          >
          {collections.length === 0 ? (
            <div className="text-center py-6 px-4">
              <Folder className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
              <p className="text-sm text-gray-500 mb-3">No collections yet</p>
              {onCreateNew && (
                <button
                  onClick={() => {
                    setIsOpen(false)
                    onCreateNew()
                  }}
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Create your first collection
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="max-h-64 overflow-y-auto p-1">
                {/* All option */}
                <button
                  onClick={() => {
                    onSelect(null)
                    setIsOpen(false)
                  }}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors',
                    !selectedCollectionId
                      ? 'bg-gray-100 dark:bg-gray-800'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                  )}
                >
                  <Folder className="w-4 h-4 text-gray-400" />
                  <span className="flex-1 text-sm font-medium text-gray-900 dark:text-white">
                    All Bookmarks
                  </span>
                  {!selectedCollectionId && <Check className="w-4 h-4 text-blue-500" />}
                </button>

                <div className="h-px bg-gray-100 dark:bg-gray-800 my-1" />

                {/* Collections */}
                {collections.map((collection) => (
                  <button
                    key={collection.id}
                    onClick={() => {
                      onSelect(collection.id)
                      setIsOpen(false)
                    }}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors',
                      selectedCollectionId === collection.id
                        ? 'bg-blue-50 dark:bg-blue-900/20'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                    )}
                  >
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: collection.color || '#6b7280' }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {collection.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {collection.tweetCount} {collection.tweetCount === 1 ? 'tweet' : 'tweets'}
                      </p>
                    </div>
                    {selectedCollectionId === collection.id && (
                      <Check className="w-4 h-4 text-blue-500 flex-shrink-0" />
                    )}
                  </button>
                ))}
              </div>

              {/* Create new */}
              {onCreateNew && (
                <div className="p-2 border-t border-gray-100 dark:border-gray-800">
                  <button
                    onClick={() => {
                      setIsOpen(false)
                      onCreateNew()
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    <span className="text-sm font-medium">New Collection</span>
                  </button>
                </div>
              )}
            </>
          )}
          </div>
        </>
      )}
    </div>
  )
}
