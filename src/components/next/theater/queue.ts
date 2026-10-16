/**
 * Pure queue logic for the next_ui theater (redesign phase 4): where a play
 * session comes from, how next/previous move with repeat and "videos only",
 * how long non-video posts stay up, and how "stick to this vibe" extends the
 * queue. No React.
 */
import {
  resultKey,
  stateFromParams,
  type MatchSignal,
  type SearchResultItem,
  type SearchState,
} from '../search/model'

import { searchHref } from '../search/model'

export { playHref, searchHref } from '../search/model'
import { nextPostKind, postText } from '../post'

export type RepeatMode = 'off' | 'all' | 'one'
export const REPEAT_ORDER: RepeatMode[] = ['off', 'all', 'one']
export const REPEAT_LABELS: Record<RepeatMode, string> = {
  off: 'Off',
  all: 'All',
  one: 'This post',
}

/** A play session: a search (optionally one of its groups) and where to start. */
/**
 * A play session: a search (optionally one of its groups), a channel
 * (`channel=user/tag`, anyone can watch a public one) or one of your "Made
 * for you" channels (`auto=slug`), and where to start.
 */
export interface PlaySource {
  search: Omit<SearchState, 'view'>
  group: MatchSignal | null
  channel: { username: string; tag: string } | null
  auto: string | null
  /** `platform:id` of the post to start on. */
  start: string | null
}

const SIGNALS: readonly MatchSignal[] = ['words', 'picture', 'video', 'keywords']
const KEY = /^[a-z]{1,16}:[A-Za-z0-9_-]{1,64}$/
const CHANNEL = /^([A-Za-z0-9_]{1,40})\/([a-z0-9-]{1,64})$/
const SLUG = /^[a-z0-9-]{1,64}$/

export function channelPlayHref(username: string, tag: string, start?: string | null): string {
  const params = new URLSearchParams({ channel: `${username}/${tag}` })
  if (start) params.set('start', start)
  return `/play?${params}`
}

export function autoPlayHref(slug: string, start?: string | null): string {
  const params = new URLSearchParams({ auto: slug })
  if (start) params.set('start', start)
  return `/play?${params}`
}

/** Where the theater's queue comes from, as an API URL. */
export function queueUrl(source: PlaySource, searchUrl: () => string): string {
  if (source.channel) {
    const { username, tag } = source.channel
    return `/api/channels/by/${encodeURIComponent(username)}/${encodeURIComponent(tag)}`
  }
  if (source.auto) return `/api/channels/auto/${encodeURIComponent(source.auto)}`
  return searchUrl()
}

/** Where "back" goes: the channel's page, your channels, or the search. */
export function backHref(source: PlaySource): string {
  if (source.channel) return `/t/${source.channel.username}/${source.channel.tag}`
  if (source.auto) return '/channels'
  return searchHref(source.search)
}

export function sourceFromParams(
  params: URLSearchParams | Record<string, string | undefined>,
): PlaySource {
  const get = (key: string) =>
    params instanceof URLSearchParams ? params.get(key) : (params[key] ?? null)
  const { view: _view, ...search } = stateFromParams(params)
  const group = get('group')
  const start = get('start')
  const channel = CHANNEL.exec(get('channel') ?? '')
  const auto = get('auto')
  return {
    // A channel's "more like this" looks across everyone's saves.
    search: channel ? { ...search, scope: 'everyone' } : search,
    group: SIGNALS.includes(group as MatchSignal) ? (group as MatchSignal) : null,
    channel: channel ? { username: channel[1], tag: channel[2] } : null,
    auto: !channel && auto && SLUG.test(auto) ? auto : null,
    start: start && KEY.test(start) ? start : null,
  }
}

export function isVideoItem(item: SearchResultItem): boolean {
  const kind = nextPostKind(item.post)
  return kind === 'video' || kind === 'gif'
}

/**
 * Seconds a post without a player stays up before moving on: photos a beat,
 * text by length (roughly reading speed), articles long enough to take in
 * the cover and lede.
 */
export function dwellSeconds(item: SearchResultItem): number {
  const kind = nextPostKind(item.post)
  if (kind === 'photo') {
    const photos = item.post.media?.filter((m) => m.mediaType === 'photo').length ?? 1
    return Math.min(16, 6 + (photos - 1) * 3)
  }
  if (kind === 'article') return 14
  const words = postText(item.post).split(/\s+/).filter(Boolean).length
  return Math.min(15, Math.max(5, 3 + words * 0.25))
}

/** Index of the next post to play, or null at the end (no repeat). */
export function nextIndex(
  items: SearchResultItem[],
  current: number,
  opts: { repeat: RepeatMode; videosOnly: boolean },
): number | null {
  if (items.length === 0) return null
  const ok = (i: number) => !opts.videosOnly || isVideoItem(items[i])
  for (let i = current + 1; i < items.length; i++) if (ok(i)) return i
  if (opts.repeat === 'all') {
    for (let i = 0; i <= current && i < items.length; i++) if (ok(i)) return i
  }
  return null
}

export function prevIndex(
  items: SearchResultItem[],
  current: number,
  opts: { videosOnly: boolean },
): number | null {
  for (let i = current - 1; i >= 0; i--) {
    if (!opts.videosOnly || isVideoItem(items[i])) return i
  }
  return null
}

/** Append posts not already in the queue (keeps the order of both). */
export function appendUnique(
  items: SearchResultItem[],
  more: SearchResultItem[],
): SearchResultItem[] {
  const seen = new Set(items.map(resultKey))
  return [...items, ...more.filter((m) => !seen.has(resultKey(m)))]
}

/**
 * "More like this": put the similar posts right after the current one,
 * moving any that were further down the queue up, so they play next.
 */
export function insertAfter(
  items: SearchResultItem[],
  current: number,
  more: SearchResultItem[],
): SearchResultItem[] {
  const incoming = new Set(more.map(resultKey))
  const head = items.slice(0, current + 1)
  const headKeys = new Set(head.map(resultKey))
  const fresh = more.filter((m) => !headKeys.has(resultKey(m)))
  const tail = items.slice(current + 1).filter((i) => !incoming.has(resultKey(i)))
  return [...head, ...fresh, ...tail]
}

/** Saved posts coming up soon, to move to the front of the understanding queue. */
export function upcomingSavedKeys(
  items: SearchResultItem[],
  current: number,
  count = 10,
): { platform: string; id: string }[] {
  return items
    .slice(current + 1, current + 1 + count)
    .filter((i) => i.saved)
    .map((i) => ({ platform: i.post.platform ?? 'twitter', id: i.post.id }))
}

/** `0:41` from seconds. */
export function clock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const s = Math.floor(seconds)
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}
