'use client'

import { useState, useEffect } from 'react'
import { ArrowRight, Bookmark, Loader2 } from 'lucide-react'
import { ADHX_PURPLE } from '@/lib/gestalt/theme'
import { XIcon } from '@/components/icons'

interface QuickAddLandingProps {
  username: string
  tweetId: string
}

interface TweetPreview {
  text: string
  author: {
    name: string
    screen_name: string
    avatar_url: string
  }
  media?: {
    photos?: Array<{ url: string }>
  }
}

export function QuickAddLanding({ username, tweetId }: QuickAddLandingProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [preview, setPreview] = useState<TweetPreview | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(true)

  // Fetch tweet preview
  useEffect(() => {
    async function fetchPreview() {
      try {
        const response = await fetch(`https://api.fxtwitter.com/${username}/status/${tweetId}`)
        if (response.ok) {
          const data = await response.json()
          if (data.tweet) {
            setPreview(data.tweet)
          }
        }
      } catch (error) {
        console.error('Failed to fetch tweet preview:', error)
      } finally {
        setLoadingPreview(false)
      }
    }
    fetchPreview()
  }, [username, tweetId])

  const handleLogin = () => {
    setIsLoading(true)
    // Pass the current URL as returnUrl param - OAuth flow will redirect back here
    const returnUrl = encodeURIComponent(window.location.pathname)
    window.location.href = `/api/auth/twitter?returnUrl=${returnUrl}`
  }

  return (
    <div className="min-h-screen bg-paper flex flex-col">
      {/* Header */}
      <header className="p-4">
        <a href="/" className="flex items-center gap-2 w-fit">
          <img src="/logo.png" alt="ADHX Logo" className="w-8 h-8 object-contain" />
          <span className="text-2xl font-indie-flower text-ink">ADHX</span>
        </a>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
              style={{ backgroundColor: `${ADHX_PURPLE}15` }}
            >
              <Bookmark className="w-8 h-8" style={{ color: ADHX_PURPLE }} />
            </div>

            <h1 className="text-2xl font-bold text-ink mb-2">Save this tweet?</h1>
            <p className="text-ink-3">Connect with X to add it to your collection.</p>
          </div>

          {/* Tweet Preview */}
          <div className="bg-surface rounded-2xl border border-hairline p-4 mb-6">
            {loadingPreview ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-ink-3" />
              </div>
            ) : preview ? (
              <div>
                <div className="flex items-center gap-3 mb-3">
                  {preview.author?.avatar_url && (
                    <img
                      src={preview.author.avatar_url}
                      alt={preview.author.name}
                      className="w-10 h-10 rounded-full"
                    />
                  )}
                  <div>
                    <p className="font-semibold text-ink">{preview.author?.name || username}</p>
                    <p className="text-sm text-ink-3">@{preview.author?.screen_name || username}</p>
                  </div>
                </div>
                <p className="text-ink-2 text-sm line-clamp-4">{preview.text}</p>
                {preview.media?.photos?.[0] && (
                  <div className="mt-3 rounded-xl overflow-hidden">
                    <img
                      src={preview.media.photos[0].url}
                      alt="Tweet media"
                      className="w-full h-40 object-cover"
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-4 text-ink-3">
                <p className="font-medium">@{username}</p>
                <p className="text-sm">Tweet ID: {tweetId}</p>
              </div>
            )}
          </div>

          {/* CTA Button */}
          <button
            onClick={handleLogin}
            disabled={isLoading}
            className="w-full inline-flex items-center justify-center gap-3 px-6 py-4 text-lg font-semibold text-white rounded-full transition-all hover:scale-[1.02] hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: ADHX_PURPLE }}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                <XIcon className="w-5 h-5" />
                Connect with X to save
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>

          <p className="text-center text-sm text-ink-3 mt-4">
            You&apos;ll be redirected back here after connecting.
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer className="p-4 text-center text-sm text-ink-3">
        <a href="/" className="hover:text-ink-2">
          Learn more about ADHX
        </a>
      </footer>
    </div>
  )
}
