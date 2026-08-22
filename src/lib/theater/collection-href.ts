/**
 * `/collection` is the only personal theater. The library grid navigates here
 * (card tap, `F`, leftover `?open=` / `?collection=1` / `?triage=1` deep
 * links) instead of mounting a second TheaterShell overlay.
 */

/** Matches `/api/feed`'s per-request cap — fetch the full page, not a half. */
export const COLLECTION_QUEUE_LIMIT = 100

export function sameBookmark(
  item: { id: string; platform?: string | null },
  id: string,
  platform?: string | null,
): boolean {
  return item.id === id && (item.platform ?? 'twitter') === (platform ?? 'twitter')
}

export function collectionPath(opts?: { open?: string; platform?: string | null }): string {
  if (!opts?.open) return '/collection'
  const params = new URLSearchParams({ open: opts.open })
  if (opts.platform && opts.platform !== 'all') params.set('platform', opts.platform)
  return `/collection?${params}`
}
