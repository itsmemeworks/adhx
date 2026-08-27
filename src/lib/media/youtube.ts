/**
 * YouTube Shorts metadata via YouTube's official oEmbed API.
 *
 * Unlike TikTok/Instagram, YouTube has no free MP4 mirror — and extracting a
 * raw stream means yt-dlp-style signature deciphering (fragile + against ToS).
 * So we use the *sanctioned* path: oEmbed for title/author/thumbnail and the
 * official iframe embed for playback. Zero-cost, durable, compliant.
 *
 *   oEmbed:    https://www.youtube.com/oembed?url=<watch url>&format=json
 *   thumbnail: https://i.ytimg.com/vi/{id}/hqdefault.jpg
 *   embed:     https://www.youtube-nocookie.com/embed/{id}  (privacy-enhanced)
 */

import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { fetchWithTimeout } from '@/lib/utils/fetch-timeout'

const ID_PATTERN = /^[A-Za-z0-9_-]{11}$/

export interface YouTubeMetadata {
  /** The 11-char video id. */
  videoId: string
  title?: string
  /** Channel display name (e.g. "BassForge"). */
  authorName?: string
  /** Channel handle incl. leading `@` when YouTube exposes one (e.g. "@BassForge_us"). */
  author?: string
  /** i.ytimg.com poster. */
  thumbnailUrl: string
}

export type YouTubeMetadataStatus =
  | { kind: 'resolved'; metadata: YouTubeMetadata }
  | { kind: 'permanent-miss' }
  | { kind: 'transient-failure' }

export function isValidVideoId(id: string): boolean {
  return ID_PATTERN.test(id)
}

/** Poster image for a video id (hqdefault is always present). */
export function youtubeThumbnail(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
}

/** Privacy-enhanced embed URL for the iframe player. */
export function youtubeEmbedUrl(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${videoId}`
}

/** Canonical Shorts URL for a video id. */
export function youtubeShortUrl(videoId: string): string {
  return `https://www.youtube.com/shorts/${videoId}`
}

/**
 * Extract the 11-char video id from a YouTube Shorts URL only:
 *   youtube.com/shorts/{id}   www./m. subdomains
 *   with or without protocol, trailing slash, ?si= tracking params.
 *
 * Watch, youtu.be, embed, live, and bare ids are rejected — those forms
 * cover regular (non-Short) videos.
 */
export function extractYouTubeId(input: string): string | null {
  if (!input) return null
  const trimmed = input.trim()

  let url: URL
  try {
    url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`)
  } catch {
    return null
  }

  const host = url.hostname.replace(/^www\.|^m\./, '')
  if (host !== 'youtube.com') return null

  const m = url.pathname.match(/^\/shorts\/([A-Za-z0-9_-]{11})(?:\/|$)/)
  return m && isValidVideoId(m[1]) ? m[1] : null
}

/** Parse `@handle` out of an oEmbed author_url (`.../@BassForge_us`). */
function handleFromAuthorUrl(authorUrl: string | undefined): string | undefined {
  if (!authorUrl) return undefined
  const m = authorUrl.match(/\/@([A-Za-z0-9._-]+)/)
  return m ? `@${m[1]}` : undefined
}

class TransientYouTubeMetadataError extends Error {
  constructor(cause?: unknown) {
    super('YouTube oEmbed metadata failed transiently', { cause })
    this.name = 'TransientYouTubeMetadataError'
  }
}

const fetchCachedYouTubeMetadata = unstable_cache(
  async (videoId: string): Promise<YouTubeMetadata | null> => {
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`
    const oembedOrigin = (
      process.env.YOUTUBE_OEMBED_BASE?.trim() || 'https://www.youtube.com'
    ).replace(/\/$/, '')
    const oembed = `${oembedOrigin}/oembed?url=${encodeURIComponent(watchUrl)}&format=json`

    try {
      const res = await fetchWithTimeout(oembed, 8_000, {
        headers: { Accept: 'application/json' },
        // The outer metadata cache owns cross-request caching so temporary
        // HTTP/network failures cannot become cached negative fetch responses.
        cache: 'no-store',
      })
      // For a syntactically valid 11-character id, oEmbed uses 400 when no
      // embeddable video exists; 404/410 are equally authoritative misses.
      if (res.status === 400 || res.status === 404 || res.status === 410) return null
      if (!res.ok) throw new TransientYouTubeMetadataError()
      const data = (await res.json()) as {
        title?: string
        author_name?: string
        author_url?: string
      }
      return {
        videoId,
        title: data.title,
        authorName: data.author_name,
        author: handleFromAuthorUrl(data.author_url),
        thumbnailUrl: youtubeThumbnail(videoId),
      }
    } catch (cause) {
      if (cause instanceof TransientYouTubeMetadataError) throw cause
      throw new TransientYouTubeMetadataError(cause)
    }
  },
  ['youtube-shorts-metadata'],
  { revalidate: 3600 },
)

/**
 * Resolve a Shorts video's metadata via oEmbed while preserving whether a
 * miss is confirmed permanent or merely transient.
 */
export async function fetchYouTubeMetadataStatus(videoId: string): Promise<YouTubeMetadataStatus> {
  if (!isValidVideoId(videoId)) return { kind: 'permanent-miss' }
  try {
    const metadata = await fetchCachedYouTubeMetadata(videoId)
    return metadata ? { kind: 'resolved', metadata } : { kind: 'permanent-miss' }
  } catch {
    return { kind: 'transient-failure' }
  }
}

/**
 * Request-scoped memoization shared by generateMetadata and the preview RSC.
 * Cross-request result caching remains owned by fetchCachedYouTubeMetadata.
 */
export const getYouTubeMetadataStatus = cache(fetchYouTubeMetadataStatus)

/** Preserve the public Metadata|null compatibility wrapper. */
export async function fetchYouTubeMetadata(videoId: string): Promise<YouTubeMetadata | null> {
  const result = await fetchYouTubeMetadataStatus(videoId)
  return result.kind === 'resolved' ? result.metadata : null
}
