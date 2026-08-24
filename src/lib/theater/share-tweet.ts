import { fetchWithTimeout } from '@/lib/utils/fetch-timeout'
import { articleSharePath } from './article-body'

/**
 * Full `/api/share/tweet/{author}/{id}` payload for the stage reader —
 * parent media + the quoted tweet (text and media). Separate cache from
 * `fetchArticleMarkdown` so an article body miss doesn't block this.
 */

const FETCH_TIMEOUT_MS = 10_000

export interface ShareTweetMedia {
  photos?: Array<{ url?: string | null }>
  videos?: Array<{ thumbnailUrl?: string | null }>
}

export interface ShareTweetPayload {
  text?: string | null
  media?: ShareTweetMedia | null
  quoteTweet?: {
    id?: string
    text?: string | null
    author?: { name?: string; username?: string; avatarUrl?: string }
    media?: ShareTweetMedia | null
  } | null
}

const inflight = new Map<string, Promise<ShareTweetPayload | null>>()

export function fetchShareTweet(author: string, id: string): Promise<ShareTweetPayload | null> {
  const key = `${author}:${id}`
  const existing = inflight.get(key)
  if (existing) return existing

  const pending = fetchWithTimeout(articleSharePath(author, id), FETCH_TIMEOUT_MS)
    .then((res) => (res.ok ? (res.json() as Promise<ShareTweetPayload>) : null))
    .catch(() => null)
    .then((data) => {
      if (!data) inflight.delete(key)
      return data
    })

  inflight.set(key, pending)
  return pending
}

/** Test-only. */
export function resetShareTweetCache(): void {
  inflight.clear()
}
