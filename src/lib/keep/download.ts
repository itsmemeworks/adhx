import crypto from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import { createWriteStream } from 'fs'
import { fetchTweetData } from '@/lib/media/fxembed'
import { fetchFreshInstagramMetadata } from '@/lib/media/instafix'
import { resolveInstagramVideo } from '@/lib/media/instagram-video'
import { sourceUrl } from '@/lib/activity/preview-path'
import { keepH264, mediaDir } from './config'
import { downloadTo, imageExt, MEDIA_HOSTS, openGraph } from './fetch'
import { probeMedia, type Probed } from './probe'
import { execFile } from 'child_process'
import { ffmpegPath } from '@/lib/media/ffmpeg'
import { absolutePath, mimeFor, postDir, slotFor, type KeptKind, type NewKeptFile } from './store'
import { isAudioOnly, ytdlpDownload, ytdlpInfo, YtdlpError } from './ytdlp'

const MAX_IMAGE_BYTES = 80 * 1024 * 1024
const MAX_DIRECT_VIDEO_BYTES = 4 * 1024 * 1024 * 1024

/** A failure that won't fix itself by retrying (the post has no media, or is gone). */
export class NothingToKeep extends Error {}

export interface KeepTarget {
  platform: string
  postId: string
  author: string
  /** The saved post's type, when known (`video`, `photo`, `text`, `article`). */
  category?: string | null
  /** Told how far a yt-dlp download is, 0–100. */
  onProgress?: (percent: number) => void
}

interface Collected {
  kind: KeptKind
  file: string
  poster?: string | null
}

/**
 * Download a post's media into a scratch folder. Each network gets the most
 * direct route to its originals: X's own files through fxtwitter (the 4K
 * variant when there is one), Instagram and TikTok video through yt-dlp, and
 * yt-dlp for everything else, with the page's preview images for picture-only
 * posts.
 */
async function collect(target: KeepTarget, dir: string): Promise<Collected[]> {
  switch (target.platform) {
    case 'twitter':
      return collectTwitter(target, dir)
    case 'instagram':
      return collectInstagram(target, dir)
    default:
      return collectGeneric(target, dir)
  }
}

async function collectTwitter({ author, postId }: KeepTarget, dir: string): Promise<Collected[]> {
  const data = await fetchTweetData(author, postId, { timeoutMs: 20_000 })
  if (!data) throw new Error('X post could not be loaded')
  if (!data.tweet) throw new NothingToKeep('X post is gone')
  const all = data.tweet.media?.all ?? []
  const out: Collected[] = []
  let photos = 0
  let videos = 0
  for (const m of all) {
    if (m.type === 'photo') {
      photos++
      const url = new URL(m.url)
      url.searchParams.set('name', 'orig')
      const file = path.join(dir, `p${photos}.${imageExt(m.url)}`)
      await downloadTo(url.toString(), MEDIA_HOSTS.twitter, file, MAX_IMAGE_BYTES)
      out.push({ kind: 'photo', file })
    } else {
      videos++
      const file = path.join(dir, `v${videos}.mp4`)
      await downloadTo(m.url, MEDIA_HOSTS.twitter, file, MAX_DIRECT_VIDEO_BYTES)
      let poster: string | null = null
      if (m.thumbnail_url) {
        poster = path.join(dir, `t${videos}.jpg`)
        await downloadTo(m.thumbnail_url, MEDIA_HOSTS.twitter, poster, MAX_IMAGE_BYTES).catch(
          () => (poster = null),
        )
      }
      out.push({ kind: 'video', file, poster })
    }
  }
  return out
}

