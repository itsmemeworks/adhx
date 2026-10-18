import type { LinkNetwork } from '@/lib/platform/networks'
import { decodeEntities } from './fetch'
import { pageOpenGraph, startUrl } from './download'
import { isAudioOnly, YtdlpError, ytdlpInfo, type YtdlpInfo } from './ytdlp'

/**
 * What a link-network post is, read once at save time: who posted it, its
 * words, when, and whether it's a video, sound or pictures. yt-dlp answers for
 * anything with a video or sound; picture posts fall back to the page's
 * link-preview tags.
 */
export interface NetworkPostDescription {
  author: string
  authorName: string | null
  text: string
  createdAt: string | null
  /** `video` also covers sound-only posts (they play in the same player). */
  category: 'video' | 'photo' | 'text'
  videos: number
  photos: number
  durationMs: number | null
  audioOnly: boolean
}

const MAX_TEXT = 4000

function clean(value: unknown): string {
  return typeof value === 'string'
    ? decodeEntities(value.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ''))
        .replace(/\u00a0/g, ' ')
        .replace(/\r/g, '')
        .trim()
    : ''
}

/** A handle people recognise: numeric account ids fall back to the display name. */
function handleFrom(id: string, name: string, fallback: string): string {
  if (id && /[A-Za-z]/.test(id)) return id
  const fromName = name.replace(/[^A-Za-z0-9._-]+/g, '').slice(0, 40)
  return fromName || id || fallback
}

function joinText(title: string, description: string): string {
  if (!description || description === title) return title
  if (!title) return description
  if (description.startsWith(title)) return description
  return `${title}\n\n${description}`
}

function fromInfo(info: YtdlpInfo, fallbackAuthor: string): NetworkPostDescription {
  const entries = info.entries?.length ? info.entries : [info]
  const first = entries[0] ?? info
  const handle = handleFrom(
    clean(first.uploader_id ?? info.uploader_id).replace(/^@/, ''),
    clean(first.uploader ?? info.uploader ?? first.channel ?? info.channel),
    fallbackAuthor,
  )
  const timestamp = first.timestamp ?? info.timestamp
  const date = first.upload_date ?? info.upload_date
  const createdAt = timestamp
    ? new Date(timestamp * 1000).toISOString()
    : date && /^\d{8}$/.test(date)
      ? `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T00:00:00.000Z`
      : null
  const duration = first.duration ?? info.duration
  return {
    author: handle.slice(0, 100),
    authorName: clean(first.uploader ?? info.uploader ?? first.channel) || null,
    text: joinText(
      clean(info.title ?? first.title),
      clean(info.description ?? first.description),
    ).slice(0, MAX_TEXT),
    createdAt,
    category: 'video',
    videos: Math.max(1, entries.length),
    photos: 0,
    durationMs: duration ? Math.round(duration * 1000) : null,
    audioOnly: isAudioOnly(info),
  }
}

/**
 * Networks where every post is a video or a sound. When yt-dlp can't read one
 * right now, the page's preview picture is not the post: it stays a video and
 * the download tries again later. When yt-dlp says it's gone, it's gone.
 */
const MEDIA_ONLY: ReadonlySet<LinkNetwork> = new Set(['youtube', 'vimeo', 'twitch', 'soundcloud'])

/** Threads titles read "Name (@handle) on Threads". */
function nameFromTitle(title: string | undefined): string | null {
  const m = title?.match(/^(.*?) \(@[^)]+\) on /)
  return m ? m[1].trim() : null
}

export async function describeNetworkPost(
  platform: LinkNetwork,
  id: string,
  author: string | undefined,
): Promise<NetworkPostDescription | null> {
  const fallbackAuthor = author || platform
  const target = { platform, postId: id, author: fallbackAuthor, category: null }
  if (platform !== 'threads') {
    try {
      const info = await ytdlpInfo(await startUrl(target))
      const described = fromInfo(info, fallbackAuthor)
      // The v.redd.it playlist carries no words or author; Reddit's oEmbed does.
      if (platform === 'reddit') {
        const og = await redditOembed(id, author)
        if (og) {
          described.text = og.title || described.text
          described.authorName = og.author ? `u/${og.author}` : described.authorName
        }
        described.author = author || og?.subreddit || 'reddit'
      }
      return described
    } catch (error) {
      // No video or sound here (a picture post), or yt-dlp couldn't read it.
      if (MEDIA_ONLY.has(platform) && error instanceof YtdlpError && error.permanent) return null
    }
  }
  const og = await pageOpenGraph({ platform, postId: id, author: fallbackAuthor, category: null })
  if (!og) return null
  const text = joinText(platform === 'threads' ? '' : clean(og.title), clean(og.description)).slice(
    0,
    MAX_TEXT,
  )
  const mediaOnly = MEDIA_ONLY.has(platform)
  return {
    author: fallbackAuthor,
    authorName: nameFromTitle(og.title) ?? null,
    text,
    createdAt: null,
    category: mediaOnly ? 'video' : og.images.length ? 'photo' : 'text',
    videos: mediaOnly ? 1 : 0,
    photos: mediaOnly ? 0 : og.images.length,
    durationMs: null,
    audioOnly: platform === 'soundcloud',
  }
}

async function redditOembed(
  id: string,
  subreddit: string | undefined,
): Promise<{ title?: string; author?: string; subreddit?: string } | null> {
  try {
    const url = new URL('https://www.reddit.com/oembed')
    url.searchParams.set(
      'url',
      subreddit
        ? `https://www.reddit.com/r/${subreddit}/comments/${id}/`
        : `https://www.reddit.com/comments/${id}/`,
    )
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      headers: { 'User-Agent': 'ADHX/1.0 (self-hosted)' },
    })
    if (!response.ok) return null
    const data = (await response.json()) as { title?: string; author_name?: string; html?: string }
    const sub = data.html?.match(/reddit\.com\/r\/([A-Za-z0-9_]+)\//)?.[1]
    return { title: data.title, author: data.author_name, subreddit: sub }
  } catch {
    return null
  }
}
