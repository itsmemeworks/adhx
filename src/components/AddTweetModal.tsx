'use client'

import { useState, useEffect, useRef } from 'react'
import { X, Link2, Loader2, CheckCircle, AlertCircle, Copy, ExternalLink } from 'lucide-react'

type AddState = 'idle' | 'loading' | 'success' | 'duplicate' | 'error'

export interface AddTweetResult {
  state: 'success' | 'duplicate' | 'error'
  bookmark?: { id: string; author: string; text: string }
  error?: string
}

interface AddTweetModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
  onOpenTweet?: (tweetId: string) => void
  initialResult?: AddTweetResult | null
}

export function AddTweetModal({ isOpen, onClose, onSuccess, onOpenTweet, initialResult }: AddTweetModalProps) {
  const [url, setUrl] = useState('')
  const [state, setState] = useState<AddState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [addedBookmark, setAddedBookmark] = useState<{ id: string; author: string; text: string } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus input when modal opens (only if starting in idle state)
  useEffect(() => {
    if (isOpen && inputRef.current && !initialResult) {
      inputRef.current.focus()
    }
  }, [isOpen, initialResult])

  // Initialize from initialResult when modal opens with one
  useEffect(() => {
    if (isOpen && initialResult) {
      setState(initialResult.state)
      setAddedBookmark(initialResult.bookmark || null)
      setError(initialResult.error || null)
    }
  }, [isOpen, initialResult])

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setUrl('')
      setState('idle')
      setError(null)
      setAddedBookmark(null)
    }
  }, [isOpen])

  // Handle paste event for auto-submit
  const handlePaste = async (e: React.ClipboardEvent) => {
    const pastedText = e.clipboardData.getData('text')
    // Check if it looks like a tweet URL
    if (pastedText.match(/(?:twitter|x|vxtwitter|fxtwitter)\.com\/\w+\/status\/\d+/i)) {
      e.preventDefault()
      setUrl(pastedText)
      // Auto-submit after a brief delay to show the URL
      setTimeout(() => handleSubmit(pastedText), 100)
    }
  }

  const handleSubmit = async (urlToSubmit?: string) => {
    const submitUrl = urlToSubmit || url
    if (!submitUrl.trim()) return

    setState('loading')
    setError(null)

    try {
      const response = await fetch('/api/tweets/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: submitUrl }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to add tweet')
      }

      if (data.isDuplicate) {
        setState('duplicate')
        setAddedBookmark({
          id: data.bookmark.id,
          author: data.bookmark.author,
          text: data.bookmark.text,
        })
      } else {
        setState('success')
        setAddedBookmark({
          id: data.bookmark.id,
          author: data.bookmark.author,
          text: data.bookmark.text,
        })
        onSuccess?.()
      }
    } catch (err) {
      setState('error')
      setError(err instanceof Error ? err.message : 'Failed to add tweet')
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      {/* Backdrop - click to close */}
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />
      <div className="relative bg-card rounded-lg border shadow-lg w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Link2 className="w-5 h-5" />
            Add Tweet
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-secondary rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {state === 'idle' || state === 'loading' ? (
            <>
              <p className="text-sm text-muted-foreground mb-4">
                Paste a tweet URL to add it to your bookmarks. Works with twitter.com and x.com links.
              </p>

              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onPaste={handlePaste}
                  onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                  placeholder="https://x.com/user/status/123..."
                  className="flex-1 px-3 py-2 bg-secondary rounded-md border border-input focus:outline-none focus:ring-2 focus:ring-primary text-base sm:text-sm"
                  disabled={state === 'loading'}
                />
                <button
                  onClick={() => handleSubmit()}
                  disabled={state === 'loading' || !url.trim()}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {state === 'loading' ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Adding...
                    </>
                  ) : (
                    'Add'
                  )}
                </button>
              </div>

              <div className="mt-4 text-xs text-muted-foreground">
                <p className="font-medium mb-1">Supported URL formats:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>twitter.com/user/status/123</li>
                  <li>x.com/user/status/123</li>
                  <li>vxtwitter.com/user/status/123</li>
                  <li>fxtwitter.com/user/status/123</li>
                </ul>
              </div>
            </>
          ) : state === 'success' ? (
            <div className="text-center py-4">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
              <p className="font-medium text-lg mb-2">Tweet Added!</p>
              {addedBookmark && (
                <div className="bg-secondary/50 rounded-lg p-3 text-left mt-4">
                  <p className="text-sm font-medium">@{addedBookmark.author}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                    {addedBookmark.text}
                  </p>
                </div>
              )}
            </div>
          ) : state === 'duplicate' ? (
            <div className="text-center py-4">
              <Copy className="w-12 h-12 text-yellow-500 mx-auto mb-3" />
              <p className="font-medium text-lg mb-2">Already Bookmarked</p>
              <p className="text-sm text-muted-foreground">
                This tweet is already in your collection.
              </p>
              {addedBookmark && (
                <div className="bg-secondary/50 rounded-lg p-3 text-left mt-4">
                  <p className="text-sm font-medium">@{addedBookmark.author}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                    {addedBookmark.text}
                  </p>
                </div>
              )}
              {addedBookmark && onOpenTweet && (
                <button
                  onClick={() => {
                    onOpenTweet(addedBookmark.id)
                    onClose()
                  }}
                  className="mt-4 w-full px-4 py-2.5 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
                >
                  <ExternalLink className="w-4 h-4" />
                  View in Collection
                </button>
              )}
            </div>
          ) : state === 'error' ? (
            <div className="text-center py-4">
              <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
              <p className="font-medium text-lg mb-2">Failed to Add Tweet</p>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-muted/30">
          {state === 'success' || state === 'duplicate' || state === 'error' ? (
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 transition-colors"
              >
                Close
              </button>
              {(state === 'duplicate' || state === 'error') && (
                <button
                  onClick={() => {
                    setState('idle')
                    setUrl('')
                    setError(null)
                    setAddedBookmark(null)
                  }}
                  className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
                >
                  Add Another
                </button>
              )}
              {state === 'success' && (
                <button
                  onClick={() => {
                    setState('idle')
                    setUrl('')
                    setAddedBookmark(null)
                  }}
                  className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
                >
                  Add Another
                </button>
              )}
            </div>
          ) : (
            <p className="text-center text-sm text-muted-foreground">
              Tip: Paste a tweet URL and it will be added automatically!
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