async function collectInstagram(target: KeepTarget, dir: string): Promise<Collected[]> {
  const meta = await fetchFreshInstagramMetadata(
    target.postId,
    target.category === 'photo' ? 'post' : 'reel',
  )
  const items = meta?.media ?? []
  const hasVideo = items.some((m) => m.type === 'video') || target.category === 'video'
  const out: Collected[] = []

  if (hasVideo) {
    try {
      const got = await ytdlpDownload(`https://www.instagram.com/p/${target.postId}/`, dir, {
        onProgress: target.onProgress,
      })
      for (const d of got) out.push({ kind: 'video', file: d.file, poster: d.poster })
    } catch (error) {
      // Instagram often wants a login from servers; the public CDN and mirrors still work.
      const result = await resolveInstagramVideo(target.postId)
      if (result.kind !== 'video') {
        if (!items.length) throw error
      } else {
        const file = path.join(dir, 'v1.mp4')
        await pipeline(
          Readable.fromWeb(result.response.body as import('stream/web').ReadableStream),
          createWriteStream(file),
        )
        out.push({ kind: 'video', file })
      }
    }
  }

  let photos = 0
  for (const m of items) {
    if (m.type !== 'photo' || !m.imageUrl) continue
    photos++
    const file = path.join(dir, `p${photos}.${imageExt(m.imageUrl)}`)
    await downloadTo(m.imageUrl, MEDIA_HOSTS.instagram, file, MAX_IMAGE_BYTES)
    out.push({ kind: 'photo', file })
  }
  if (!out.length && !meta) throw new Error('Instagram post could not be loaded')
  return out
}

/** The link yt-dlp and the page fetch start from. */
export async function startUrl(target: KeepTarget): Promise<string> {
  const url = sourceUrl(target.platform, target.author, target.postId, target.category)
  if (!url) throw new NothingToKeep('No link for this post')
  if (target.platform === 'vimeo') {
    // vimeo.com wants a login from yt-dlp now; the player page doesn't.
    return `https://player.vimeo.com/video/${target.postId}`
  }
  if (target.platform === 'reddit') {
    // Reddit wants a login for its JSON. vxreddit (the fixer link previews
    // use) names the v.redd.it playlist, which is public.
    const fixed = url.replace('https://www.reddit.com/', 'https://vxreddit.com/')
    const og = await openGraph(fixed, ['vxreddit.com']).catch(() => null)
    const video = og?.videos
      .map((v) => {
        try {
          return new URL(v).searchParams.get('video_url')
        } catch {
          return null
        }
      })
      .find(Boolean)
    const id = video?.match(/^https:\/\/v\.redd\.it\/([A-Za-z0-9]+)\//)?.[1]
    if (id) return `https://v.redd.it/${id}/HLSPlaylist.m3u8`
  }
  return url
}

async function collectGeneric(target: KeepTarget, dir: string): Promise<Collected[]> {
  const start = await startUrl(target)
  const out: Collected[] = []
  let ytError: unknown = null
  if (target.platform !== 'threads') {
    try {
      const info = await ytdlpInfo(start)
      const audio = isAudioOnly(info)
      const got = await ytdlpDownload(start, dir, { audio, onProgress: target.onProgress })
      for (const d of got)
        out.push({ kind: audio ? 'audio' : 'video', file: d.file, poster: d.poster })
      if (out.length) return out
    } catch (error) {
      ytError = error
    }
  }

  // Picture posts: the images the page shows link previews.
  const hosts = MEDIA_HOSTS[target.platform] ?? []
  const og = await pageOpenGraph(target)
  let photos = 0
  for (const image of og?.images ?? []) {
    if (!hosts.length) break
    photos++
    const file = path.join(dir, `p${photos}.${imageExt(image)}`)
    try {
      await downloadTo(image, hosts, file, MAX_IMAGE_BYTES)
      out.push({ kind: 'photo', file })
    } catch {
      photos--
    }
  }
  if (out.length) return out
  if (ytError instanceof YtdlpError && !ytError.permanent) throw ytError
  if (!og && ytError) throw ytError
  return out
}

/**
 * A post page's link-preview tags. Reddit refuses servers, so its preview
 * comes from vxreddit (the fixer chat apps use for Reddit links).
 */
export async function pageOpenGraph(
  target: KeepTarget,
): Promise<Awaited<ReturnType<typeof openGraph>> | null> {
  const page = sourceUrl(target.platform, target.author, target.postId, target.category)
  if (!page) return null
  const url =
    target.platform === 'reddit'
      ? page.replace('https://www.reddit.com/', 'https://vxreddit.com/')
      : page
  return openGraph(url, pageHosts(target.platform)).catch(() => null)
}

/** Hosts a post's own page lives on (for the link-preview fetch). */
export function pageHosts(platform: string): string[] {
  const hosts: Record<string, string[]> = {
    tiktok: ['www.tiktok.com', 'tiktok.com'],
    facebook: ['www.facebook.com', 'facebook.com', 'm.facebook.com'],
    threads: ['www.threads.com', 'www.threads.net', 'threads.com', 'threads.net'],
    linkedin: ['www.linkedin.com', 'linkedin.com'],
    pinterest: ['www.pinterest.com', 'pinterest.com', '.pinterest.com'],
    reddit: ['www.reddit.com', 'reddit.com', 'vxreddit.com'],
    imgur: ['imgur.com', 'i.imgur.com'],
    bluesky: ['bsky.app'],
    youtube: ['www.youtube.com', 'youtube.com'],
    vimeo: ['vimeo.com', 'player.vimeo.com'],
    soundcloud: ['soundcloud.com'],
    twitch: ['clips.twitch.tv', 'www.twitch.tv'],
  }
  return hosts[platform] ?? []
}

/**
 * Re-encode a video every browser can't play (VP9, AV1, HEVC) to H.264 at the
 * same size, visually lossless (CRF 20), keeping the sound as it is. Returns the
 * new file, or null when the video is already H.264.
 */
async function toH264(file: string, probed: Probed): Promise<string | null> {
  if (!probed.videoCodec || probed.videoCodec === 'h264') return null
  const out = file.replace(/\.[^.]+$/, '') + '.h264.mp4'
  const bin = await ffmpegPath()
  await new Promise<void>((resolve, reject) => {
    execFile(
      bin,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-nostdin',
        '-y',
        '-i',
        file,
        '-map',
        '0:v:0',
        '-map',
        '0:a?',
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '20',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        '-movflags',
        '+faststart',
        out,
      ],
      { timeout: 2 * 60 * 60_000, maxBuffer: 4 * 1024 * 1024 },
      (error, _o, stderr) =>
        error ? reject(new Error(`Re-encode failed: ${String(stderr).slice(0, 300)}`)) : resolve(),
    )
  })
  await fs.rm(file, { force: true })
  return out
}

