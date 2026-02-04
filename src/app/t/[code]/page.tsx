'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Tag, ExternalLink, AlertCircle, Lock, Play } from 'lucide-react'
import Link from 'next/link'

interface SharedTweet {
  id: string
  author: string
  authorName: string | null
  authorProfileImageUrl: string | null
  text: string
  tweetUrl: string
  createdAt: string | null
  category: string | null
  media: Array<{
    id: string
    mediaType: string
    width: number | null
    height: number | null
    url: string
    thumbnailUrl: string
    shareUrl: string
  }>
}

interface SharedTagData {
  tag: string
  tweets: SharedTweet[]
  tweetCount: number
}

export default function SharedTagPage() {
  const params = useParams()
  const code = params.code as string

  const [data, setData] = useState<SharedTagData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cloning, setCloning] = useState(false)
  const [cloneError, setCloneError] = useState<string | null>(null)

  async function handleClone() {
    setCloning(true)
    setCloneError(null)

    try {
      const response = await fetch(`/api/share/tag/${code}/clone`, {
        method: 'POST',
      })

      if (response.status === 401) {
        // Not authenticated - redirect to auth with return URL
        const returnUrl = encodeURIComponent(window.location.pathname)
        window.location.href = `/api/auth/twitter?returnUrl=${returnUrl}`
        return
      }

      if (!response.ok) {
        const result = await response.json()
        setCloneError(result.error || 'Failed to add to collection. Please try again.')
        return
      }

      // Success - redirect to feed immediately
      window.location.href = '/'
    } catch {
      setCloneError('Failed to add to collection. Please try again.')
    } finally {
      setCloning(false)
    }
  }

  useEffect(() => {
    async function fetchTag() {
      try {
        const response = await fetch(`/api/share/tag/${code}`)
        if (!response.ok) {
          if (response.status === 404) {
            setError('Tag not found')
          } else if (response.status === 403) {
            setError('private')
          } else {
            setError('Failed to load tag')
          }
          return
        }
        const tagData = await response.json()
        setData(tagData)
      } catch {
        setError('Failed to load tag')
      } finally {
        setLoading(false)
      }
    }

    if (code) {
      fetchTag()
    }
  }, [code])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 dark:bg-gray-800 rounded w-1/4 mb-4" />
            <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-1/3 mb-8" />
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <div key={i} className="aspect-square bg-gray-200 dark:bg-gray-800 rounded-xl" />
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error === 'private') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="text-center max-w-md px-4">
          <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-4">
            <Lock className="w-8 h-8 text-gray-400" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Private Tag</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            This tag is not publicly shared.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-full font-medium hover:opacity-90 transition-opacity"
          >
            Go to ADHX
          </Link>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="text-center max-w-md px-4">
          <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Tag Not Found</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            This shared tag doesn&apos;t exist or has been removed.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-full font-medium hover:opacity-90 transition-opacity"
          >
            Go to ADHX
          </Link>
        </div>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-gray-950/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <Tag className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">#{data.tag}</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {data.tweetCount} bookmark{data.tweetCount !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
            <button
              onClick={handleClone}
              disabled={cloning}
              className="px-4 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-full font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {cloning ? 'Adding...' : 'Add to My Collection'}
            </button>
          </div>
          {cloneError && (
            <p className="text-red-500 text-sm mt-2 text-right">{cloneError}</p>
          )}
        </div>
      </header>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-4 py-6">
        {data.tweets.length === 0 ? (
          <div className="text-center py-16">
            <Tag className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400">No bookmarks with this tag yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {data.tweets.map((tweet) => (
              <TweetCard key={tweet.id} tweet={tweet} />
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 dark:border-gray-800 py-8 mt-8">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Shared via{' '}
            <Link href="/" className="text-blue-500 hover:underline">
              ADHX
            </Link>
            {' '}— Save now. Read never. Find always.
          </p>
        </div>
      </footer>
    </div>
  )
}

function TweetCard({ tweet }: { tweet: SharedTweet }) {
  const primaryMedia = tweet.media[0]
  const hasMedia = tweet.media.length > 0

  return (
    <a
      href={tweet.tweetUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group block bg-white dark:bg-gray-900 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow"
    >
      {/* Media */}
      {hasMedia ? (
        <div className="relative aspect-square bg-gray-100 dark:bg-gray-800">
          {primaryMedia.mediaType === 'video' || primaryMedia.mediaType === 'animated_gif' ? (
            <div className="relative w-full h-full">
              <img
                src={primaryMedia.thumbnailUrl}
                alt=""
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-12 h-12 rounded-full bg-black/60 flex items-center justify-center">
                  <Play className="h-6 w-6 text-white ml-1" fill="white" />
                </div>
              </div>
            </div>
          ) : (
            <img
              src={primaryMedia.url}
              alt=""
              className="w-full h-full object-cover"
            />
          )}
          {tweet.media.length > 1 && (
            <div className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded-full">
              +{tweet.media.length - 1}
            </div>
          )}
        </div>
      ) : (
        <div className="aspect-square bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900 p-4 flex items-center justify-center">
          <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-6 text-center">
            {tweet.text}
          </p>
        </div>
      )}

      {/* Info */}
      <div className="p-3">
        <div className="flex items-center gap-2 mb-2">
          {tweet.authorProfileImageUrl ? (
            <img
              src={tweet.authorProfileImageUrl}
              alt={tweet.author}
              className="w-6 h-6 rounded-full"
            />
          ) : (
            <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700" />
          )}
          <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
            @{tweet.author}
          </span>
          <ExternalLink className="w-3 h-3 text-gray-400 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
        {hasMedia && (
          <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
            {tweet.text}
          </p>
        )}
      </div>
    </a>
  )
}
