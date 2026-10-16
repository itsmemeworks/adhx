/**
 * Pure helpers for the next_ui search screen: the `/api/search` contract as
 * the client sees it, URL state, grouping and plain-language wording. No
 * React, so they are unit-testable.
 */
import type { FeedItem } from '@/components/feed/types'
import { previewPath } from '@/lib/activity/preview-path'
import { collectionPath } from '@/lib/theater/collection-href'
import { nextPostKind, type NextPostKind } from '../post'

export type SearchScope = 'mine' | 'everyone'
export type SearchType = 'all' | 'videos' | 'photos' | 'text' | 'articles'
export type SearchView = 'bento' | 'groups' | 'queue'
export type MatchSignal = 'words' | 'picture' | 'video' | 'keywords'

export interface SearchResultItem {
  post: FeedItem
  /** In the viewer's own saves (otherwise someone else saved it). */
  saved: boolean
  matched: MatchSignal[]
}

export interface SearchResponse {
  items: SearchResultItem[]
  total: number
  /** False while meaning isn't available: word matches only. */
  understood: boolean
  /** The best result is a real match, not just the nearest thing. */
  close: boolean
  refined: boolean
  nextOffset: number | null
}

export interface SearchState {
  q: string
  scope: SearchScope
  type: SearchType
  wordsOnly: boolean
  view: SearchView
}

export const DEFAULT_STATE: SearchState = {
  q: '',
  scope: 'mine',
  type: 'all',
  wordsOnly: false,
  view: 'bento',
}

const SCOPES: readonly SearchScope[] = ['mine', 'everyone']
const TYPES: readonly SearchType[] = ['all', 'videos', 'photos', 'text', 'articles']
const VIEWS: readonly SearchView[] = ['bento', 'groups', 'queue']

