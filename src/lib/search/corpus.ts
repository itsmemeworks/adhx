import type { FeedItem } from '@/components/feed/types'

/** Read every page, independently of the keyword shortlist, and reject mixed-account responses. */
export async function loadSearchCorpus(
  accountId: string,
  signal: AbortSignal,
): Promise<FeedItem[]> {
  const items = new Map<string, FeedItem>()
  let page = 1
  let totalPages = 1
  let expectedTotal: number | undefined
  do {
    const response = await fetch(`/api/feed?limit=100&page=${page}&hideArchived=false`, {
      signal,
      cache: 'no-store',
    })
    if (!response.ok) throw new Error('Your saved content could not be loaded. Please retry.')
    const data = await response.json()
    if (data.accountId !== accountId)
      throw new Error('Your account changed. Reload the library to search.')
    if (!Array.isArray(data.items) || !Number.isSafeInteger(data.pagination?.totalPages)) {
      throw new Error('Your saved content could not be loaded completely. Please retry.')
    }
    if (Number.isSafeInteger(data.pagination.total)) {
      if (expectedTotal !== undefined && expectedTotal !== data.pagination.total) {
        throw new Error('Your collection changed while loading. Please retry.')
      }
      expectedTotal = data.pagination.total
    }
    for (const item of data.items as FeedItem[])
      items.set(`${item.platform || 'twitter'}:${item.id}`, item)
    totalPages = data.pagination.totalPages
    page++
  } while (page <= totalPages)
  if (expectedTotal !== undefined && items.size !== expectedTotal)
    throw new Error('Your collection changed while loading. Please retry.')
  return [...items.values()]
}
