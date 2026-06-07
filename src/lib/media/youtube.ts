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
 * Extract the 11-char video id from any YouTube URL form:
 *   youtube.com/shorts/{id}   youtu.be/{id}   youtube.com/watch?v={id}
 *   youtube.com/embed/{id}    m.youtube.com/...   (with or without protocol,
 *   trailing query like ?si=…, www./m. subdomains)
 */
export function extractYouTubeId(input: string): string | null {
  if (!input) return null
  const trimmed = input.trim()

  // Bare id (already extracted).
  if (ID_PATTERN.test(trimmed)) return trimmed

  let url: URL
  try {
    url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`)
  } catch {
    return null
  }

  const host = url.hostname.replace(/^www\.|^m\./, '')
  if (host === 'youtu.be') {
    const id = url.pathname.slice(1).split('/')[0]
    return isValidVideoId(id) ? id : null
  }
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    // /watch?v=ID
    const v = url.searchParams.get('v')
    if (v && isValidVideoId(v)) return v
    // /shorts/ID  /embed/ID  /v/ID  /live/ID
    const m = url.pathname.match(/\/(?:shorts|embed|v|live)\/([A-Za-z0-9_-]{11})/)
    if (m) return m[1]
  }
  return null
}

/** Parse `@handle` out of an oEmbed author_url (`.../@BassForge_us`). */
function handleFromAuthorUrl(authorUrl: string | undefined): string | undefined {
  if (!authorUrl) return undefined
  const m = authorUrl.match(/\/@([A-Za-z0-9._-]+)/)
  return m ? `@${m[1]}` : undefined
}

/**
 * Resolve a Shorts video's metadata via oEmbed. Returns null when the video is
 * private/removed or the API is unreachable. Always queries the `watch` form
 * (a Short's id is a normal video id) for a stable hqdefault thumbnail.
 */
export async function fetchYouTubeMetadata(videoId: string): Promise<YouTubeMetadata | null> {
  if (!isValidVideoId(videoId)) return null

  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`
  const oembed = `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`

  try {
    const res = await fetch(oembed, {
      signal: AbortSignal.timeout(8_000),
      headers: { Accept: 'application/json' },
      // Next Data Cache: dedupe repeat crawler hits to the same Short for an
      // hour. Independent of full-route caching, so it works on the dynamic
      // (cookie-reading) preview route. The AbortSignal timeout is unaffected.
      next: { revalidate: 3600 },
    })
    if (!res.ok) return null
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
  } catch {
    return null
  }
}
