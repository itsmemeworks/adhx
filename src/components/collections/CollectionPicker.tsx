'use client'

import { useState, useEffect, useRef } from 'react'
import { Folder, FolderPlus, Check, Loader2, Plus } from 'lucide-react'
import { useCollections, type Collection } from '@/lib/collections-context'
import { cn } from '@/lib/utils'

interface CollectionPickerProps {
  bookmarkId: string
  onCreateNew?: () => void
  trigger?: React.ReactNode
  align?: 'left' | 'right'
}

export function CollectionPicker({ bookmarkId, onCreateNew, trigger, align = 'right' }: CollectionPickerProps) {
  const { collections, addToCollection, removeFromCollection, getBookmarkCollections } = useCollections()
  const [isOpen, setIsOpen] = useState(false)
  const [memberCollectionIds, setMemberCollectionIds] = useState<Set<string>>(new Set())
  const [loadingCollections, setLoadingCollections] = useState<Set<string>>(new Set())
  const [initialLoading, setInitialLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Fetch which collections this bookmark belongs to when opening
  useEffect(() => {
    if (isOpen && bookmarkId) {
      setInitialLoading(true)
      getBookmarkCollections(bookmarkId)
        .then((ids) => setMemberCollectionIds(new Set(ids)))
        .finally(() => setInitialLoading(false))
    }
  }, [isOpen, bookmarkId, getBookmarkCollections])

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

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

  const handleToggleCollection = async (collection: Collection) => {
    const isInCollection = memberCollectionIds.has(collection.id)
    setLoadingCollections((prev) => new Set(prev).add(collection.id))

    try {
      if (isInCollection) {
        const success = await removeFromCollection(collection.id, bookmarkId)
        if (success) {
          setMemberCollectionIds((prev) => {
            const next = new Set(prev)
            next.delete(collection.id)
            return next
          })
        }
      } else {
        const success = await addToCollection(collection.id, bookmarkId)
        if (success) {
          setMemberCollectionIds((prev) => new Set(prev).add(collection.id))
        }
      }
    } finally {
      setLoadingCollections((prev) => {
        const next = new Set(prev)
        next.delete(collection.id)
        return next
      })
    }
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      {trigger ? (
        <div onClick={() => setIsOpen(!isOpen)}>{trigger}</div>
      ) : (
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            'p-2 rounded-full transition-colors',
            isOpen
              ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
              : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400'
          )}
          title="Add to collection"
        >
          <Folder className="w-5 h-5" />
        </button>
      )}

      {/* Dropdown */}
      {isOpen && (
        <div
          className={cn(
            'absolute bottom-full mb-2 w-64 bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden z-50',
            align === 'right' ? 'right-0' : 'left-0'
          )}
        >
          <div className="p-2 border-b border-gray-100 dark:border-gray-800">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider px-2">
              Add to Collection
            </p>
          </div>

          <div className="max-h-64 overflow-y-auto p-1">
            {initialLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
              </div>
            ) : collections.length === 0 ? (
              <div className="text-center py-6 px-4">
                <FolderPlus className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No collections yet</p>
              </div>
            ) : (
              collections.map((collection) => {
                const isInCollection = memberCollectionIds.has(collection.id)
                const isLoading = loadingCollections.has(collection.id)

                return (
                  <button
                    key={collection.id}
                    onClick={() => handleToggleCollection(collection)}
                    disabled={isLoading}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors',
                      isInCollection
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
                      <p className="text-xs text-gray-500 truncate">
                        {collection.tweetCount} {collection.tweetCount === 1 ? 'tweet' : 'tweets'}
                      </p>
                    </div>
                    <div className="w-5 h-5 flex-shrink-0">
                      {isLoading ? (
                        <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
                      ) : isInCollection ? (
                        <Check className="w-5 h-5 text-blue-500" />
                      ) : null}
                    </div>
                  </button>
                )
              })
            )}
          </div>

          {/* Create new button */}
          <div className="p-2 border-t border-gray-100 dark:border-gray-800">
            <button
              onClick={() => {
                setIsOpen(false)
                onCreateNew?.()
              }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span className="text-sm font-medium">New Collection</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
