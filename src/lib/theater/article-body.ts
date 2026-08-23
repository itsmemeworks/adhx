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

const inflight = new Map<string, Promise<string | null>>()

export function articleSharePath(author: string, id: string): string {
  return `/api/share/tweet/${encodeURIComponent(author)}/${encodeURIComponent(id)}`
}

interface ShareTweetResponse {
  article?: {
    content?: string | null
  } | null
}

export function fetchArticleMarkdown(author: string, id: string): Promise<string | null> {
  const key = `${author}:${id}`
  const existing = inflight.get(key)
  if (existing) return existing

  const pending = fetchWithTimeout(articleSharePath(author, id), FETCH_TIMEOUT_MS)
    .then((res) => (res.ok ? (res.json() as Promise<ShareTweetResponse>) : null))
    .then((data) => {
      const markdown = data?.article?.content
      return typeof markdown === 'string' && markdown.trim() ? markdown : null
    })
    .catch(() => null)
    .then((markdown) => {
      if (!markdown) inflight.delete(key)
      return markdown
    })

  inflight.set(key, pending)
  return pending
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
