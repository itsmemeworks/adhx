/** Session cursor for Saved. Opening Saved (remount or Live → Saved)
 * starts newest-first; `?open=` wins. Live adds still pin the cursor
 * while you stay on Live so they land as Next. `SAVED_PLAYED_STORAGE_KEY`
 * is the Watched set for Repeat-off Queue. */

export const SAVED_PLAYING_STORAGE_KEY = 'adhx-saved-playing'
export const SAVED_PLAYED_STORAGE_KEY = 'adhx-saved-played'

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

export function feedItemPlayingKey(item: { id: string; platform?: string | null }): string {
  return `${item.platform ?? 'twitter'}:${item.id}`
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

export function readPlayedSavedKeys(): Set<string> {
  if (typeof sessionStorage === 'undefined') return new Set()
  try {
    const raw = sessionStorage.getItem(SAVED_PLAYED_STORAGE_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((k): k is string => typeof k === 'string' && k.includes(':')))
  } catch {
    return new Set()
  }
}

export function writePlayedSavedKeys(keys: Iterable<string>): void {
  if (typeof sessionStorage === 'undefined') return
  try {
    const list = [...keys]
    if (list.length === 0) sessionStorage.removeItem(SAVED_PLAYED_STORAGE_KEY)
    else sessionStorage.setItem(SAVED_PLAYED_STORAGE_KEY, JSON.stringify(list))
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

/**
 * Saved start / type-filter snap. Newest-first LIFO starts at 0 unless
 * `playingIndex` is an explicit `?open=` (or in-session) cursor that still
 * matches the filter.
 */
export function savedStartIndex(
  length: number,
  opts: {
    playingIndex: number
    matches?: (index: number) => boolean
  },
): number {
  const matches = opts.matches ?? (() => true)
  if (opts.playingIndex >= 0 && opts.playingIndex < length && matches(opts.playingIndex)) {
    return opts.playingIndex
  }
  for (let i = 0; i < length; i++) {
    if (matches(i)) return i
  }
  return length
}