function pick<T extends string>(
  value: string | null | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

/** Read the screen's state from `?q=&scope=&type=&words=&view=`. */
export function stateFromParams(
  params: URLSearchParams | Record<string, string | undefined>,
): SearchState {
  const get = (key: string) =>
    params instanceof URLSearchParams ? params.get(key) : (params[key] ?? null)
  return {
    q: (get('q') ?? '').slice(0, 200),
    scope: pick(get('scope'), SCOPES, DEFAULT_STATE.scope),
    type: pick(get('type'), TYPES, DEFAULT_STATE.type),
    wordsOnly: get('words') === '1',
    view: pick(get('view'), VIEWS, DEFAULT_STATE.view),
  }
}

/** The URL query for a state, leaving defaults out so links stay short. */
export function paramsFromState(state: SearchState): URLSearchParams {
  const params = new URLSearchParams()
  if (state.q.trim()) params.set('q', state.q)
  if (state.scope !== DEFAULT_STATE.scope) params.set('scope', state.scope)
  if (state.type !== DEFAULT_STATE.type) params.set('type', state.type)
  if (state.wordsOnly) params.set('words', '1')
  if (state.view !== DEFAULT_STATE.view) params.set('view', state.view)
  return params
}

/** `/api/search` URL for a state. */
export function searchUrl(
  state: SearchState,
  opts: { refine?: boolean; offset?: number } = {},
): string {
  // 60 is the API's page cap; the score cutoff keeps most searches under it.
  const params = new URLSearchParams({
    q: state.q,
    scope: state.scope,
    type: state.type,
    limit: '60',
  })
  if (state.wordsOnly) params.set('wordsOnly', '1')
  if (opts.refine) params.set('refine', '1')
  if (opts.offset) params.set('offset', String(opts.offset))
  return `/api/search?${params}`
}

export function resultKey(item: SearchResultItem): string {
  return `${item.post.platform ?? 'twitter'}:${item.post.id}`
}

export const TYPE_LABELS: Record<SearchType, string> = {
  all: 'Everything',
  videos: 'Videos',
  photos: 'Photos',
  text: 'Posts',
  articles: 'Articles',
}

const COUNT_NOUN: Record<SearchType, [string, string]> = {
  all: ['match', 'matches'],
  videos: ['video', 'videos'],
  photos: ['photo', 'photos'],
  text: ['post', 'posts'],
  articles: ['article', 'articles'],
}

/** "12 matches", "1 video". */
export function countLabel(count: number, type: SearchType): string {
  const [one, many] = COUNT_NOUN[type]
  return `${count} ${count === 1 ? one : many}`
}

export const KIND_WORD: Record<NextPostKind, string> = {
  video: 'Video',
  gif: 'GIF',
  photo: 'Photo',
  post: 'Post',
  article: 'Article',
}

/** Group headings and order for the Groups view: how each post matched. */
export const SIGNAL_GROUPS: { signal: MatchSignal; name: string }[] = [
  { signal: 'video', name: 'Shown in the video' },
  { signal: 'picture', name: 'In the picture' },
  { signal: 'words', name: 'What it’s about' },
  { signal: 'keywords', name: 'Your exact words' },
]

export interface ResultGroup {
  signal: MatchSignal
  name: string
  items: SearchResultItem[]
}

/** Each result goes in the group of its strongest signal, in rank order. */
export function groupResults(items: SearchResultItem[]): ResultGroup[] {
  return SIGNAL_GROUPS.map(({ signal, name }) => ({
    signal,
    name,
    items: items.filter((i) => (i.matched[0] ?? 'words') === signal),
  })).filter((g) => g.items.length > 0)
}

/** "Why this one", in plain words. */
export function matchReason(item: SearchResultItem): string {
  const [best, second] = item.matched
  const lead: Record<MatchSignal, string> = {
    video: 'What happens in the video matches what you described',
    picture: 'The picture shows what you described',
    words: 'It’s about what you described, even in different words',
    keywords: 'It uses the words you typed',
  }
  const also: Record<MatchSignal, string> = {
    video: 'the video',
    picture: 'the picture',
    words: 'what it says',
    keywords: 'your exact words',
  }
  const base = lead[best ?? 'words']
  return second ? `${base}, and ${also[second]} agrees.` : `${base}.`
}

/** Short version for list rows. */
export function matchShort(item: SearchResultItem): string {
  const short: Record<MatchSignal, string> = {
    video: 'in the video',
    picture: 'in the picture',
    words: 'about this',
    keywords: 'your words',
  }
  return short[item.matched[0] ?? 'words']
}

export function kindOf(item: SearchResultItem): NextPostKind {
  return nextPostKind(item.post)
}

/**
 * A result's public address: your saves at that post in Saved, anyone
 * else's on its public page. The search screen links into `/play` instead
 * (see `playHref`); this is the fallback outside a search.
 */
export function openHref(item: SearchResultItem): string {
  const { post } = item
  if (item.saved) return collectionPath({ open: post.id, platform: post.platform ?? 'twitter' })
  const kind = nextPostKind(post)
  return previewPath(
    post.platform ?? 'twitter',
    post.author,
    post.id,
    kind === 'photo' ? 'photo' : null,
  )
}

/** `/play?…` for a search, a group of it, or a post within it. */
export function playHref(
  search: Pick<SearchState, 'q' | 'scope' | 'type' | 'wordsOnly'>,
  opts: { group?: MatchSignal | null; start?: string | null } = {},
): string {
  const params = paramsFromState({ ...DEFAULT_STATE, ...search })
  if (opts.group) params.set('group', opts.group)
  if (opts.start) params.set('start', opts.start)
  return `/play?${params}`
}

/** Back to the search this session came from. */
export function searchHref(
  search: Pick<SearchState, 'q' | 'scope' | 'type' | 'wordsOnly'>,
): string {
  const query = paramsFromState({ ...DEFAULT_STATE, ...search }).toString()
  return query ? `/search?${query}` : '/search'
}

const RECENT_KEY = 'adhx:search:recent'
const RECENT_MAX = 6

/** Recent searches (this browser only). Never throws. */
export function readRecent(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY)
    const list = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(list)
      ? list.filter((x): x is string => typeof x === 'string').slice(0, RECENT_MAX)
      : []
  } catch {
    return []
  }
}

export function rememberRecent(q: string): string[] {
  const query = q.trim()
  if (query.length < 2) return readRecent()
  const next = [
    query,
    ...readRecent().filter((x) => x.toLowerCase() !== query.toLowerCase()),
  ].slice(0, RECENT_MAX)
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    // Private mode / blocked storage: recents are a convenience only.
  }
  return next
}

/**
 * A muted preview stream for the best match, or null when the post has no
 * video the app can stream itself (YouTube plays through its embed only).
 */
export function previewVideoSrc(post: FeedItem): string | null {
  const media = post.media ?? []
  const index = media.findIndex((m) => m.mediaType === 'video' || m.mediaType === 'animated_gif')
  if (index < 0) return null
  const platform = post.platform ?? 'twitter'
  if (platform === 'twitter') {
    // The proxy's first video is the post's first video.
    const params = new URLSearchParams({
      author: post.author,
      tweetId: post.id,
      quality: 'preview',
    })
    return `/api/media/video?${params}`
  }
  const url = media[index].url
  return url?.startsWith('/api/media/') ? url : null
}
