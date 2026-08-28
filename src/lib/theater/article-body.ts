import { fetchWithTimeout } from '@/lib/utils/fetch-timeout'

/**
 * Shared fetch for an X Article's markdown body — the same
 * `/api/share/tweet/{author}/{id}` payload `StageArticle` renders.
 *
 * Module-level in-flight cache so the stage reader and Copy article
 * (mounted in both chromes) spend the JSON once. Failed fetches are
 * evicted so a later tap can retry.
 */

const FETCH_TIMEOUT_MS = 10_000

export interface ArticleDetails {
  title: string | null
  coverImageUrl: string | null
  content: string | null
}

const inflight = new Map<string, Promise<ArticleDetails | null>>()

export function articleSharePath(author: string, id: string): string {
  return `/api/share/tweet/${encodeURIComponent(author)}/${encodeURIComponent(id)}`
}

interface ShareTweetResponse {
  article?: {
    title?: string | null
    coverImageUrl?: string | null
    content?: string | null
  } | null
}

export function fetchArticleDetails(author: string, id: string): Promise<ArticleDetails | null> {
  const key = `${author}:${id}`
  const existing = inflight.get(key)
  if (existing) return existing

  const pending = fetchWithTimeout(articleSharePath(author, id), FETCH_TIMEOUT_MS)
    .then((res) => (res.ok ? (res.json() as Promise<ShareTweetResponse>) : null))
    .then((data) => {
      if (!data?.article) return null
      const { title, coverImageUrl, content } = data.article
      return {
        title: typeof title === 'string' && title.trim() ? title : null,
        coverImageUrl:
          typeof coverImageUrl === 'string' && coverImageUrl.trim() ? coverImageUrl : null,
        content: typeof content === 'string' && content.trim() ? content : null,
      }
    })
    .catch(() => null)
    .then((details) => {
      // Keep the old retry contract for body consumers: an upstream response
      // can transiently contain article metadata before its content is ready.
      // StageArticle may still paint that title/cover, but a later read/copy
      // must issue a fresh request instead of caching the incomplete payload.
      if (!details?.content) inflight.delete(key)
      return details
    })

  inflight.set(key, pending)
  return pending
}

export function fetchArticleMarkdown(author: string, id: string): Promise<string | null> {
  return fetchArticleDetails(author, id).then((details) => details?.content ?? null)
}

/** Title + body, without repeating the title when the markdown already opens with it. */
export function composeArticleCopy(title: string, markdown: string): string {
  const headline = title.trim()
  const body = markdown.trim()
  if (!headline) return body
  if (!body) return headline
  const firstLine = body
    .split('\n')[0]
    ?.replace(/^#+\s*/, '')
    .trim()
  if (firstLine === headline) return body
  return `${headline}\n\n${body}`
}

/** Test-only: drop the in-flight cache between cases. */
export function resetArticleMarkdownCache(): void {
  inflight.clear()
}
