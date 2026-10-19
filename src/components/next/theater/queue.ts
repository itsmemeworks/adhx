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
  type QueueVia,
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
  /** A From everyone channel (`group=slug`; members only). */
  groupChannel?: string | null
  /** A friend's channel (`friend=username`, `new=1` for just the new ones; members only). */
  friend?: { username: string; onlyNew: boolean } | null
  /** Your newest saves (`recent=1`): where a pasted or just-synced post plays. */
  recent: boolean
  /** A live "Right now" moment (`moment=slug`): Tune in. */
  moment: string | null
  /** `platform:id` of the post to start on. */
  start: string | null
  /**
   * A shared post's own page (`/{user}/status/{id}` and friends): the post
   * plays first, then posts like it from everyone's saves.
   */
  shared?: boolean
}

const SIGNALS: readonly MatchSignal[] = ['words', 'picture', 'video', 'keywords']
const KEY = /^[a-z]{1,16}:[A-Za-z0-9_-]{1,64}$/
const CHANNEL = /^([A-Za-z0-9_]{1,40})\/([a-z0-9-]{1,64})$/
const SLUG = /^[a-z0-9-]{1,64}$/
const USERNAME = /^[A-Za-z0-9_]{1,40}$/

export function channelPlayHref(username: string, tag: string, start?: string | null): string {
  const params = new URLSearchParams({ channel: `${username}/${tag}` })
  if (start) params.set('start', start)
  return `/play?${params}`
}

export function recentPlayHref(start?: string | null): string {
  const params = new URLSearchParams({ recent: '1' })
  if (start) params.set('start', start)
  return `/play?${params}`
}

/** Tune in to a moment. */
export function momentPlayHref(slug: string, start?: string | null): string {
  const params = new URLSearchParams({ moment: slug })
  if (start) params.set('start', start)
  return `/play?${params}`
}

/** Play a From everyone channel. */
export function groupPlayHref(slug: string, start?: string | null): string {
  const params = new URLSearchParams({ group: slug })
  if (start) params.set('start', start)
  return `/play?${params}`
}

/** Play a friend's channel (`onlyNew`: just what you haven't saved or seen). */
export function friendPlayHref(
  username: string,
  opts: { start?: string | null; onlyNew?: boolean } = {},
): string {
  const params = new URLSearchParams({ friend: username })
  if (opts.onlyNew) params.set('new', '1')
  if (opts.start) params.set('start', opts.start)
  return `/play?${params}`
}

/** A channel made of other people's saves (named, not searched): plays in its own order. */
export function isChannelSource(source: PlaySource): boolean {
  return !!(source.channel || source.auto || source.groupChannel || source.friend)
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
  if (source.groupChannel) {
    return `/api/channels/group/${encodeURIComponent(source.groupChannel)}`
  }
  if (source.friend) {
    const { username, onlyNew } = source.friend
    return `/api/channels/friend/${encodeURIComponent(username)}${onlyNew ? '?new=1' : ''}`
  }
  if (source.moment) return `/api/moments/${encodeURIComponent(source.moment)}?limit=100`
  if (source.recent) return '/api/feed?limit=100&hideArchived=true'
  return searchUrl()
}

/** Where "back" goes: the channel's page, your channels, or the search. */
export function backHref(source: PlaySource): string {
  if (source.shared) return '/now'
  if (source.channel) return `/t/${source.channel.username}/${source.channel.tag}`
  if (source.auto || source.groupChannel) return '/channels'
  if (source.friend) return `/channels/friend/${encodeURIComponent(source.friend.username)}`
  if (source.moment) return `/moments/${source.moment}`
  if (source.recent) return '/now'
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
  const moment = get('moment')
  const friend = get('friend')
  // `group` is a search's group when it names a signal, else a From everyone channel.
  const signal = SIGNALS.includes(group as MatchSignal) ? (group as MatchSignal) : null
  const groupChannel = !channel && !auto && !signal && group && SLUG.test(group) ? group : null
  const friendSource =
    !channel && !auto && !groupChannel && friend && USERNAME.test(friend)
      ? { username: friend, onlyNew: get('new') === '1' }
      : null
  const named = !!(channel || auto || groupChannel || friendSource)
  return {
    // A channel's "more like this" looks across everyone's saves.
    search: channel || groupChannel || friendSource ? { ...search, scope: 'everyone' } : search,
    group: signal,
    channel: channel ? { username: channel[1], tag: channel[2] } : null,
    auto: !channel && auto && SLUG.test(auto) ? auto : null,
    groupChannel,
    friend: friendSource,
    recent: !named && get('recent') === '1',
    moment: !named && moment && SLUG.test(moment) ? moment : null,
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

/** Mark posts as found from `from`, so the theater can say why they're playing. */
export function addedVia(
  more: SearchResultItem[],
  from: SearchResultItem,
  reason: QueueVia['reason'] = 'vibe',
): SearchResultItem[] {
  const via: QueueVia = {
    key: resultKey(from),
    author: from.post.author,
    kind: nextPostKind(from.post),
    reason,
  }
  return more.map((m) => ({ ...m, via }))
}

const KIND_NOUN: Record<QueueVia['kind'], string> = {
  video: 'video',
  gif: 'GIF',
  photo: 'photo',
  post: 'post',
  article: 'article',
}

/** Why an added post is playing, in a few words. */
export function viaReason(via: QueueVia, source: 'search' | 'channel' | 'saves' | 'post'): string {
  if (via.reason === 'more') return 'You asked for more like this'
  if (source === 'post') return 'Posts like the one you opened, from everyone’s saves'
  if (source === 'channel') return 'The channel finished, so similar posts play next'
  if (source === 'saves') return 'Your saves finished, so similar posts play next'
  return 'Your search finished, so similar posts play next'
}

/** "More like @ana’s video". */
export function viaLabel(via: QueueVia): string {
  return `More like @${via.author}’s ${KIND_NOUN[via.kind]}`
}

/**
 * Where the current post sits. The source's own posts count among
 * themselves ("2 of 4" stays 4 when similar posts are added); an added
 * post counts within its run of posts found from the same one.
 */
export function queuePosition(
  items: SearchResultItem[],
  index: number,
): { via: QueueVia | null; n: number; of: number } {
  const current = items[index]
  const via = current?.via ?? null
  if (!via) {
    const isOwn = (i: SearchResultItem) => !i.via || !!i.fromSource
    return {
      via: null,
      n: items.slice(0, index + 1).filter(isOwn).length,
      of: items.filter(isOwn).length,
    }
  }
  let start = index
  while (start > 0 && items[start - 1].via?.key === via.key) start--
  let end = index
  while (end < items.length - 1 && items[end + 1].via?.key === via.key) end++
  return { via, n: index - start + 1, of: end - start + 1 }
}
