'use client'

import { useState, useEffect, useRef } from 'react'
import { X, Folder, Globe, Lock } from 'lucide-react'
import { useCollections, type Collection } from '@/lib/collections-context'
import { cn } from '@/lib/utils'

// Preset colors for collections
const PRESET_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#6b7280', // gray
]

interface CollectionModalProps {
  isOpen: boolean
  onClose: () => void
  collection?: Collection | null // If provided, edit mode
  onSuccess?: (collection: Collection) => void
}

export function CollectionModal({ isOpen, onClose, collection, onSuccess }: CollectionModalProps) {
  const { createCollection, updateCollection } = useCollections()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState(PRESET_COLORS[5]) // default blue
  const [isPublic, setIsPublic] = useState(false)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const isEditing = !!collection

  // Populate form when editing
  useEffect(() => {
    if (collection) {
      setName(collection.name)
      setDescription(collection.description || '')
      setColor(collection.color || PRESET_COLORS[5])
      setIsPublic(collection.isPublic)
    } else {
      setName('')
      setDescription('')
      setColor(PRESET_COLORS[5])
      setIsPublic(false)
    }
  }, [collection])

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  // Handle escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    setSaving(true)
    try {
      let result: Collection | null = null
      if (isEditing && collection) {
        result = await updateCollection(collection.id, {
          name: name.trim(),
          description: description.trim() || null,
          color,
          isPublic,
        })
      } else {
        result = await createCollection({
          name: name.trim(),
          description: description.trim() || undefined,
          color,
          isPublic,
        })
      }
      if (result) {
        onSuccess?.(result)
        onClose()
      }
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-md mx-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <Folder className="w-5 h-5 text-gray-500" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {isEditing ? 'Edit Collection' : 'New Collection'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Name
            </label>
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Collection"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Description <span className="text-gray-400">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's this collection about?"
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* Color picker */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Color
            </label>
            <div className="flex gap-2 flex-wrap">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={cn(
                    'w-8 h-8 rounded-full transition-transform hover:scale-110',
                    color === c && 'ring-2 ring-offset-2 ring-gray-900 dark:ring-white dark:ring-offset-gray-900'
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {/* Public toggle */}
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2">
              {isPublic ? (
                <Globe className="w-4 h-4 text-green-500" />
              ) : (
                <Lock className="w-4 h-4 text-gray-400" />
              )}
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {isPublic ? 'Public' : 'Private'}
                </p>
                <p className="text-xs text-gray-500">
                  {isPublic ? 'Anyone with the link can view' : 'Only you can see this collection'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsPublic(!isPublic)}
              className={cn(
                'relative w-11 h-6 rounded-full transition-colors',
                isPublic ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform',
                  isPublic && 'translate-x-5'
                )}
              />
            </button>
          </div>

          {/* Share link preview */}
          {isPublic && collection?.shareCode && (
            <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3">
              <p className="text-xs text-green-700 dark:text-green-300 mb-1">Share link:</p>
              <code className="text-xs text-green-800 dark:text-green-200 break-all">
                {typeof window !== 'undefined' ? window.location.origin : ''}/share/{collection.shareCode}
              </code>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || saving}
              className="flex-1 px-4 py-2 rounded-lg bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
