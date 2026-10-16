import crypto from 'crypto'
import type { FeedItemResponse } from '@/lib/feed/build-item'
import { VIDEO_SAMPLING, type UnderstandingKind } from './config'

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
}

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

function videoStreamPath(item: FeedItemResponse, mediaIndex: number): string | null {
  const platform = item.platform || 'twitter'
  if (platform === 'youtube') return null // iframe-only: no compliant MP4 source
  if (platform === 'instagram' || platform === 'tiktok') {
    const media = item.media?.[mediaIndex]
    return media?.url?.startsWith('/api/media/') ? media.url : null
  }
  // X: the 360p preview stream is plenty for sparse frame sampling.
  const params = new URLSearchParams({ author: item.author, tweetId: item.id, quality: 'preview' })
  if (mediaIndex > 0) params.set('index', String(mediaIndex + 1))
  return `/api/media/video?${params}`
}

export function buildPostDocument(item: FeedItemResponse): PostDocument {
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
  const body = [...new Set(parts)].join('\n').slice(0, MAX_TEXT_CHARS)
  const ownWords = [
    title === 'none' ? '' : title,
    ...parts.filter((p) => !p.startsWith('Posted by ')),
  ]
    .join(' ')
    .replace(/https?:\/\/\S+/g, '')
  const hasWords = /[\p{L}\p{N}]/u.test(ownWords)
  const text = `title: ${title} | text: ${body || 'none'}`
  const keywords = [
    title === 'none' ? '' : title,
    body.replace(/^(Posted by |Image description: |Quoting )/gm, ''),
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

  return {
    platform,
    postId: item.id,
    text,
    textHash: sha(text),
    keywords,
    hasWords,
    image: imageUrl ? { url: imageUrl, hash: sha(imageUrl) } : null,
    video: videoPath ? { url: videoPath, hash: sha(`${videoPath}|${VIDEO_SAMPLING}`) } : null,
  }
}

/** The content hash for one kind, or null when the post has nothing of that kind. */
export function hashFor(doc: PostDocument, kind: UnderstandingKind): string | null {
  if (kind === 'text') return doc.hasWords ? doc.textHash : null
  if (kind === 'image') return doc.image?.hash ?? null
  return doc.video?.hash ?? null
}

/** EmbeddingGemma 2 query prompt for retrieval. */
export function queryPrompt(query: string): string {
  return `task: search result | query: ${query.trim()}`
}
