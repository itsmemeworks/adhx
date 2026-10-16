/**
 * Where the old entry points go now that the redesign is the default
 * (phase 7). Pure; the pages call these only when `isNextUiEnabled()`.
 * Deep-link parameters carry over when they're well-formed.
 */

const ID = /^[A-Za-z0-9_-]{1,64}$/
const PLATFORM = /^[a-z]{1,16}$/

/** `/saved?open=id&platform=p` (and the signed-in home) → the theater on your newest saves. */
export function savedToPlay(open?: string | null, platform?: string | null): string {
  if (!open || !ID.test(open)) return '/play?recent=1'
  const p = platform && PLATFORM.test(platform) && platform !== 'all' ? platform : 'twitter'
  return `/play?${new URLSearchParams({ recent: '1', start: `${p}:${open}` })}`
}

/** `/library?search=…` → `/search?q=…`. */
export function libraryToSearch(search?: string | null): string {
  const q = (search ?? '').trim().slice(0, 200)
  return q ? `/search?${new URLSearchParams({ q })}` : '/search'
}

export const TAGS_TO_CHANNELS = '/channels'
