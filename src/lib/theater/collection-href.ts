/**
 * `/saved` is the only personal theater. The library grid navigates here
 * (card tap, `F`, leftover `?open=` / `?collection=1` deep
 * links) instead of mounting a second TheaterShell overlay.
 *
 * `/collection` 308s here so old links still work.
 */

/** Matches `/api/feed`'s per-request cap — fetch the full page, not a half. */
export const COLLECTION_QUEUE_LIMIT = 100

export const SAVED_PATH = '/saved'
export const SAVED_PATH_LEGACY = '/collection'

export function isSavedPath(pathname: string): boolean {
  return pathname === SAVED_PATH || pathname === SAVED_PATH_LEGACY
}

export function sameBookmark(
  item: { id: string; platform?: string | null },
  id: string,
  platform?: string | null,
): boolean {
  return item.id === id && (item.platform ?? 'twitter') === (platform ?? 'twitter')
}

export function collectionPath(opts?: { open?: string; platform?: string | null }): string {
  if (!opts?.open) return SAVED_PATH
  const params = new URLSearchParams({ open: opts.open })
  if (opts.platform && opts.platform !== 'all') params.set('platform', opts.platform)
  return `${SAVED_PATH}?${params}`
}
