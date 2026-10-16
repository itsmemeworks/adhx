import type { FeedItem } from '@/components/feed/types'

export interface SearchDocument {
  key: string
  title: string
  text: string
  source: string
}

export const searchItemKey = (item: Pick<FeedItem, 'id' | 'platform'>) =>
  `${item.platform || 'twitter'}:${item.id}`

/** Overlapping passages keep a remembered detail from disappearing inside a long article. */
export function splitPassages(text: string, size = 1200, overlap = 160): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim()
  if (!normalized) return []
  const passages: string[] = []
  let start = 0
  while (start < normalized.length) {
    let end = Math.min(start + size, normalized.length)
    if (end < normalized.length) {
      const boundary = normalized.lastIndexOf(' ', end)
      if (boundary > start + size / 2) end = boundary
    }
    passages.push(normalized.slice(start, end).trim())
    if (end === normalized.length) break
    start = Math.max(start + 1, end - overlap)
  }
  return passages
}

export function buildSearchDocuments(items: FeedItem[]): SearchDocument[] {
  return items.flatMap((item) => {
    const title = (item.articlePreview?.title || 'none').slice(0, 180)
    const metadata = [
      item.author ? `Author: ${item.authorName || ''} @${item.author}` : '',
      item.tags.length ? `Tags: ${item.tags.join(' ')}` : '',
    ]
      .filter(Boolean)
      .join('\n')
    const sections: Array<[string, string | null | undefined]> = [
      ['Post', [item.text, metadata].filter(Boolean).join('\n\n')],
      ['Link preview', item.articlePreview?.description],
      ['Quoted post', item.quoteContext?.text],
      ['Quoted post', item.quotedTweet?.text],
      ['Reposted text', item.retweetContext?.text],
    ]
    const article = item.articleContent
    if (article && Array.isArray(article.blocks)) {
      sections.push(['Article', article.blocks.map((block) => block.text || '').join('\n\n')])
    }
    for (const link of item.links || []) {
      sections.push([
        'Link preview',
        [link.previewTitle, link.previewDescription].filter(Boolean).join('\n'),
      ])
    }
    for (const media of item.media || []) sections.push(['Image description', media.altText])
    const seen = new Set<string>()
    return sections.flatMap(([source, text]) =>
      splitPassages(text || '').flatMap((passage) => {
        if (seen.has(passage)) return []
        seen.add(passage)
        return [{ key: searchItemKey(item), title, text: passage, source }]
      }),
    )
  })
}

export const documentInput = (document: SearchDocument) =>
  `title: ${document.title} | text: ${document.text}`
export const queryInput = (query: string) => `task: search result | query: ${query.trim()}`
