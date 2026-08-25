import type { FeedItem } from '@/components/feed/types'
import type { TheaterItem } from './types'
import { theaterItemKey } from './types'

const LOOKUP_LIMIT = 50

/**
 * Bulk `/api/feed?id=&idPlatform=` lookup. Marks keys checked before the
 * request so a re-render cannot double-fetch; un-marks on failure so a
 * missed save can retry.
 */
export function fetchBookmarkMembership(
  items: TheaterItem[],
  checked: Set<string>,
  onOwned: (owned: FeedItem[]) => void,
): void {
  const unknown = items
    .filter((it) => it.bookmarkId && !checked.has(theaterItemKey(it)))
    .slice(0, LOOKUP_LIMIT)
  if (unknown.length === 0) return
  unknown.forEach((it) => checked.add(theaterItemKey(it)))
  const params = new URLSearchParams({
    hideArchived: 'false',
    filter: 'all',
    limit: String(LOOKUP_LIMIT),
  })
  unknown.forEach((it) => {
    params.append('id', it.bookmarkId as string)
    params.append('idPlatform', it.platform ?? 'twitter')
  })
  const attempted = unknown.map((it) => theaterItemKey(it))
  fetch(`/api/feed?${params}`)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error('lookup failed'))))
    .then((d) => {
      const owned: FeedItem[] = d?.items ?? []
      if (owned.length) onOwned(owned)
    })
    .catch(() => {
      for (const k of attempted) checked.delete(k)
    })
}