/**
 * Keep one post: download everything, check each file, and move the set into
 * the post's folder. Returns what was kept (empty for a post with no media).
 */
export async function keepPost(target: KeepTarget): Promise<NewKeptFile[]> {
  const scratch = path.join(mediaDir(), '.tmp', `${target.platform}-${crypto.randomUUID()}`)
  await fs.mkdir(scratch, { recursive: true })
  try {
    const collected = await collect(target, scratch)
    const finalRel = postDir(target.platform, target.postId)
    const finalDir = absolutePath(finalRel)
    const kept: NewKeptFile[] = []
    const counts: Record<KeptKind, number> = { video: 0, photo: 0, audio: 0 }
    let posterSet = false
    const moves: Array<[string, string]> = []
    for (const c of collected) {
      let probed = await probeMedia(c.file)
      if (c.kind === 'video' && probed.hasVideo && keepH264()) {
        const converted = await toH264(c.file, probed)
        if (converted) {
          c.file = converted
          probed = await probeMedia(converted)
        }
      }
      const kind: KeptKind =
        c.kind === 'video' && !probed.hasVideo && probed.hasAudio ? 'audio' : c.kind
      counts[kind]++
      const slot = slotFor(kind, counts[kind])
      const name = `${slot}${path.extname(c.file).toLowerCase()}`
      moves.push([c.file, path.join(finalDir, name)])
      kept.push({
        slot,
        file: path.join(finalDir, name),
        mime: mimeFor(c.file),
        width: probed.width,
        height: probed.height,
        durationMs: kind === 'photo' ? null : probed.durationMs,
      })
      if (!posterSet && c.poster && kind !== 'photo') {
        const posterProbe = await probeMedia(c.poster)
        moves.push([c.poster, path.join(finalDir, 'poster.jpg')])
        kept.push({
          slot: 'poster',
          file: path.join(finalDir, 'poster.jpg'),
          mime: 'image/jpeg',
          width: posterProbe.width,
          height: posterProbe.height,
        })
        posterSet = true
      }
    }
    await fs.rm(finalDir, { recursive: true, force: true })
    if (moves.length) {
      await fs.mkdir(finalDir, { recursive: true })
      for (const [from, to] of moves) await fs.rename(from, to)
    }
    return kept
  } finally {
    await fs.rm(scratch, { recursive: true, force: true })
  }
}
