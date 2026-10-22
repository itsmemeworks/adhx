import fs from 'fs'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import { fetchWithAllowlistedRedirects, isTakenDown, limitResponseBody } from '@/lib/media/proxy'

/**
 * Media hosts each network serves files from. Direct downloads (and every
 * redirect they take) must stay on these hosts.
 */
export const MEDIA_HOSTS: Record<string, string[]> = {
  twitter: ['video.twimg.com', 'pbs.twimg.com', '.twimg.com'],
  instagram: ['.cdninstagram.com', '.fbcdn.net', 'rapidcdn.app', '.rapidcdn.app'],
  tiktok: [
    '.tiktokcdn.com',
    '.tiktokcdn-us.com',
    '.tiktokv.com',
    '.tnktok.com',
    '.byteoversea.com',
  ],
  facebook: ['.fbcdn.net'],
  threads: ['.fbcdn.net', '.cdninstagram.com'],
  linkedin: ['media.licdn.com', 'dms.licdn.com', '.licdn.com'],
  pinterest: ['i.pinimg.com', 'v1.pinimg.com', '.pinimg.com'],
  reddit: ['i.redd.it', 'preview.redd.it', 'external-preview.redd.it', 'v.redd.it'],
  imgur: ['i.imgur.com'],
  bluesky: ['cdn.bsky.app', 'video.bsky.app', 'video.cdn.bsky.app'],
  youtube: ['i.ytimg.com', '.ytimg.com'],
  vimeo: ['i.vimeocdn.com', '.vimeocdn.com'],
  soundcloud: ['i1.sndcdn.com', '.sndcdn.com'],
  twitch: ['.jtvnw.net', 'clips-media-assets2.twitch.tv'],
}

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'

/** The network took the file down after a copyright claim: it won't come back. */
export class TakenDown extends Error {
  constructor() {
    super('Taken down after a copyright claim')
  }
}

/** Download one file from an allowlisted host to `file`, capped at `maxBytes`. */
export async function downloadTo(
  url: string,
  hosts: string[],
  file: string,
  maxBytes: number,
): Promise<void> {
  const response = await fetchWithAllowlistedRedirects(url, {
    hosts,
    timeoutMs: 10 * 60_000,
    init: { headers: { 'User-Agent': BROWSER_UA } },
  })
  if (!response.ok) {
    if (await isTakenDown(response)) throw new TakenDown()
    await response.body?.cancel()
    throw Object.assign(new Error(`Download failed (${response.status})`), {
      status: response.status,
    })
  }
  const body = limitResponseBody(response, maxBytes)
  if (!body) throw new Error('Download had no body')
  await pipeline(
    Readable.fromWeb(body as import('stream/web').ReadableStream),
    fs.createWriteStream(file),
  )
}

const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

/** Decode named and numeric HTML entities in one pass (no double-decoding). */
export function decodeEntities(input: string): string {
  return input.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,6});/gi, (match, e: string) => {
    if (e[0] === '#') {
      const code =
        e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match
    }
    return NAMED[e.toLowerCase()] ?? match
  })
}

/** File extension for a downloaded image, from its URL. */
export function imageExt(url: string): string {
  try {
    const u = new URL(url)
    const format = u.searchParams.get('format')
    if (format && /^(jpg|jpeg|png|webp|gif|avif)$/i.test(format)) return format.toLowerCase()
    const ext = u.pathname.match(/\.(jpe?g|png|webp|gif|avif|heic)$/i)?.[1]
    return ext ? ext.toLowerCase().replace('jpeg', 'jpg') : 'jpg'
  } catch {
    return 'jpg'
  }
}

/**
 * The `og:image` / `og:video` tags of a public page, fetched the way link
 * previews are (a crawler user agent). Only ever called with a page URL ADHX
 * built itself from a recognised post link.
 */
export async function openGraph(
  pageUrl: string,
  pageHosts: string[],
): Promise<{ images: string[]; videos: string[]; title?: string; description?: string }> {
  const response = await fetchWithAllowlistedRedirects(pageUrl, {
    hosts: pageHosts,
    timeoutMs: 20_000,
    init: { headers: { 'User-Agent': 'facebookexternalhit/1.1', Accept: 'text/html' } },
  })
  if (!response.ok) {
    await response.body?.cancel()
    throw Object.assign(new Error(`Page returned ${response.status}`), { status: response.status })
  }
  const html = (await response.text()).slice(0, 2_000_000)
  const metas = [
    ...html.matchAll(/<meta\s+[^>]*?(?:property|name)="([^"]+)"[^>]*?content="([^"]*)"/gi),
  ]
  const decode = decodeEntities
  const pick = (name: string) =>
    [...new Set(metas.filter((m) => m[1] === name).map((m) => decode(m[2])))].filter(Boolean)
  return {
    images: pick('og:image'),
    videos: [...pick('og:video:secure_url'), ...pick('og:video')],
    title: pick('og:title')[0],
    description: pick('og:description')[0],
  }
}
