'use client'

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'

export interface Collection {
  id: string
  name: string
  description: string | null
  color: string | null
  icon: string | null
  shareCode: string | null
  isPublic: boolean
  createdAt: string | null
  updatedAt: string | null
  tweetCount: number
}

interface CollectionsContextType {
  collections: Collection[]
  loading: boolean
  error: string | null
  refreshCollections: () => Promise<void>
  createCollection: (data: { name: string; description?: string; color?: string; icon?: string; isPublic?: boolean }) => Promise<Collection | null>
  updateCollection: (id: string, data: Partial<Collection>) => Promise<Collection | null>
  deleteCollection: (id: string) => Promise<boolean>
  addToCollection: (collectionId: string, bookmarkId: string, notes?: string) => Promise<boolean>
  removeFromCollection: (collectionId: string, bookmarkId: string) => Promise<boolean>
  getBookmarkCollections: (bookmarkId: string) => Promise<string[]>
}

const CollectionsContext = createContext<CollectionsContextType | undefined>(undefined)

export function CollectionsProvider({ children }: { children: ReactNode }) {
  const [collections, setCollections] = useState<Collection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refreshCollections = useCallback(async () => {
    try {
      setError(null)
      const response = await fetch('/api/collections')
      if (!response.ok) {
        if (response.status === 401) {
          // Not authenticated, just return empty
          setCollections([])
          return
        }
        throw new Error('Failed to fetch collections')
      }
      const data = await response.json()
      setCollections(data.collections || [])
    } catch (err) {
      console.error('Failed to fetch collections:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch collections')
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch collections on mount
  useEffect(() => {
    refreshCollections()
  }, [refreshCollections])

  const createCollection = useCallback(async (data: {
    name: string
    description?: string
    color?: string
    icon?: string
    isPublic?: boolean
  }): Promise<Collection | null> => {
    try {
      const response = await fetch('/api/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!response.ok) throw new Error('Failed to create collection')
      const result = await response.json()
      const newCollection = result.collection
      setCollections((prev) => [newCollection, ...prev])
      return newCollection
    } catch (err) {
      console.error('Failed to create collection:', err)
      return null
    }
  }, [])

  const updateCollection = useCallback(async (id: string, data: Partial<Collection>): Promise<Collection | null> => {
    try {
      const response = await fetch(`/api/collections/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!response.ok) throw new Error('Failed to update collection')
      const result = await response.json()
      const updated = result.collection
      setCollections((prev) => prev.map((c) => (c.id === id ? { ...c, ...updated } : c)))
      return updated
    } catch (err) {
      console.error('Failed to update collection:', err)
      return null
    }
  }, [])

  const deleteCollection = useCallback(async (id: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/collections/${id}`, {
        method: 'DELETE',
      })
      if (!response.ok) throw new Error('Failed to delete collection')
      setCollections((prev) => prev.filter((c) => c.id !== id))
      return true
    } catch (err) {
      console.error('Failed to delete collection:', err)
      return false
    }
  }, [])

  const addToCollection = useCallback(async (collectionId: string, bookmarkId: string, notes?: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/collections/${collectionId}/tweets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookmarkId, notes }),
      })
      if (!response.ok) throw new Error('Failed to add to collection')
      // Update local count
      setCollections((prev) =>
        prev.map((c) => (c.id === collectionId ? { ...c, tweetCount: c.tweetCount + 1 } : c))
      )
      return true
    } catch (err) {
      console.error('Failed to add to collection:', err)
      return false
    }
  }, [])

  const removeFromCollection = useCallback(async (collectionId: string, bookmarkId: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/collections/${collectionId}/tweets`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookmarkId }),
      })
      if (!response.ok) throw new Error('Failed to remove from collection')
      // Update local count
      setCollections((prev) =>
        prev.map((c) => (c.id === collectionId ? { ...c, tweetCount: Math.max(0, c.tweetCount - 1) } : c))
      )
      return true
    } catch (err) {
      console.error('Failed to remove from collection:', err)
      return false
    }
  }, [])

  const getBookmarkCollections = useCallback(async (bookmarkId: string): Promise<string[]> => {
    try {
      const response = await fetch(`/api/collections/${bookmarkId}/tweets?mode=bookmark`)
      if (!response.ok) throw new Error('Failed to get bookmark collections')
      const data = await response.json()
      return data.collectionIds || []
    } catch (err) {
      console.error('Failed to get bookmark collections:', err)
      return []
    }
  }, [])

  return (
    <CollectionsContext.Provider
      value={{
        collections,
        loading,
        error,
        refreshCollections,
        createCollection,
        updateCollection,
        deleteCollection,
        addToCollection,
        removeFromCollection,
        getBookmarkCollections,
      }}
    >
      {children}
    </CollectionsContext.Provider>
  )
}

export function useCollections() {
  const context = useContext(CollectionsContext)
  if (context === undefined) {
    throw new Error('useCollections must be used within a CollectionsProvider')
  }
  return context
}
