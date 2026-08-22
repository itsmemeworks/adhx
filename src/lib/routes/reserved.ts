/**
 * Top-level route segments owned by real app pages under `src/app`. A raw
 * X/Twitter handle must never be allowed to match one of these — otherwise a
 * handle-name author hub (`/{username}`) could shadow, or be shadowed by, an
 * actual app route (e.g. someone with the handle "trending" or "settings").
 *
 * Keep in sync with `src/app`'s top-level folders.
 */
export const RESERVED_TOP_LEVEL_SEGMENTS = new Set<string>([
  'api',
  'collections',
  'dev',
  'discover',
  'leaderboard',
  'privacy',
  'reel',
  'reels',
  'settings',
  'share',
  'shorts',
  't',
  'tags',
  'trending',
  'welcome',
])

/** Whether a segment (case-insensitive) collides with a reserved top-level route. */
export function isReservedTopLevelSegment(segment: string): boolean {
  return RESERVED_TOP_LEVEL_SEGMENTS.has(segment.toLowerCase())
}
