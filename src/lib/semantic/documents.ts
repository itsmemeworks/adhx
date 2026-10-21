import crypto from 'crypto'
import type { FeedItemResponse } from '@/lib/feed/build-item'
import { SCREEN_MAX_IMAGES, VIDEO_SAMPLING, type JobKind } from './config'
import type { ExtractedWords } from './extracted'

/**
 * What the understanding pipeline reads for one post. Built from a feed item
 * so it sees exactly what the app shows. Tags are deliberately excluded: they
 * are private to one saver, and these vectors are shared by every saver.
 */
export interface PostDocument {
  platform: string
  postId: string
  /** EmbeddingGemma 2 document prompt: `title: … | text: …`. */
  text: string
  textHash: string
  /** The same words without prompt labels, for the keyword index. */
  keywords: string
  /**
   * The post says something beyond who posted it. Without this (empty, a bare
   * link, emoji only) its words are not understood: an author line alone
   * matched everything a little and buried real results.
   */
  hasWords: boolean
  /** One picture: the first photo, a video poster, or an article cover. */
  image: { url: string; hash: string } | null
  /** One playable video stream (a same-origin proxy path). */
  video: { url: string; hash: string } | null
  /**
   * Where text on screen is read from: the post's photos (at most
   * `SCREEN_MAX_IMAGES`; the poster or cover when it has none) and frames of
   * its video.
   */
  screen: {
    images: string[]
    video: string | null
    /** The video's length when known (not part of the hash). */
    videoSeconds: number | null
    hash: string
  } | null
  /** What is said in it comes from its video (or sound) stream. */
  speech: { url: string; hash: string } | null
}

/** Labels the model reads before words that came out of the media. */
export const SPEECH_LABEL = 'Said in the video: '
export const SCREEN_LABEL = 'Text on screen: '

/** Keep documents well inside the 8K-token context and fast to embed. */
const MAX_TEXT_CHARS = 8000

function sha(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 32)
}

function clean(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
}

function quoteText(context: unknown): string {
  if (!context || typeof context !== 'object') return ''
  const c = context as { text?: unknown; author?: unknown }
  const text = clean(c.text)
  return text ? `Quoting${c.author ? ` @${clean(c.author)}` : ''}: ${text}` : ''
}

function articleBody(content: unknown): string {
  if (!content || typeof content !== 'object') return ''
  const blocks = (content as { blocks?: Array<{ text?: unknown }> }).blocks
  if (!Array.isArray(blocks)) return ''
  return blocks
    .map((b) => clean(b?.text))
    .filter(Boolean)
    .join('\n')
}

/** The post's video as served by /api/files (kept copy, or the proxy until it's downloaded). */
function videoStreamPath(item: FeedItemResponse, mediaIndex: number): string | null {
  const url = item.media?.[mediaIndex]?.url
  return url?.startsWith('/api/files/') ? url : null
}

/**
 * `extracted` is what was read out of the post's media on this server
 * (`extracted.ts`). It comes after the post's own words, so a long transcript
 * is what gets cut, and only posts with extracted words change their text
 * hash.
 */
export function buildPostDocument(
  item: FeedItemResponse,
  extracted: Partial<ExtractedWords> = {},
): PostDocument {
  const platform = item.platform || 'twitter'
  const title = clean(item.articlePreview?.title) || 'none'
  const parts = [
    clean(item.text),
    item.authorName || item.author
      ? `Posted by ${clean(item.authorName)} @${clean(item.author)}`
      : '',
    clean(item.articlePreview?.description),
    articleBody(item.articleContent),
    quoteText(item.quoteContext),
    ...(item.links ?? []).map((l) =>
      [clean(l.previewTitle), clean(l.previewDescription)].filter(Boolean).join(' — '),
    ),
    ...(item.media ?? []).map((m) => (m.altText ? `Image description: ${clean(m.altText)}` : '')),
  ].filter(Boolean)
  const said = clean(extracted.speech)
  const shown = clean(extracted.screen)
  const heard = [said ? `${SPEECH_LABEL}${said}` : '', shown ? `${SCREEN_LABEL}${shown}` : '']
  const body = [...new Set([...parts, ...heard.filter(Boolean)])]
    .join('\n')
    .slice(0, MAX_TEXT_CHARS)
  const ownWords = [
    title === 'none' ? '' : title,
    ...parts.filter((p) => !p.startsWith('Posted by ')),
    said,
    shown,
  ]
    .join(' ')
    .replace(/https?:\/\/\S+/g, '')
  const hasWords = /[\p{L}\p{N}]/u.test(ownWords)
  const text = `title: ${title} | text: ${body || 'none'}`
  const keywords = [
    title === 'none' ? '' : title,
    body.replace(
      /^(Posted by |Image description: |Quoting |Said in the video: |Text on screen: )/gm,
      '',
    ),
  ]
    .filter(Boolean)
    .join('\n')

  const media = item.media ?? []
  const videoIndex = media.findIndex(
    (m) => m.mediaType === 'video' || m.mediaType === 'animated_gif',
  )
  const firstPhoto = media.find((m) => m.mediaType === 'photo')
  const posterSource = videoIndex >= 0 ? media[videoIndex] : firstPhoto
  const imageUrl = posterSource?.thumbnailUrl || item.articlePreview?.imageUrl || null

  const videoPath = videoIndex >= 0 ? videoStreamPath(item, videoIndex) : null

  const photos = media
    .filter((m) => m.mediaType === 'photo')
    .map((m) => m.url || m.thumbnailUrl)
    .filter((u): u is string => !!u)
    .slice(0, SCREEN_MAX_IMAGES)
  const screenImages = photos.length ? photos : !videoPath && imageUrl ? [imageUrl] : []
  const screen =
    screenImages.length || videoPath
      ? {
          images: screenImages,
          video: videoPath,
          videoSeconds:
            videoIndex >= 0 && media[videoIndex].durationMs
              ? media[videoIndex].durationMs! / 1000
              : null,
          hash: sha(`screen|${screenImages.join('|')}|${videoPath ?? ''}`),
        }
      : null

  return {
    platform,
    postId: item.id,
    text,
    textHash: sha(text),
    keywords,
    hasWords,
    image: imageUrl ? { url: imageUrl, hash: sha(imageUrl) } : null,
    video: videoPath ? { url: videoPath, hash: sha(`${videoPath}|${VIDEO_SAMPLING}`) } : null,
    screen,
    speech: videoPath ? { url: videoPath, hash: sha(`speech|${videoPath}`) } : null,
  }
}

/** The content hash for one kind, or null when the post has nothing of that kind. */
export function hashFor(doc: PostDocument, kind: JobKind): string | null {
  if (kind === 'text') return doc.hasWords ? doc.textHash : null
  if (kind === 'image') return doc.image?.hash ?? null
  if (kind === 'speech') return doc.speech?.hash ?? null
  if (kind === 'screen') return doc.screen?.hash ?? null
  return doc.video?.hash ?? null
}

/** EmbeddingGemma 2 query prompt for retrieval. */
export function queryPrompt(query: string): string {
  return `task: search result | query: ${query.trim()}`
}
