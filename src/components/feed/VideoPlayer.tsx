'use client'

import { useEffect, useRef, useState } from 'react'
import Hls from 'hls.js'
import { Loader2, AlertCircle, ExternalLink } from 'lucide-react'

interface VideoPlayerProps {
  author: string
  tweetId: string
  className?: string
  loop?: boolean
  autoPlay?: boolean
  tweetUrl?: string
}

interface VideoInfo {
  duration: number
  hlsUrl: string | null
  requiresHls: boolean
}

/**
 * Smart video player that automatically handles both short and long videos.
 *
 * For short videos (<5 min): Uses the video proxy API with MP4
 * For long videos (>5 min): Uses HLS streaming to avoid timeout issues
 *
 * HLS streaming breaks videos into small chunks, which avoids the Fly.io
 * proxy timeout that occurs when trying to stream large files.
 */
export function VideoPlayer({
  author,
  tweetId,
  className = '',
  loop = false,
  autoPlay = false,
  tweetUrl,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false) // Tracks if we've determined the playback strategy
  const [useHls, setUseHls] = useState(false)
  const [hlsUrl, setHlsUrl] = useState<string | null>(null)

  // First effect: Determine playback strategy (HLS vs MP4)
  useEffect(() => {
    let mounted = true

    async function initVideo() {
      try {
        // Fetch video info to determine playback strategy
        const response = await fetch(
          `/api/media/video/info?author=${author}&tweetId=${tweetId}`
        )

        if (!response.ok) {
          throw new Error('Failed to fetch video info')
        }

        const info: VideoInfo = await response.json()

        if (!mounted) return

        if (info.requiresHls && info.hlsUrl) {
          // Long video - use HLS streaming via our proxy
          // Direct access to video.twimg.com returns 403, so we proxy through our server
          const proxiedHlsUrl = `/api/media/video/hls?url=${encodeURIComponent(info.hlsUrl)}`
          setUseHls(true)
          setHlsUrl(proxiedHlsUrl)
        } else {
          // Short video - use regular proxy
          setUseHls(false)
          setLoading(false)
        }

        setReady(true)
      } catch (err) {
        if (mounted) {
          console.error('Video init error:', err)
          // Fallback to proxy API on error
          setUseHls(false)
          setLoading(false)
          setReady(true)
        }
      }
    }

    initVideo()

    return () => {
      mounted = false
    }
  }, [author, tweetId])

  // Second effect: Initialize HLS.js when needed
  useEffect(() => {
    if (!ready || !useHls || !hlsUrl || !videoRef.current) return

    const video = videoRef.current

    // Check if browser is Safari (not just HLS MIME type support)
    // Chrome on Mac returns "maybe" for canPlayType but can't actually play HLS natively
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
    const canPlayHlsNatively = isSafari && video.canPlayType('application/vnd.apple.mpegurl')

    if (canPlayHlsNatively) {
      // Safari can play HLS natively
      video.src = hlsUrl
      setLoading(false)
      return
    }

    // Use HLS.js for Chrome/Firefox
    if (Hls.isSupported()) {
      const hls = new Hls({
        // Optimize for streaming long videos
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        maxBufferSize: 60 * 1000 * 1000, // 60MB
        maxBufferHole: 0.5,
      })

      hlsRef.current = hls

      hls.loadSource(hlsUrl)
      hls.attachMedia(video)

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setLoading(false)
      })

      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          console.error('HLS fatal error:', data)
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              // Try to recover from network error
              hls.startLoad()
              break
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError()
              break
            default:
              setError('Failed to load video')
              hls.destroy()
              break
          }
        }
      })

      return () => {
        hls.destroy()
        hlsRef.current = null
      }
    } else {
      // HLS not supported and not Safari
      setError('Your browser does not support this video format')
      setLoading(false)
    }
  }, [ready, useHls, hlsUrl])

  // Show error state with fallback to X
  if (error) {
    return (
      <div className={`flex flex-col items-center justify-center gap-4 p-8 bg-gray-900 rounded-xl ${className}`}>
        <AlertCircle className="w-12 h-12 text-gray-400" />
        <p className="text-gray-400 text-center">{error}</p>
        {tweetUrl && (
          <a
            href={tweetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            Watch on X
          </a>
        )}
      </div>
    )
  }

  // Don't render video until we've determined the strategy
  // For HLS: src is set by the useEffect after HLS.js attaches
  // For MP4: src is set directly on the element
  const videoSrc = ready && !useHls
    ? `/api/media/video?author=${author}&tweetId=${tweetId}&quality=hd`
    : undefined

  return (
    <div className="relative">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900 rounded-xl z-10">
          <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
        </div>
      )}
      <video
        ref={videoRef}
        src={videoSrc}
        controls
        playsInline
        loop={loop}
        autoPlay={autoPlay}
        className={className}
        onLoadedData={() => setLoading(false)}
        onError={() => {
          if (!useHls) {
            setError('Failed to load video')
          }
        }}
      />
    </div>
  )
}
