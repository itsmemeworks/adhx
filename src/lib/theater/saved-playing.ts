/** Session cursor for Saved so `/live` ⇄ `/saved` remounts land on the
 * same post (Live paste prepends without stealing focus). `?open=` wins. */

export const SAVED_PLAYING_STORAGE_KEY = 'adhx-saved-playing'

export function parseSavedPlayingKey(
  raw: string | null | undefined,
): { platform: string; id: string } | null {
  if (!raw) return null
  const colon = raw.indexOf(':')
  if (colon <= 0) return null
  const platform = raw.slice(0, colon)
  const id = raw.slice(colon + 1)
  if (!platform || !id) return null
  return { platform, id }
}

export function readSavedPlayingKey(): string | null {
  if (typeof sessionStorage === 'undefined') return null
  try {
    return sessionStorage.getItem(SAVED_PLAYING_STORAGE_KEY)
  } catch {
    return null
  }
}

export function writeSavedPlayingKey(key: string | null): void {
  if (typeof sessionStorage === 'undefined') return
  try {
    if (!key) sessionStorage.removeItem(SAVED_PLAYING_STORAGE_KEY)
    else sessionStorage.setItem(SAVED_PLAYING_STORAGE_KEY, key)
  } catch {
    // private mode / blocked storage
  }
}

export function savedPlayingIndex(
  items: ReadonlyArray<{ id: string; platform?: string | null }>,
  key: string | null | undefined,
): number {
  const parsed = parseSavedPlayingKey(key)
  if (!parsed) return 0
  const idx = items.findIndex(
    (item) => item.id === parsed.id && (item.platform ?? 'twitter') === parsed.platform,
  )
  return idx === -1 ? 0 : idx
}
