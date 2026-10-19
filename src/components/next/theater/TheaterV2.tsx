'use client'

import { networkLabel } from '@/lib/platform/networks'
import { NetworkIcon } from '../NetworkIcon'

import { composeArticleCopy, fetchArticleMarkdown } from '@/lib/theater/article-body'
import { RichText, postBody } from '../rich-text'
import { ArticleReader } from '../stages/ArticleReader'
import { timeAgo, useMomentStream } from '../moments/live'
import {
  ArrivalToast,
  ReactButton,
  ReactionFloats,
  ReactionPicker,
  WatchersBar,
  type FloatingReaction,
} from '../moments/LiveTogether'
import type { ReactionEmoji } from '@/lib/moments/reactions'
import { AccountMenu } from '../AccountMenu'
import { BottomNav, NxLogo, PrimaryNav } from '../PrimaryNav'
import { NxHeader } from '../channels/ChannelParts'
import { HeaderSearch, focusHeaderSearch } from '../QuickSearch'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Bookmark,
  ChevronLeft,
  Ellipsis,
  ListVideo,
  Maximize,
  Minimize,
  Pause,
  PictureInPicture2,
  Play,
  Repeat,
  Send,
  Check,
  Copy,
  Download,
  SkipBack,
  SkipForward,
  Radio,
  Sparkles,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FeedItem } from '@/components/feed/types'
import { sanitizeTag } from '@/lib/utils/tag'
import { Stage } from '@/components/theater/Stage'
import { feedItemToTheaterItem } from '@/components/theater/collection-item'
import { useSendFile } from '@/components/theater/useSendFile'
import { useTheaterSoundPreference } from '@/components/theater/useTheaterSoundPreference'
import { usePreferencesOptional } from '@/lib/preferences-context'
import { useMobileSwipeNavigation } from '@/components/theater/useMobileSwipeNavigation'
import { previewPath, sourceUrl } from '@/lib/activity/preview-path'
import { articleHeadline, postAuthor, postText } from '../post'
import { NxAvatar } from '../primitives'
import { PrivateLock, SaversButton } from '../SaverFaces'
import type { Saver } from '@/lib/people/types'
import { useAuthMe } from '@/components/auth'
import { AdhxLoader } from '../loader'
import { ArticleStage, PostStage } from '../stages'
import {
  groupResults,
  orderByStrength,
  kindOf,
  resultKey,
  searchUrl,
  type SearchResponse,
  type SearchResultItem,
} from '../search/model'
import {
  addedVia,
  appendUnique,
  clock,
  dwellSeconds,
  insertAfter,
  isVideoItem,
  nextIndex,
  prevIndex,
  REPEAT_LABELS,
  REPEAT_ORDER,
  backHref,
  feedPlayHref,
  feedUrl,
  friendPlayHref,
  isChannelSource,
  queuePosition,
  queueUrl,
  upcomingSavedKeys,
  viaLabel,
  viaReason,
  type PlaySource,
  type RepeatMode,
} from './queue'
import {
  MoreSheet,
  ShareSheet,
  SaveSheet,
  UpNextSheet,
  WhySheet,
  type ChannelOption,
  type MenuRow,
  type WhyFriend,
} from './TheaterSheets'
import { CaughtUpStage, FeedSwitch, FeedTypesControl, WhyChip } from './FeedParts'
import { SEEN_AFTER_MS, useSeenPosts } from './useSeenPosts'
import {
  DEFAULT_FEED_KINDS,
  FEED_KINDS,
  type BlendMode,
  type FeedKind,
  type FeedWeight,
} from '@/lib/feed/blend'
import { stage, useDwell, useStageTap, useVideoState } from './usePlayerState'
import { LearningPill, LearningSheet, useLearningStatus } from '../onboarding/learning'
import { PasteButton, usePasteToSave } from '../onboarding/usePasteToSave'
import { channelTitle } from '../channels/ChannelParts'
import { useBusyLogo } from '../logo-busy'
import { POST_SAVED as NX_POST_SAVED } from '@/lib/theater/client-events'

/** How long a reaction floats on screen. */
const REACTION_MS = 4_400

/** X articles carry their whole body; other links only have a preview. */
function hasFullArticle(post: FeedItem): boolean {
  if ((post.platform ?? 'twitter') !== 'twitter') return false
  if (post.articleContent?.blocks?.length) return true
  const url = post.articlePreview?.url ?? ''
  return /^https:\/\/(x|twitter)\.com\/[^/]+\/article\//.test(url)
}

type Load =
  | { status: 'loading' }
  | { status: 'error'; missing?: boolean; busy?: boolean }
  | { status: 'ready' }
type Panel = null | 'queue' | 'more' | 'save' | 'share' | 'why'

type QueueResponse = SearchResponse & {
  name?: string
  channel?: { tag: string }
  /** A moment's detail (Tune in): its items carry when they were saved. */
  moment?: { title: string; hue: string; watching: number }
  /** The blended feed (`/api/feed/blend`): paging and the end of New. */
  nextCursor?: string | null
  caughtUp?: boolean
  nothingYet?: boolean
  total?: number
  /** The kinds the feed was filtered to, and (New) unseen posts of other kinds. */
  types?: FeedKind[]
  waiting?: Partial<Record<FeedKind, number>>
  /** Members only: who else is tuned in. */
  watchers?: Saver[]
}

const FEED_TITLES: Record<BlendMode, string> = {
  new: 'New',
  everyone: 'Everyone',
  friends: 'Friends only',
  mine: 'Mine',
}

/** Blended feed items are plain posts; "saved" is whether you're among the savers. */
function feedResults(items: FeedItem[]): SearchResultItem[] {
  return items.map((post) => ({
    post,
    saved: !!post.savers?.some((s) => s.isYou),
    matched: [],
  }))
}

/** What to say when there's nothing to play, by where the queue came from. */
function emptyState(
  source: PlaySource,
  load: Load,
): {
  title: string
  body: string
  action: string
  href: string
  retry?: boolean
  /** Offer Paste instead of a link. */
  paste?: boolean
} {
  const missing = load.status === 'error' && load.missing
  if (source.moment && missing)
    return {
      title: 'This moment has passed',
      body: 'People have moved on. See what they’re saving now.',
      action: 'Right now',
      href: '/now',
    }
  if (source.friend && missing)
    return {
      title: 'No saves to show here',
      body: 'They may have left, or kept everything just for themselves.',
      action: 'Channels',
      href: '/channels',
    }
  if (isChannelSource(source) && missing)
    return {
      title: 'This channel isn’t here',
      body: source.groupChannel
        ? 'Channels from everyone get remade as people save. Pick another.'
        : 'It may have been made private or removed.',
      action: 'Channels',
      href: '/channels',
    }
  if (load.status === 'error')
    return {
      title: 'That didn’t load',
      body: load.busy
        ? 'Lots of requests from here just now. Give it a moment, then try again.'
        : 'It might be a blip. Try again.',
      action: 'Go back',
      href: backHref(source),
      retry: true,
    }
  if (source.feed === 'new' || source.feed === 'everyone')
    return {
      title: 'Nothing new yet.',
      body: 'Save something for your people to find.',
      action: 'Paste',
      href: '/channels',
      paste: true,
    }
  if (source.feed === 'friends')
    return {
      title: 'Nothing from your people yet.',
      body: 'When friends save something, it plays here.',
      action: 'Browse channels',
      href: '/channels',
    }
  if (source.friend?.onlyNew)
    return {
      title: 'You’re all caught up',
      body: 'Nothing new from them since you last looked. Go touch grass.',
      action: 'Play all of them',
      href: friendPlayHref(source.friend.username),
    }
  if (source.friend || source.groupChannel)
    return {
      title: 'Nothing to play here yet',
      body: 'Nobody has saved anything others can see in here.',
      action: 'Channels',
      href: '/channels',
    }
  if (source.recent || source.feed === 'mine')
    return {
      title: 'Nothing saved yet',
      body: 'Paste a link to a post from X, Instagram, TikTok, YouTube, Reddit and more, or bring in your X bookmarks.',
      action: 'Bring in X bookmarks',
      href: '/settings?sync=1',
    }
  return {
    title: 'Nothing to play here',
    body: 'Nothing matches that yet. Try describing it another way.',
    action: 'Back to search',
    href: backHref(source),
  }
}

/** `CustomEvent<{ key }>`: a post (by `resultKey`) was saved outside the theater. */
export { POST_SAVED as NX_POST_SAVED } from '@/lib/theater/client-events'

async function fetchQueue(url: string, signal?: AbortSignal): Promise<QueueResponse> {
  const response = await fetch(url, { signal, credentials: 'same-origin' })
  if (!response.ok) throw new Error(`queue ${response.status}`)
  return (await response.json()) as QueueResponse
}

async function fetchResults(url: string, signal?: AbortSignal): Promise<SearchResultItem[]> {
  return (await fetchQueue(url, signal)).items
}

/**
 * Similar posts keep the search's scope but not its type filter: carrying on
 * with a vibe may move from posts to videos, unless "Videos only" is on.
 */
function similarUrl(item: SearchResultItem, source: PlaySource, videosOnly: boolean): string {
  const params = new URLSearchParams({
    platform: item.post.platform ?? 'twitter',
    id: item.post.id,
    scope: source.search.scope,
    type: videosOnly ? 'videos' : 'all',
    limit: '20',
  })
  return `/api/search/similar?${params}`
}

function RailButton({
  label,
  onClick,
  children,
  active = false,
}: {
  label: string
  onClick: () => void
  children: ReactNode
  active?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'nx-plate flex h-12 w-12 items-center justify-center rounded-full md:h-[52px] md:w-[52px]',
        active ? 'text-nx-accent' : 'text-white',
      )}
    >
      {children}
    </button>
  )
}

function ControlButton({
  label,
  onClick,
  children,
  className,
  pressed,
}: {
  label: string
  onClick: () => void
  children: ReactNode
  className?: string
  pressed?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        'flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white hover:bg-white/10',
        className,
      )}
    >
      {children}
    </button>
  )
}

/**
 * The next_ui theater (redesign phase 4). Plays a search's results (or one
 * group of them) as a queue, full-bleed, with the approved rail, transport
 * and sheets. Media playback is the current theater's `Stage`, unchanged.
 */
export function TheaterV2({
  source,
  lead,
}: {
  source: PlaySource
  /** A shared post's page: the post itself, already resolved (plays first). */
  lead?: SearchResultItem
}) {
  const router = useRouter()
  const rootRef = useRef<HTMLDivElement>(null)
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  useBusyLogo('theater', load.status === 'loading')
  /** A channel's name, once its queue loads. */
  const [title, setTitle] = useState<string | null>(null)
  const [items, setItems] = useState<SearchResultItem[]>([])
  const [index, setIndex] = useState(0)
  const preferenceContext = usePreferencesOptional()
  // Settings' "Sound on by default", then the viewer's latest mute choice
  // (shared with the other theater, across tabs and reloads).
  const [muted, setMuted] = useTheaterSoundPreference({
    soundOnByDefault: preferenceContext?.preferences.soundOn ?? false,
    ready: !preferenceContext || !preferenceContext.loading,
  })
  const [volume, setVolume] = useState(1)
  // A shared post loops until you move on, like the old preview pages.
  const [repeat, setRepeat] = useState<RepeatMode>(source.shared ? 'one' : 'off')
  const [videosOnly, setVideosOnly] = useState(source.search.type === 'videos')
  const [stick, setStick] = useState(true)
  const [timedPaused, setTimedPaused] = useState(false)
  const [panel, setPanel] = useState<Panel>(null)
  const [ended, setEnded] = useState(false)
  const [savedNow, setSavedNow] = useState<Set<string>>(new Set())
  const [channels, setChannels] = useState<ChannelOption[] | null>(null)
  /** Channels each post is in, as changed here (else the post's own tags). */
  const [postTags, setPostTags] = useState<Map<string, Set<string>>>(new Map())
  const [channelBusy, setChannelBusy] = useState<string | null>(null)
  const [created, setCreated] = useState<{ tag: string; shareUrl: string | null } | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  /** The caption over a video or photo is open in full. */
  const [captionOpen, setCaptionOpen] = useState(false)
  /** How far through the article on stage (0–1); the bottom bar shows and moves it. */
  const [articleProgress, setArticleProgress] = useState(0)
  /** The post on stage is taller than the screen. */
  const [longPost, setLongPost] = useState(false)
  const articleSeek = useRef<((p: number) => void) | null>(null)
  const extendingRef = useRef(false)
  // Tune in (a live moment): its colour, who's watching, new saves arriving.
  const [momentHue, setMomentHue] = useState('#ffd23f')
  const [watching, setWatching] = useState(0)
  /** A watching event came in: newer than the moment's own count, which may predate this page joining. */
  const watchingLive = useRef(false)
  const [arrivals, setArrivals] = useState(0)
  const [waiting, setWaiting] = useState(false)
  const [wander, setWander] = useState(false)
  const waitingRef = useRef(false)
  waitingRef.current = waiting
  // The blended feed (`feed=`): the next page, how many in all, the end of New.
  const feedCursor = useRef<string | null>(null)
  const feedLoading = useRef<Promise<boolean> | null>(null)
  const [feedTotal, setFeedTotal] = useState(0)
  const [caughtUp, setCaughtUp] = useState(false)
  /** "Show more / less from …", loaded when "Why this one" first opens. */
  const [weights, setWeights] = useState<Record<string, FeedWeight> | null>(null)
  const [weightBusy, setWeightBusy] = useState<string | null>(null)
  // "What's in your feed": a choice made here wins over the link's `types`,
  // which wins over the stored choice (the server's default).
  const [typesChoice, setTypesChoice] = useState<{ source: PlaySource; types: FeedKind[] } | null>(
    null,
  )
  const chosenTypes =
    typesChoice?.source === source ? typesChoice.types : (source.feedTypes ?? null)
  const typesKey = chosenTypes?.join(',') ?? ''
  /** The kinds the loaded pages are filtered to (later pages ask for the same). */
  const feedTypesUsed = useRef<FeedKind[] | null>(null)
  const [shownTypes, setShownTypes] = useState<FeedKind[]>([...DEFAULT_FEED_KINDS])
  const [feedWaiting, setFeedWaiting] = useState<Partial<Record<FeedKind, number>>>({})
  // Tuned in with names (members only): who else is in, who just saved, reactions.
  const [watchers, setWatchers] = useState<Saver[]>([])
  const [arrival, setArrival] = useState<{
    saver: Saver
    post: FeedItem
    /** Caught up, so it is already playing. */
    now?: boolean
  } | null>(null)
  const [floats, setFloats] = useState<FloatingReaction[]>([])
  const [reactOpen, setReactOpen] = useState(false)
  const [reacting, setReacting] = useState(false)

  // ——— Load the queue from the search this session came from ———
  useEffect(() => {
    if (source.shared) {
      // The page resolved the post already; posts like it follow (Stick to this vibe).
      if (lead) {
        setItems([lead])
        setIndex(0)
        setTitle('Right now')
        setLoad({ status: 'ready' })
      }
      return
    }
    const controller = new AbortController()
    setLoad({ status: 'loading' })
    setCaughtUp(false)
    watchingLive.current = false
    feedCursor.current = null
    feedLoading.current = null
    const types = typesKey ? (typesKey.split(',') as FeedKind[]) : null
    fetchQueue(
      source.feed
        ? feedUrl(source.feed, null, 20, types)
        : queueUrl(source, () => searchUrl({ ...source.search, view: 'bento' }, { refine: true })),
      controller.signal,
    )
      .then((response) => {
        // The recent queue is the feed: plain posts, all the viewer's own.
        const results = source.feed
          ? feedResults(response.items as unknown as FeedItem[])
          : source.recent
            ? (response.items as unknown as FeedItem[]).map((post) => ({
                post,
                saved: true,
                matched: [],
              }))
            : source.moment
              ? (
                  response.items as unknown as {
                    post: FeedItem
                    savedAt: string
                    savers?: Saver[]
                  }[]
                ).map(({ post, savedAt, savers: by }) => ({
                  // Members get each post's savers on the item: the byline shows them.
                  post: by ? { ...post, savers: by } : post,
                  saved: false,
                  matched: [],
                  savedAt,
                }))
              : isChannelSource(source)
                ? response.items
                : orderByStrength(response.items)
        if (source.feed) {
          feedCursor.current = response.nextCursor ?? null
          feedTypesUsed.current = response.types ?? types
          if (response.types?.length) setShownTypes(response.types)
          setFeedWaiting(response.waiting ?? {})
          setFeedTotal(response.total ?? results.length)
          // Opened New with nothing left: straight to the end card.
          setCaughtUp(source.feed === 'new' && results.length === 0 && !response.nothingYet)
        }
        if (response.moment) {
          setMomentHue(response.moment.hue)
          if (!watchingLive.current) {
            setWatching(response.moment.watching)
            setWatchers(response.watchers ?? [])
          }
        }
        setTitle(
          source.feed
            ? FEED_TITLES[source.feed]
            : source.recent
              ? 'Your saves'
              : (response.moment?.title ??
                response.name ??
                (response.channel ? channelTitle(response.channel.tag) : null)),
        )
        const list = source.group
          ? (groupResults(results).find((g) => g.signal === source.group)?.items ?? [])
          : results
        const start = source.start ? list.findIndex((i) => resultKey(i) === source.start) : -1
        if (start >= 0 || !source.recent || !source.start) {
          setItems(list)
          setIndex(Math.max(0, start))
          setLoad({ status: 'ready' })
          return
        }
        // A pasted or older save isn't among the newest: play it first anyway.
        const at = source.start.indexOf(':')
        const params = new URLSearchParams({
          id: source.start.slice(at + 1),
          idPlatform: source.start.slice(0, at),
          hideArchived: 'false',
        })
        return fetch(`/api/feed?${params}`, {
          signal: controller.signal,
          credentials: 'same-origin',
        })
          .then((r) => (r.ok ? (r.json() as Promise<{ items: FeedItem[] }>) : { items: [] }))
          .then(({ items: found }) => {
            setItems(found[0] ? [{ post: found[0], saved: true, matched: [] }, ...list] : list)
            setIndex(0)
            setLoad({ status: 'ready' })
          })
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return
        // 404: the moment has passed, or the channel is gone or private.
        const message = e instanceof Error ? e.message : ''
        setLoad({
          status: 'error',
          missing: message === 'queue 404',
          busy: message === 'queue 429',
        })
      })
    return () => controller.abort()
  }, [source, lead, typesKey])

  const current = items[index] ?? null
  const currentKey = current ? resultKey(current) : ''
  const kind = current ? kindOf(current) : 'post'
  const kindRef = useRef(kind)
  kindRef.current = kind
  const isVideo = !!current && isVideoItem(current)
  const theaterItem = useMemo(
    () => (current ? (current.stage ?? feedItemToTheaterItem(current.post)) : null),
    [current],
  )
  const video = useVideoState(currentKey)
  const send = useSendFile(theaterItem)
  const saved = !!current && (current.saved || savedNow.has(currentKey))
  // "Just for me": the server's flag, then whatever was switched here.
  const [privateNow, setPrivateNow] = useState<Map<string, boolean>>(new Map())
  const isPrivate = !!current && (privateNow.get(currentKey) ?? !!current.post.isPrivate)
  // Savers are only sent to signed-in members; a save made here adds you.
  const { me } = useAuthMe()
  // Seen (the feed's watched list): 2s on stage, or skipped. Members only.
  const markSeen = useSeenPosts(!!me?.user && !source.shared)
  const currentKeyRef = useRef(currentKey)
  currentKeyRef.current = currentKey
  useEffect(() => {
    if (!currentKey || caughtUp) return
    const t = setTimeout(() => markSeen(currentKey), SEEN_AFTER_MS)
    return () => clearTimeout(t)
  }, [currentKey, caughtUp, markSeen])
  const member = !!me?.user
  const savers = useMemo<Saver[] | undefined>(() => {
    const list = current?.post.savers
    if (!list) return undefined
    if (!savedNow.has(currentKey) || list.some((s) => s.isYou) || !me?.user) return list
    const you: Saver = {
      username: me.user.username,
      name: me.user.displayName || null,
      avatarUrl: me.user.avatarUrl,
      savedAt: new Date().toISOString(),
      isYou: true,
    }
    return [you, ...list]
  }, [current, currentKey, savedNow, me])

  /** Friends "Why this one" can show more or less of: whoever else saved it. */
  const whyFriends = useMemo<WhyFriend[]>(
    () =>
      (savers ?? [])
        .filter((s) => !s.isYou)
        .slice(0, 2)
        .map((s) => ({ username: s.username, name: s.name?.trim() || s.username })),
    [savers],
  )

  const flash = useCallback((message: string, ms = 2200) => {
    setToast(message)
    window.setTimeout(() => setToast((t) => (t === message ? null : t)), ms)
  }, [])

  /** What this session plays, in words: “goat”, a channel's name, "your saves". */
  const sourceName = source.shared
    ? 'this post'
    : source.recent
      ? 'your saves'
      : title
        ? title
        : source.search.q.trim()
          ? `“${source.search.q.trim()}”`
          : 'this search'
  const position = queuePosition(items, index)

  // Saved posts coming up get understood first.
  useEffect(() => {
    const posts = upcomingSavedKeys(items, index)
    if (posts.length === 0) return
    void fetch('/api/understanding/prioritize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ posts }),
    }).catch(() => {})
  }, [items, index])

  // ——— Moving through the queue ———
  const goTo = useCallback(
    (i: number) => {
      // Moving on before 2s is skipping it, which counts as seen too.
      markSeen(currentKeyRef.current)
      setCaughtUp(false)
      setCaptionOpen(false)
      setArticleProgress(0)
      setLongPost(false)
      setEnded(false)
      setWaiting(false)
      setArrivals(0)
      setArrival(null)
      setTimedPaused(false)
      setIndex(i)
    },
    [markSeen],
  )

  // The queue as of now, for async steps that must not act on a stale render.
  const itemsRef = useRef(items)
  itemsRef.current = items
  const indexRef = useRef(index)
  indexRef.current = index
  const replaceItems = useCallback((list: SearchResultItem[]) => {
    itemsRef.current = list
    setItems(list)
  }, [])

  /** The blended feed's next page, appended. True when it brought anything new. */
  const loadMoreFeed = useCallback((): Promise<boolean> => {
    const cursor = feedCursor.current
    if (!source.feed || !cursor) return Promise.resolve(false)
    if (feedLoading.current) return feedLoading.current
    const task = fetchQueue(feedUrl(source.feed, cursor, 20, feedTypesUsed.current))
      .then((response) => {
        if (feedCursor.current !== cursor) return false // reloaded meanwhile
        feedCursor.current = response.nextCursor ?? null
        if (typeof response.total === 'number') setFeedTotal(response.total)
        const before = itemsRef.current.length
        const list = appendUnique(
          itemsRef.current,
          feedResults(response.items as unknown as FeedItem[]),
        )
        if (list.length === before) return false
        replaceItems(list)
        return true
      })
      .catch(() => false)
      .finally(() => {
        feedLoading.current = null
      })
    feedLoading.current = task
    return task
  }, [source.feed, replaceItems])

  // A few posts from the end of what's loaded, fetch the next page.
  useEffect(() => {
    if (source.feed && feedCursor.current && index >= items.length - 4) void loadMoreFeed()
  }, [source.feed, index, items.length, loadMoreFeed])

  // A video turned out to be deleted upstream: drop it and play what's next.
  useEffect(() => {
    const onGone = () => {
      const at = indexRef.current
      const list = itemsRef.current.filter((_, i) => i !== at)
      replaceItems(list)
      if (at >= list.length) setEnded(true)
      else setIndex(at)
    }
    window.addEventListener('theater-media-gone', onGone)
    return () => window.removeEventListener('theater-media-gone', onGone)
  }, [replaceItems])

  // ——— Tune in: new saves in this moment play next ———
  useMomentStream(
    (event) => {
      if (event.type === 'watching' && event.slug === source.moment) {
        watchingLive.current = true
        setWatching(event.watching)
        if (event.watchers) setWatchers(event.watchers)
      }
      if (event.type === 'reaction' && event.slug === source.moment) {
        const float: FloatingReaction = {
          id: event.id,
          saver: event.saver,
          ...(event.emoji ? { emoji: event.emoji } : { text: event.text }),
        }
        setFloats((list) =>
          list.some((r) => r.id === float.id) ? list : [...list, float].slice(-8),
        )
        window.setTimeout(
          () => setFloats((list) => list.filter((r) => r.id !== float.id)),
          REACTION_MS,
        )
        return
      }
      if (event.type !== 'save' || event.item.to?.kind !== 'moment') return
      if (event.item.to.slug !== source.moment) return
      const key = event.item.key
      const at = indexRef.current
      const existing = itemsRef.current.findIndex((i) => resultKey(i) === key)
      // Already watched: only worth replaying when there's nothing else to watch.
      if (existing !== -1 && existing <= at && !waitingRef.current) return
      const post = event.item.post as unknown as FeedItem
      const arrived: SearchResultItem = {
        // Members are told who just saved it; strangers get the post alone.
        post: event.saver ? { ...post, savers: [event.saver] } : post,
        saved: false,
        matched: [],
        savedAt: event.item.at,
      }
      setArrival(event.saver ? { saver: event.saver, post } : null)
      if (waitingRef.current) {
        // Caught up: it plays now, at the end of the queue (moved there if it was earlier).
        const list = [...itemsRef.current.filter((_, i) => i !== existing), arrived]
        replaceItems(list)
        goTo(list.length - 1)
        if (event.saver) {
          const shown = { saver: event.saver, post, now: true }
          setArrival(shown)
          window.setTimeout(() => setArrival((a) => (a === shown ? null : a)), 5000)
        }
        return
      }
      replaceItems(insertAfter(itemsRef.current, at, [arrived]))
      setArrivals((n) => n + 1)
    },
    source.moment,
    !!source.moment,
  )

  /** "Wander": add posts near the moment that aren't in it. True if any were added. */
  const addWander = useCallback(async (): Promise<boolean> => {
    if (!source.moment) return false
    try {
      const response = await fetch(`/api/moments/${encodeURIComponent(source.moment)}/near`, {
        credentials: 'same-origin',
      })
      if (!response.ok) return false
      const { items: near } = (await response.json()) as { items: FeedItem[] }
      const extra = near.map((post) => ({ post, saved: false, matched: [], wander: true }))
      const list = appendUnique(itemsRef.current, extra)
      if (list.length === itemsRef.current.length) return false
      replaceItems(list)
      return true
    } catch {
      return false
    }
  }, [source.moment, replaceItems])

  /** A reaction to what's playing, for the members tuned in (it comes back on the stream). */
  const sendReaction = useCallback(
    async (reaction: { emoji: ReactionEmoji } | { text: string }) => {
      const post = itemsRef.current[indexRef.current]?.post
      if (!source.moment || !post) return
      setReactOpen(false)
      setReacting(true)
      try {
        const response = await fetch(`/api/moments/${encodeURIComponent(source.moment)}/react`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...reaction, platform: post.platform ?? 'twitter', id: post.id }),
        })
        if (response.status === 429) flash('Easy there. Try again in a moment.')
        else if (!response.ok) flash('That didn’t send. Try again.')
      } catch {
        flash('That didn’t send. Try again.')
      } finally {
        // A short pause between reactions, so a tap can't turn into a flood.
        window.setTimeout(() => setReacting(false), 800)
      }
    },
    [source.moment, flash],
  )

  const toggleWander = useCallback(
    (on: boolean) => {
      setWander(on)
      if (on) {
        void addWander()
        return
      }
      // Back to the moment only: drop wandering posts that haven't played yet.
      const at = indexRef.current
      replaceItems(itemsRef.current.filter((item, i) => i <= at || !item.wander))
    },
    [addWander, replaceItems],
  )

  /** "Stick to this vibe": append posts like `from`. Returns the new queue. */
  const extendWithVibe = useCallback(
    async (from: SearchResultItem): Promise<SearchResultItem[] | null> => {
      if (extendingRef.current) return null
      extendingRef.current = true
      try {
        const more = await fetchResults(similarUrl(from, source, videosOnly))
        const list = appendUnique(itemsRef.current, addedVia(more, from))
        if (list.length === itemsRef.current.length) return null
        replaceItems(list)
        return list
      } catch {
        return null
      } finally {
        extendingRef.current = false
      }
    },
    [source, videosOnly, replaceItems],
  )

  const next = useCallback(async () => {
    if (source.feed && nextIndex(items, index, { repeat: 'off', videosOnly }) === null) {
      // The feed pages in: fetch more before wrapping or ending.
      for (let tries = 0; tries < 3 && feedCursor.current; tries++) {
        await loadMoreFeed()
        const after = nextIndex(itemsRef.current, index, { repeat: 'off', videosOnly })
        if (after !== null) return goTo(after)
      }
      if (source.feed === 'new') {
        // Everything your people saved has been on stage.
        markSeen(currentKeyRef.current)
        setCaughtUp(true)
        return
      }
    }
    const i = nextIndex(items, index, { repeat, videosOnly })
    if (i !== null) return goTo(i)
    if (source.moment) {
      // Tuned in: wander further, or wait here for the next save.
      if (wander && (await addWander())) {
        const after = nextIndex(itemsRef.current, index, { repeat: 'off', videosOnly })
        if (after !== null) return goTo(after)
      }
      setWaiting(true)
      return
    }
    const extended = stick && current ? await extendWithVibe(current) : null
    const after = extended ? nextIndex(extended, index, { repeat: 'off', videosOnly }) : null
    if (after !== null) {
      // Say so: otherwise "4 of 4" quietly becomes "5 of 24".
      flash(
        source.shared
          ? 'Now: more like this, from everyone’s saves'
          : `That’s everything from ${sourceName}. Now: more like the last one`,
        5000,
      )
      return goTo(after)
    }
    setEnded(true)
  }, [
    items,
    index,
    repeat,
    videosOnly,
    stick,
    current,
    goTo,
    extendWithVibe,
    flash,
    sourceName,
    source.moment,
    source.shared,
    source.feed,
    wander,
    addWander,
    loadMoreFeed,
    markSeen,
  ])

  const prev = useCallback(() => {
    if (isVideo && video.progress > 0.1) return stage.seek(0)
    const i = prevIndex(items, index, { videosOnly })
    if (i !== null) goTo(i)
  }, [isVideo, video.progress, items, index, videosOnly, goTo])

  // Paste a link while watching: it's saved and plays next.
  const paste = usePasteToSave({
    onSaved: (post) => {
      const params = new URLSearchParams({
        id: post.id,
        idPlatform: post.platform,
        hideArchived: 'false',
      })
      fetch(`/api/feed?${params}`, { credentials: 'same-origin' })
        .then((r) => (r.ok ? (r.json() as Promise<{ items: FeedItem[] }>) : { items: [] }))
        .then(({ items: found }) => {
          const [post0] = found
          if (!post0) return
          const pasted: SearchResultItem = { post: post0, saved: true, matched: [] }
          const at = indexRef.current
          const wasEmpty = itemsRef.current.length === 0
          replaceItems(insertAfter(itemsRef.current, at, [pasted]))
          setSavedNow((s) => new Set(s).add(post.key))
          goTo(wasEmpty ? 0 : at + 1)
        })
        .catch(() => {})
    },
    savedAction: () => ({ label: 'Add to channel', onClick: () => void save() }),
  })
  const [learningOpen, setLearningOpen] = useState(false)
  const learning = useLearningStatus({ fast: learningOpen })

  const moreLikeThis = useCallback(async (): Promise<boolean> => {
    if (!current) return false
    flash('Finding more like this…')
    try {
      const more = await fetchResults(similarUrl(current, source, videosOnly))
      if (more.length === 0) {
        flash('Nothing like this yet. Try again once more is learned.')
        return false
      }
      // All of them play as one "more like this" run; ones already in the
      // source still count toward its "n of m".
      const own = new Set(itemsRef.current.filter((i) => !i.via || i.fromSource).map(resultKey))
      const tagged = addedVia(more, current, 'more').map((m) =>
        own.has(resultKey(m)) ? { ...m, fromSource: true } : m,
      )
      replaceItems(insertAfter(itemsRef.current, index, tagged))
      flash(`${more.length} more like this, up next`)
      return true
    } catch {
      flash('Couldn’t find more right now')
      return false
    }
  }, [current, source, index, flash, videosOnly, replaceItems])

  // ——— Playback ———
  // A long post is read like an article: no timer, the bar shows how far down you are.
  const timed = !!current && !isVideo && kind !== 'article' && !longPost
  const dwell = useDwell({
    active: timed && !ended && !caughtUp && panel === null && !captionOpen,
    seconds: current ? dwellSeconds(current) : 6,
    paused: timedPaused,
    resetKey: currentKey,
    onDone: () => {
      if (repeat === 'one') dwell.seek(0)
      else void next()
    },
  })
  const paused = isVideo ? !video.playing : timedPaused
  const reading =
    !!current &&
    ((kind === 'article' && hasFullArticle(current.post)) || (kind === 'post' && longPost))
  const progress = isVideo ? video.progress : timed ? dwell.progress : reading ? articleProgress : 0
  const shownMuted = video.muted ?? muted

  const togglePlay = useCallback(() => {
    if (isVideo) return video.playing ? stage.pause() : stage.resume()
    setTimedPaused((p) => !p)
  }, [isVideo, video.playing])

  const toggleMute = useCallback(() => {
    const nextMuted = !shownMuted
    stage.setMuted(nextMuted) // synchronous: iOS only unmutes inside the tap
    setMuted(nextMuted)
  }, [shownMuted])

  const seekTo = (p: number) =>
    isVideo ? stage.seek(p) : reading ? articleSeek.current?.(p) : dwell.seek(p)

  // Tap the picture to pause (the stage itself only ever starts a stopped clip).
  const playingRef = useRef(video.playing)
  playingRef.current = video.playing
  useStageTap(() => {
    if (isVideo && playingRef.current) stage.pause()
    else if (timed) setTimedPaused((p) => !p)
  })

  // Leaving a shared post's loop: what follows plays through.
  const leadReleased = useRef(false)
  useEffect(() => {
    if (!source.shared || leadReleased.current || index === 0) return
    leadReleased.current = true
    setRepeat((r) => (r === 'one' ? 'off' : r))
  }, [source.shared, index])

  // Saved outside the theater (a shared page saves its post on open).
  useEffect(() => {
    const onSaved = (e: Event) => {
      const key = (e as CustomEvent<{ key?: string }>).detail?.key
      if (key) setSavedNow((s) => new Set(s).add(key))
    }
    window.addEventListener(NX_POST_SAVED, onSaved)
    return () => window.removeEventListener(NX_POST_SAVED, onSaved)
  }, [])

  // Tuning in explains itself for 8 seconds, then folds into the small chip.
  const [tuneIntro, setTuneIntro] = useState(true)
  useEffect(() => {
    if (!source.moment) return
    setTuneIntro(true)
    const t = window.setTimeout(() => setTuneIntro(false), 8000)
    return () => window.clearTimeout(t)
  }, [source.moment])

  // While the share sheet is up the video waits, so it can't end mid-send.
  const pausedForShare = useRef(false)
  useEffect(() => {
    if (panel === 'share') {
      if (isVideo && playingRef.current) {
        stage.pause()
        pausedForShare.current = true
      }
    } else if (pausedForShare.current) {
      pausedForShare.current = false
      stage.resume()
    }
  }, [panel, isVideo])

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    else void rootRef.current?.requestFullscreen?.().catch(() => {})
  }, [])
  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  // ——— Actions ———
  const ensureSaved = useCallback(
    async (opts: { private?: boolean } = {}): Promise<boolean> => {
      if (!current) return false
      if (saved) return true
      const url = sourceUrl(
        current.post.platform ?? 'twitter',
        current.post.author,
        current.post.id,
        kind === 'photo' ? 'photo' : null,
      )
      if (!url) return false
      try {
        const res = await fetch('/api/bookmarks/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(opts.private ? { url, private: true } : { url }),
        })
        if (res.status === 401) {
          // Signed out: sign in, then land on this post's own page, which
          // saves it (`?save=1`), whichever queue it was playing in.
          const returnTo = `${previewPath(
            current.post.platform ?? 'twitter',
            current.post.author,
            current.post.id,
            kind === 'photo' ? 'photo' : null,
          )}?save=1`
          window.location.assign(`/start?${new URLSearchParams({ returnTo })}`)
          return false
        }
        const data = (await res.json().catch(() => null)) as { error?: string } | null
        if (!res.ok || data?.error) throw new Error(data?.error || 'save failed')
        setSavedNow((s) => new Set(s).add(currentKey))
        if (opts.private) setPrivateNow((m) => new Map(m).set(currentKey, true))
        window.dispatchEvent(new CustomEvent(NX_POST_SAVED, { detail: { key: currentKey } }))
        return true
      } catch {
        flash('Couldn’t save that. Try again.')
        return false
      }
    },
    [current, saved, kind, currentKey, flash],
  )

  /** "Just for me": save it privately, or switch an existing save. */
  const [privateBusy, setPrivateBusy] = useState(false)
  const setPostPrivate = useCallback(
    async (on: boolean) => {
      if (!current || privateBusy) return
      setPrivateBusy(true)
      try {
        if (!saved) {
          if (on && (await ensureSaved({ private: true }))) flash('Saved just for you')
          return
        }
        const res = await fetch(`/api/bookmarks/${encodeURIComponent(current.post.id)}/private`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ platform: current.post.platform ?? 'twitter', private: on }),
        })
        const data = (await res.json().catch(() => null)) as { private?: boolean } | null
        if (!res.ok || typeof data?.private !== 'boolean') throw new Error('private failed')
        setPrivateNow((m) => new Map(m).set(currentKey, data.private!))
        flash(data.private ? 'Just for you now' : 'Shared with your people')
      } catch {
        flash('Couldn’t change that. Try again.')
      } finally {
        setPrivateBusy(false)
      }
    },
    [current, privateBusy, saved, ensureSaved, currentKey, flash],
  )

  /** Save (if needed) and open "add to a channel". */
  const save = useCallback(async () => {
    if (!(await ensureSaved())) return
    setCreated(null)
    setPanel('save')
    if (channels === null) {
      fetch('/api/tags', { credentials: 'same-origin' })
        .then((r) => (r.ok ? (r.json() as Promise<{ tags: ChannelOption[] }>) : { tags: [] }))
        .then((d) =>
          setChannels(d.tags.map((t) => ({ tag: t.tag, count: t.count, isPublic: t.isPublic }))),
        )
        .catch(() => setChannels([]))
    }
  }, [ensureSaved, channels])

  const currentTags = useMemo(
    () => postTags.get(currentKey) ?? new Set(current?.saved ? current.post.tags : []),
    [postTags, currentKey, current],
  )

  const tagRequest = useCallback(
    async (tag: string, on: boolean) => {
      if (!current) return false
      const res = await fetch(
        `/api/bookmarks/${encodeURIComponent(current.post.id)}/tags?platform=${encodeURIComponent(current.post.platform ?? 'twitter')}`,
        {
          method: on ? 'POST' : 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tag }),
        },
      )
      const data = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) {
        flash(data?.error ?? 'Couldn’t change that channel')
        return false
      }
      setPostTags((m) => {
        const next = new Map(m)
        const set = new Set(m.get(currentKey) ?? currentTags)
        if (on) set.add(tag)
        else set.delete(tag)
        next.set(currentKey, set)
        return next
      })
      setChannels((list) => {
        const rows = list ?? []
        const known = rows.some((c) => c.tag === tag)
        const updated = rows.map((c) =>
          c.tag === tag ? { ...c, count: Math.max(0, c.count + (on ? 1 : -1)) } : c,
        )
        return known || !on ? updated : [{ tag, count: 1, isPublic: false }, ...updated]
      })
      return true
    },
    [current, currentKey, currentTags, flash],
  )

  const toggleChannel = useCallback(
    async (tag: string, on: boolean) => {
      setChannelBusy(tag)
      try {
        await tagRequest(tag, on)
      } finally {
        setChannelBusy(null)
      }
    },
    [tagRequest],
  )

  const createChannel = useCallback(
    async (name: string) => {
      const tag = sanitizeTag(name)
      if (!tag) return
      setChannelBusy(tag)
      try {
        if (!(await tagRequest(tag, true))) return
        // New channels are public by default, so the link works right away.
        const res = await fetch('/api/tags', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tag, isPublic: true }),
        })
        const data = (await res.json().catch(() => null)) as { shareUrl?: string } | null
        setChannels((list) =>
          (list ?? []).map((c) => (c.tag === tag ? { ...c, isPublic: res.ok } : c)),
        )
        setCreated({ tag, shareUrl: res.ok ? (data?.shareUrl ?? null) : null })
      } finally {
        setChannelBusy(null)
      }
    },
    [tagRequest],
  )

  const publicUrl = useCallback(
    () =>
      current
        ? `${window.location.origin}${previewPath(current.post.platform ?? 'twitter', current.post.author, current.post.id, kind === 'photo' ? 'photo' : null)}`
        : '',
    [current, kind],
  )

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(publicUrl())
      flash('Link copied')
    } catch {
      flash('Couldn’t copy the link')
    }
  }, [publicUrl, flash])

  /** Share: always this post's page — the share sheet on phones, else the link is copied. */
  /** Share opens the share sheet (link, Copy link, the device's own sheet). */
  const shareIt = useCallback(() => setPanel('share'), [])

  /**
   * Download: the picture or video itself (on phones, the share sheet with
   * the file, which is how you save it); for words — posts and articles —
   * the text is copied.
   */
  // "Copy the text": a tick on the button for 2 seconds says it worked.
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const t = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(t)
  }, [copied])
  useEffect(() => setCopied(false), [currentKey])

  const downloadIt = useCallback(async () => {
    if (!current) return
    if (send.supported) {
      const wasPlaying = isVideo && playingRef.current
      if (wasPlaying) stage.pause()
      const ok = await send.send()
      if (wasPlaying) stage.resume()
      if (!ok && send.primed) flash('Ready. Tap Download again to save it.')
      return
    }
    let text = postBody(current.post)
    if (kind === 'article' && hasFullArticle(current.post)) {
      const markdown = await fetchArticleMarkdown(current.post.author, current.post.id)
      if (markdown) text = composeArticleCopy(articleHeadline(current.post), markdown)
    }
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true) // the copy icon turns into a tick for a moment
    } catch {
      flash('Couldn’t copy the text')
    }
  }, [current, send, kind, flash, isVideo])

  const archive = useCallback(async () => {
    if (!current?.saved) return
    try {
      const res = await fetch(
        `/api/bookmarks/${encodeURIComponent(current.post.id)}/read?platform=${encodeURIComponent(current.post.platform ?? 'twitter')}`,
        { method: 'POST' },
      )
      if (!res.ok) throw new Error('archive failed')
      flash('Archived')
      void next()
    } catch {
      flash('Couldn’t archive that')
    }
  }, [current, flash, next])

  // ——— The blended feed ———
  /** Everyone · Friends only · Mine (and "Watch it all again" → Everyone). */
  const switchFeed = useCallback((mode: BlendMode) => router.push(feedPlayHref(mode)), [router])

  /** "What's in your feed": remember the choice and reload the feed with it. */
  const changeTypes = useCallback(
    (types: FeedKind[]) => {
      setTypesChoice({ source, types })
      setShownTypes(types)
      void fetch('/api/feed/types', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ types }),
      }).catch(() => {})
    },
    [source],
  )

  /** Caught up, with other kinds still unseen: play just those, this once. */
  const showWaiting = useCallback(() => {
    const kinds = FEED_KINDS.filter((k) => (feedWaiting[k] ?? 0) > 0)
    if (kinds.length) router.push(feedPlayHref('new', kinds))
  }, [feedWaiting, router])

  // Caught up: the card replaces the stage, so the clip behind it stops.
  useEffect(() => {
    if (caughtUp) stage.pause()
  }, [caughtUp])

  const openWhy = useCallback(() => {
    setPanel('why')
    if (weights !== null) return
    fetch('/api/feed/weights', { credentials: 'same-origin' })
      .then((r) => (r.ok ? (r.json() as Promise<{ weights: Record<string, FeedWeight> }>) : null))
      .then((d) => setWeights(d?.weights ?? {}))
      .catch(() => setWeights({}))
  }, [weights])

  const setFriendWeight = useCallback(
    async (friend: WhyFriend, weight: FeedWeight) => {
      setWeightBusy(friend.username)
      try {
        const res = await fetch('/api/feed/weights', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: friend.username, weight }),
        })
        const data = (await res.json().catch(() => null)) as {
          weights?: Record<string, FeedWeight>
        } | null
        if (!res.ok || !data?.weights) throw new Error('weights failed')
        setWeights(data.weights)
        flash(
          weight === 1
            ? `More from ${friend.name} from now on`
            : weight === -1
              ? `Less from ${friend.name} from now on`
              : `${friend.name} is back to normal`,
        )
      } catch {
        flash('Couldn’t change that. Try again.')
      } finally {
        setWeightBusy(null)
      }
    },
    [flash],
  )

  // ——— Keyboard (desktop) and swipes (phones) ———
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target instanceof Element ? e.target : null
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (panel) return
      if (t?.closest('input, textarea, select, [contenteditable="true"]')) return
      const k = e.key
      if (k === ' ' || k === 'k') {
        e.preventDefault()
        togglePlay()
      } else if ((k === 'ArrowUp' || k === 'ArrowDown') && kindRef.current === 'article') {
        // Up and down scroll the article being read.
        return
      } else if (k === 'ArrowRight' || k === 'ArrowDown' || k === 'j') {
        e.preventDefault()
        void next()
      } else if (k === 'ArrowLeft' || k === 'ArrowUp') {
        e.preventDefault()
        prev()
      } else if (k === 'm') toggleMute()
      else if (k === 'f') toggleFullscreen()
      else if (k === 'q') setPanel('queue')
      else if (k === '/') {
        e.preventDefault()
        focusHeaderSearch()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [panel, togglePlay, next, prev, toggleMute, toggleFullscreen, router, source.search])

  const swipe = useMobileSwipeNavigation({
    disabled: panel !== null,
    canPrev: index > 0,
    canNext: true,
    onPrev: prev,
    onNext: () => void next(),
  })

  // ——— Render ———
  const back = backHref(source)
  const navHere = source.shared
    ? null
    : source.feed
      ? 'new'
      : source.moment
        ? 'now'
        : isChannelSource(source)
          ? 'channels'
          : source.recent
            ? 'saves'
            : 'search'
  if (load.status === 'ready' && !current && source.feed === 'new' && caughtUp) {
    // Opened New with nothing left you haven't seen.
    return (
      <div className="flex min-h-dvh flex-col bg-nx-stage font-nx-sans text-nx-cream">
        <NxHeader current={navHere} />
        <main className="flex flex-1 flex-col pb-20 md:pb-0">
          <CaughtUpStage
            className="flex-1"
            onWatchAgain={() => switchFeed('everyone')}
            waiting={feedWaiting}
            onShowWaiting={showWaiting}
          />
        </main>
      </div>
    )
  }
  if (load.status !== 'ready' || !current) {
    const empty = emptyState(source, load)
    return (
      <div className="flex min-h-dvh flex-col bg-nx-stage font-nx-sans text-nx-cream">
        <NxHeader current={navHere} />
        <main className="flex flex-1 flex-col items-center justify-center gap-5 px-6 pb-24 text-center">
          {load.status === 'loading' ? (
            <AdhxLoader label="Lining them up…" />
          ) : (
            <>
              <span className="font-nx-serif text-[34px] leading-tight">{empty.title}</span>
              <span className="max-w-[440px] text-[15px] text-white/70">{empty.body}</span>
              <span className="flex flex-wrap justify-center gap-2.5">
                {empty.retry && (
                  <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="rounded-full bg-nx-accent px-5 py-3 text-sm font-bold text-nx-ink"
                  >
                    Try again
                  </button>
                )}
                {empty.paste ? (
                  <PasteButton
                    onClick={paste.pasteFromClipboard}
                    className="h-auto px-5 py-3 text-sm"
                  />
                ) : (
                  <Link
                    href={empty.href}
                    className={
                      empty.retry
                        ? 'rounded-full border border-white/30 px-5 py-3 text-sm font-bold text-white'
                        : 'rounded-full bg-nx-accent px-5 py-3 text-sm font-bold text-nx-ink'
                    }
                  >
                    {empty.action}
                  </Link>
                )}
              </span>
            </>
          )}
        </main>
        {paste.toast}
      </div>
    )
  }

  // Why it's here, as a chip; "Ana saved this · 1h" alone is already the faces line.
  const whyFirst = current.post.whyReasons?.[0]?.kind
  const whyChip =
    !!current.post.why &&
    !((whyFirst === 'fresh' || whyFirst === 'yours') && savers && savers.length > 0)
  const author = postAuthor(current.post)
  const caption = postText(current.post)
  const overlay = kind === 'post' || kind === 'article'
  const textOnly = !send.supported
  const menu: MenuRow[] = [
    // The blended feed says why each post is here.
    ...(current.post.why ? [{ label: 'Why this one', onSelect: openWhy }] : []),
    { label: 'Add to a channel', onSelect: () => void save() },
    { label: 'Copy link', onSelect: () => void copyLink() },
    // Members only (savers come with a session): keep this save to yourself.
    ...(saved || savers
      ? [
          {
            label: 'Just for me',
            value: isPrivate ? 'On' : 'Off',
            checked: isPrivate,
            onSelect: () => void setPostPrivate(!isPrivate),
          },
        ]
      : []),
    {
      label: 'Repeat',
      value: REPEAT_LABELS[repeat],
      onSelect: () => setRepeat((r) => REPEAT_ORDER[(REPEAT_ORDER.indexOf(r) + 1) % 3]),
    },
    {
      label: 'Videos only',
      value: videosOnly ? 'On' : 'Off',
      checked: videosOnly,
      onSelect: () => setVideosOnly((v) => !v),
    },
    {
      label: 'Stick to this vibe',
      value: stick ? 'On' : 'Off',
      checked: stick,
      onSelect: () => setStick((v) => !v),
    },
    ...(current.saved ? [{ label: 'Archive', danger: true, onSelect: () => void archive() }] : []),
  ]

  // Where the post came from: its network's mark on the rail opens the original.
  const originalUrl = sourceUrl(
    current.post.platform ?? 'twitter',
    current.post.author,
    current.post.id,
    kind === 'photo' ? 'photo' : null,
  )
  const networkName = networkLabel(current.post.platform)

  return (
    <>
      <div
        ref={rootRef}
        className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] top-0 z-40 overflow-hidden bg-nx-stage font-nx-sans text-white md:bottom-0 md:top-20"
        onTouchStart={swipe.onTouchStart}
        onTouchMove={swipe.onTouchMove}
        onTouchEnd={swipe.onTouchEnd}
        onTouchCancel={swipe.onTouchCancel}
      >
        <div className="absolute inset-0">
          <Stage
            item={theaterItem}
            muted={muted}
            onRequestUnmute={() => setMuted(false)}
            onEnded={() => void next()}
            photoCaption={false}
            repeat={repeat === 'one'}
            covered={overlay || caughtUp || (panel !== null && !isVideo)}
          />
          {kind === 'post' && (
            // Room on the right so the rail never sits on the words.
            <div className="absolute inset-0 bg-nx-cream pb-28 pr-[68px] pt-14 md:pb-24 md:pr-24 md:pt-16">
              <PostStage
                item={current.post}
                onLong={setLongPost}
                onScrollProgress={setArticleProgress}
                seekRef={articleSeek}
              />
            </div>
          )}
          {kind === 'article' &&
            (hasFullArticle(current.post) ? (
              // The whole article, right on the stage: scroll to read, Next or Skip to move on.
              <div className="absolute inset-0 bg-nx-ink pb-24 pr-[68px] pt-14 md:pb-20 md:pr-24 md:pt-16">
                <ArticleReader
                  item={current.post}
                  inline
                  onNext={() => void next()}
                  onProgress={setArticleProgress}
                  seekRef={articleSeek}
                />
              </div>
            ) : (
              <div className="absolute inset-0 bg-nx-ink pb-28 pr-[68px] pt-14 md:pb-24 md:pr-24 md:pt-16">
                <ArticleStage item={current.post} onSkip={() => void next()} />
              </div>
            ))}
        </div>

        {source.feed && (
          // Below xl, whose saves and what's in the feed sit on the stage (the header has no room).
          <div className="pointer-events-none absolute inset-x-3 top-[max(64px,calc(env(safe-area-inset-top)+56px))] z-20 flex flex-wrap items-start gap-2 md:left-7 md:right-24 md:top-4 xl:hidden">
            <FeedSwitch mode={source.feed} onChange={switchFeed} className="pointer-events-auto" />
            <FeedTypesControl
              types={shownTypes}
              onChange={changeTypes}
              className="pointer-events-auto"
            />
          </div>
        )}
        {/* Where this queue is from and what's playing, in one row at the stage's top-left. */}
        <div
          className={cn(
            'pointer-events-none absolute inset-x-3 top-[max(64px,calc(env(safe-area-inset-top)+56px))] z-10 flex flex-wrap items-start gap-2 md:left-7 md:right-24 md:top-4',
            // Below xl the feed's own controls take the first row.
            source.feed &&
              'top-[max(116px,calc(env(safe-area-inset-top)+108px))] md:top-[68px] xl:top-4',
            // On a cream page see-through chips turn muddy grey: make them solid,
            // and on desktop join them into one pill split by thin lines.
            overlay &&
              '[&_.nx-plate]:!bg-[#1c1b19] [&_.nx-plate]:![backdrop-filter:none] [&_.nx-plate]:![text-shadow:none] [&_.nx-plate]:!shadow-none md:right-auto md:flex-nowrap md:items-stretch md:gap-0 md:divide-x md:divide-white/15 md:overflow-hidden md:rounded-[20px] md:bg-[#1c1b19] md:[&>*]:!rounded-none md:[&>*]:!bg-transparent md:[&>*]:!text-white',
          )}
        >
          {!source.recent && !source.shared && !source.feed && (
            <Link
              href={back}
              className="nx-plate pointer-events-auto hidden h-9 min-w-0 max-w-[320px] items-center gap-1.5 rounded-full pl-2 pr-4 text-[13px] font-bold md:flex"
            >
              <ChevronLeft aria-hidden className="h-4 w-4 shrink-0" />
              <span className="truncate">{title ?? (source.search.q || 'Search')}</span>
            </Link>
          )}
          {whyChip && <WhyChip post={current.post} onOpen={openWhy} />}
          {overlay && (isPrivate || (savers && savers.length > 0)) && (
            // Who saved it, by the chips: text and article stages have no byline scrim.
            <span className="pointer-events-auto flex h-9 min-w-0 items-center gap-1.5">
              {isPrivate && <PrivateLock className="h-7 w-7" />}
              {savers && savers.length > 0 && (
                <SaversButton
                  savers={savers}
                  tone="plate"
                  placement="below"
                  className="h-9 max-w-[280px]"
                  facesClassName="h-9 pl-1.5 pr-3.5"
                />
              )}
            </span>
          )}
          {source.moment && (kind === 'post' || kind === 'article' || !tuneIntro) && (
            // A small chip, so nothing covers the post (after the first few seconds on media).
            <button
              type="button"
              onClick={() => toggleWander(!wander)}
              aria-pressed={wander}
              className="nx-plate pointer-events-auto hidden h-9 items-center gap-2 rounded-full px-3.5 text-[13px] font-bold md:flex"
            >
              <Radio
                aria-hidden
                className="h-4 w-4"
                style={{ color: momentHue }}
                strokeWidth={2.4}
              />
              <span>{wander ? 'Tuned in · Wandering' : 'Tuned in · Staying close'}</span>
            </button>
          )}
          {source.moment && (kind === 'post' || kind === 'article') && current?.savedAt && (
            <span
              className={cn(
                'hidden h-9 items-center rounded-full px-3.5 text-[13px] font-extrabold md:flex',
                Date.now() - Date.parse(current.savedAt) < 3_600_000 ? 'text-black' : 'nx-plate',
              )}
              style={
                Date.now() - Date.parse(current.savedAt) < 3_600_000
                  ? { background: momentHue }
                  : undefined
              }
            >
              {Date.now() - Date.parse(current.savedAt) < 3_600_000
                ? `Just saved · ${timeAgo(current.savedAt)}`
                : `Saved ${timeAgo(current.savedAt)}`}
            </span>
          )}
          {source.moment && kind !== 'post' && kind !== 'article' && tuneIntro && (
            <div
              role="note"
              className="nx-plate pointer-events-auto hidden w-[330px] flex-col gap-2.5 rounded-2xl px-4 py-3.5 md:flex"
            >
              <span className="flex items-center gap-2 text-sm font-extrabold">
                <Radio
                  aria-hidden
                  className="h-4 w-4"
                  style={{ color: momentHue }}
                  strokeWidth={2.4}
                />
                <span>Tuned in</span>
              </span>
              <span className="text-[13px] leading-[1.4] text-white/75">
                Playing what people are saving like this, newest first. It keeps going as new saves
                land.
              </span>
              <div
                role="group"
                aria-label="How close to stay"
                className="flex gap-1 rounded-full bg-white/10 p-[3px]"
              >
                {[
                  { on: !wander, label: 'Stay close', pick: () => toggleWander(false) },
                  { on: wander, label: 'Wander', pick: () => toggleWander(true) },
                ].map((b) => (
                  <button
                    key={b.label}
                    type="button"
                    aria-pressed={b.on}
                    onClick={b.pick}
                    className={cn(
                      'h-8 flex-1 rounded-full text-[13px] font-bold',
                      b.on ? 'bg-white text-black' : 'text-white',
                    )}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
              <span className="text-xs text-white/60">
                {wander
                  ? 'This moment first, then drifting to posts near it.'
                  : 'Only this moment. New saves play as they land.'}
              </span>
            </div>
          )}
          {source.moment && watchers.length > 0 && (
            // Members only: the server names watchers to signed-in members alone.
            <WatchersBar watchers={watchers} className="pointer-events-auto" />
          )}
          {!source.moment && position.via && (
            // Not from the source: say what it is like and why it's playing.
            <div
              role="note"
              className="nx-plate flex min-w-0 max-w-full items-center gap-2.5 rounded-2xl py-2 pl-3 pr-4 md:max-w-[420px]"
            >
              <Sparkles
                aria-hidden
                className="h-4 w-4 shrink-0 text-nx-accent"
                fill="currentColor"
              />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-bold">{viaLabel(position.via)}</span>
                <span className="truncate text-xs text-white/65">
                  {`${viaReason(position.via, source.shared ? 'post' : isChannelSource(source) ? 'channel' : source.recent ? 'saves' : 'search')} · ${position.n} of ${position.of}`}
                </span>
              </span>
            </div>
          )}
        </div>

        {source.moment && arrival && (arrival.now || arrivals === 1) && (
          <ArrivalToast
            saver={arrival.saver}
            post={arrival.post}
            hue={momentHue}
            now={arrival.now}
            onPlay={arrival.now ? undefined : () => goTo(index + 1)}
            className="absolute right-3 top-[max(76px,calc(env(safe-area-inset-top)+64px))] z-30 max-w-[calc(100%-24px)] md:right-24 md:top-4"
          />
        )}
        {source.moment && arrivals > 0 && !(arrivals === 1 && arrival) && (
          <div
            role="status"
            className="absolute left-1/2 top-[max(76px,calc(env(safe-area-inset-top)+64px))] z-30 flex md:top-16 -translate-x-1/2 items-center gap-3 whitespace-nowrap rounded-full bg-[#1c1b19]/95 py-2 pl-4 pr-2 text-sm shadow-nx-toast animate-nx-slide-in"
          >
            <span
              aria-hidden
              className="block h-2 w-2 rounded-full"
              style={{ background: momentHue }}
            />
            <span>
              <b>{arrivals === 1 ? '1 new save' : `${arrivals} new saves`}</b>
              {arrivals === 1 ? ' just landed. It’s up next.' : ' just landed. They’re up next.'}
            </span>
            <button
              type="button"
              onClick={() => goTo(index + 1)}
              className="h-8 rounded-full px-3 text-[13px] font-extrabold text-black"
              style={{ background: momentHue }}
            >
              Play now
            </button>
          </div>
        )}

        {source.moment && waiting && (
          // Dim what's behind, so the note doesn't read over the last post.
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-[5] bg-black/60 backdrop-blur-[2px]"
          />
        )}
        {source.moment && waiting && (
          <div
            role="status"
            className="nx-plate absolute left-1/2 top-1/2 z-20 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2 rounded-3xl px-6 py-5 text-center"
          >
            <span
              aria-hidden
              className="block h-3 w-3 rounded-full animate-nx-live-pulse"
              style={{ background: momentHue }}
            />
            <span className="font-nx-serif text-[28px]">You’re all caught up</span>
            <span className="text-sm text-white/75">New saves play here as they land.</span>
          </div>
        )}

        {source.moment && member && (
          // Rising from just above the bottom bar, clear of the rail.
          <ReactionFloats
            reactions={floats}
            className="absolute bottom-[200px] left-0 right-[72px] z-20 md:bottom-[150px] md:right-28"
          />
        )}
        {source.moment && member && reactOpen && (
          <ReactionPicker
            onEmoji={(emoji) => void sendReaction({ emoji })}
            onText={(text) => void sendReaction({ text })}
            onClose={() => setReactOpen(false)}
            disabled={reacting}
            className="absolute inset-x-3 bottom-[max(16px,env(safe-area-inset-bottom))] z-40 md:inset-x-auto md:bottom-auto md:right-24 md:top-1/2 md:w-[400px] md:-translate-y-1/2"
          />
        )}

        <nav
          aria-label="Post actions"
          className="absolute bottom-[164px] right-3 z-10 flex flex-col gap-3 md:bottom-auto md:right-6 md:top-1/2 md:-translate-y-1/2"
        >
          {source.moment && member && (
            <ReactButton open={reactOpen} onToggle={() => setReactOpen((o) => !o)} />
          )}
          {originalUrl && (
            <a
              href={originalUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open on ${networkName}`}
              title={`Open on ${networkName}`}
              data-network={current.post.platform ?? 'twitter'}
              className="nx-plate flex h-12 w-12 items-center justify-center rounded-full text-white md:h-[52px] md:w-[52px]"
            >
              <NetworkIcon platform={current.post.platform} className="h-[20px] w-[20px]" />
            </a>
          )}
          <RailButton label="More like this" onClick={() => void moreLikeThis()} active>
            <Sparkles
              aria-hidden
              className="h-[22px] w-[22px]"
              fill="currentColor"
              strokeWidth={1.5}
            />
          </RailButton>
          <RailButton
            label={saved ? 'Saved. Add to a channel' : 'Save'}
            onClick={() => void save()}
            active={saved}
          >
            <Bookmark
              aria-hidden
              className="h-[22px] w-[22px]"
              fill={saved ? 'currentColor' : 'none'}
            />
          </RailButton>
          {copied && (
            <span role="status" className="sr-only">
              {kind === 'article' ? 'Article copied' : 'Text copied'}
            </span>
          )}
          <RailButton label="Share" onClick={shareIt}>
            <Send aria-hidden className="h-[21px] w-[21px]" />
          </RailButton>
          <RailButton
            label={
              textOnly
                ? copied
                  ? 'Copied'
                  : kind === 'article'
                    ? 'Copy the article'
                    : 'Copy the text'
                : 'Download'
            }
            onClick={() => void downloadIt()}
          >
            {textOnly ? (
              copied ? (
                <Check aria-hidden className="h-[22px] w-[22px] text-nx-accent" strokeWidth={2.6} />
              ) : (
                <Copy aria-hidden className="h-[21px] w-[21px]" />
              )
            ) : (
              <Download
                aria-hidden
                className={cn('h-[21px] w-[21px]', send.sending && 'animate-pulse')}
              />
            )}
          </RailButton>
          <RailButton label="Up next" onClick={() => setPanel(panel === 'queue' ? null : 'queue')}>
            <ListVideo aria-hidden className="h-[22px] w-[22px]" />
          </RailButton>
          <RailButton
            label="More options"
            onClick={() => setPanel(panel === 'more' ? null : 'more')}
          >
            <Ellipsis aria-hidden className="h-[22px] w-[22px]" />
          </RailButton>
        </nav>

        <div
          className={cn(
            // One bar in one place for every kind: the same fade, padding and buttons.
            // Taps fall through to the stage except on the controls and caption.
            'nx-scrim pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col gap-2.5 px-4 pb-[max(14px,env(safe-area-inset-bottom))] pt-20 md:gap-3 md:px-7 md:pb-5',
          )}
        >
          {!overlay && (
            <div className="nx-text-shadow flex max-w-[calc(100%-64px)] items-end gap-3 md:max-w-[760px]">
              <NxAvatar author={author} size={40} className="border-2 border-white" />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-2 text-[15px] font-bold">
                  <span>{author.handle || author.name}</span>
                  {isPrivate && <PrivateLock tone="scrim" />}
                  {current.savedAt && (
                    <span
                      className={cn(
                        'rounded-full px-2.5 py-0.5 text-xs font-extrabold [text-shadow:none]',
                        Date.now() - Date.parse(current.savedAt) < 3_600_000
                          ? 'text-black'
                          : 'nx-plate',
                      )}
                      style={
                        Date.now() - Date.parse(current.savedAt) < 3_600_000
                          ? { background: momentHue }
                          : undefined
                      }
                    >
                      {Date.now() - Date.parse(current.savedAt) < 3_600_000
                        ? `Just saved · ${timeAgo(current.savedAt)}`
                        : `Saved ${timeAgo(current.savedAt)}`}
                    </span>
                  )}
                  {current.wander && (
                    <span className="nx-plate rounded-full px-2.5 py-0.5 text-xs font-bold">
                      Wandering
                    </span>
                  )}
                </span>
                {savers && savers.length > 0 && <SaversButton savers={savers} tone="scrim" />}
                {caption &&
                  (captionOpen ? (
                    <span className="pointer-events-auto block max-h-[42vh] overflow-y-auto pr-2 text-[15px] leading-[1.45] md:text-[17px]">
                      <RichText
                        text={postBody(current.post)}
                        platform={current.post.platform ?? 'twitter'}
                      />
                      <button
                        type="button"
                        onClick={() => setCaptionOpen(false)}
                        className="mt-1.5 text-[13px] font-bold text-white/80 underline underline-offset-2"
                      >
                        Show less
                      </button>
                    </span>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setCaptionOpen(true)}
                        aria-label="Show the full caption"
                        className="pointer-events-auto line-clamp-2 text-left text-[15px] leading-[1.35] md:text-[17px]"
                      >
                        {caption}
                      </button>
                      {caption.length > 110 && (
                        <button
                          type="button"
                          onClick={() => setCaptionOpen(true)}
                          className="pointer-events-auto mt-0.5 self-start text-[13px] font-bold text-white/85 underline underline-offset-2"
                        >
                          More
                        </button>
                      )}
                    </>
                  ))}
              </span>
            </div>
          )}
          <div className={cn('pointer-events-auto flex flex-col gap-1')}>
            <label htmlFor="nx-seek" className="sr-only">
              Seek
            </label>
            <input
              id="nx-seek"
              type="range"
              min={0}
              max={1000}
              value={Math.round(progress * 1000)}
              onChange={(e) => seekTo(Number(e.target.value) / 1000)}
              disabled={kind === 'article' && !reading}
              className="nx-seek h-3.5 w-full cursor-pointer accent-nx-accent"
            />
            <div className="flex items-center gap-0.5 md:gap-1">
              <ControlButton label="Previous" onClick={prev}>
                <SkipBack aria-hidden className="h-5 w-5" fill="currentColor" />
              </ControlButton>
              <ControlButton
                label={paused ? 'Play' : 'Pause'}
                onClick={togglePlay}
                className="h-12 w-12"
              >
                {paused ? (
                  <Play aria-hidden className="h-6 w-6" fill="currentColor" strokeWidth={0} />
                ) : (
                  <Pause aria-hidden className="h-6 w-6" fill="currentColor" strokeWidth={0} />
                )}
              </ControlButton>
              <ControlButton label="Next" onClick={() => void next()}>
                <SkipForward aria-hidden className="h-5 w-5" fill="currentColor" />
              </ControlButton>
              <ControlButton
                label={shownMuted ? 'Unmute' : 'Mute'}
                onClick={toggleMute}
                className="hidden md:flex"
              >
                {shownMuted ? (
                  <VolumeX aria-hidden className="h-5 w-5" />
                ) : (
                  <Volume2 aria-hidden className="h-5 w-5" />
                )}
              </ControlButton>
              <label htmlFor="nx-volume" className="sr-only">
                Volume
              </label>
              <input
                id="nx-volume"
                type="range"
                min={0}
                max={100}
                value={shownMuted ? 0 : Math.round(volume * 100)}
                onChange={(e) => {
                  const v = Number(e.target.value) / 100
                  setVolume(v)
                  stage.setVolume(v)
                  if (v > 0 && shownMuted) {
                    stage.setMuted(false)
                    setMuted(false)
                  }
                }}
                className="hidden w-[90px] accent-white md:block"
              />
              <span className="ml-2 text-[13px] tabular-nums text-white/85">
                {isVideo && video.duration
                  ? `${clock(video.progress * video.duration)} / ${clock(video.duration)}`
                  : timed
                    ? `${clock(dwell.progress * dwellSeconds(current))} / ${clock(dwellSeconds(current))}`
                    : reading
                      ? `${Math.round(articleProgress * 100)}% read`
                      : ''}
              </span>
              <span className="flex-1" />
              <ControlButton
                label={`Repeat: ${REPEAT_LABELS[repeat]}`}
                pressed={repeat !== 'off'}
                onClick={() => setRepeat((r) => REPEAT_ORDER[(REPEAT_ORDER.indexOf(r) + 1) % 3])}
                className={cn('relative hidden md:flex', repeat !== 'off' && 'text-nx-accent')}
              >
                <Repeat aria-hidden className="h-5 w-5" />
                {repeat === 'one' && (
                  <span
                    aria-hidden
                    className="absolute right-1.5 top-1.5 rounded-full bg-nx-accent px-1 text-[9px] font-bold leading-[14px] text-black"
                  >
                    1
                  </span>
                )}
              </ControlButton>
              {isVideo && video.pip.supported && (
                <ControlButton
                  label="Picture in picture"
                  pressed={video.pip.active}
                  onClick={stage.togglePip}
                >
                  <PictureInPicture2 aria-hidden className="h-5 w-5" />
                </ControlButton>
              )}
              <ControlButton
                label={fullscreen ? 'Exit full screen' : 'Full screen'}
                onClick={toggleFullscreen}
                className="hidden md:flex"
              >
                {fullscreen ? (
                  <Minimize aria-hidden className="h-5 w-5" />
                ) : (
                  <Maximize aria-hidden className="h-5 w-5" />
                )}
              </ControlButton>
            </div>
          </div>
        </div>

        {ended && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-black/75 px-6 text-center">
            <span className="font-nx-serif text-[32px]">{`That’s all ${items.length}`}</span>
            <div className="flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={() =>
                  void moreLikeThis().then((added) => {
                    if (added) goTo(index + 1)
                  })
                }
                className="rounded-full bg-nx-accent px-5 py-3 text-sm font-bold text-nx-ink"
              >
                Keep going with more like this
              </button>
              <button
                type="button"
                onClick={() => goTo(0)}
                className="rounded-full border border-white/30 px-5 py-3 text-sm"
              >
                Play again
              </button>
              <Link href={back} className="rounded-full border border-white/30 px-5 py-3 text-sm">
                {source.feed ? 'Browse channels' : 'Back to search'}
              </Link>
            </div>
          </div>
        )}

        {caughtUp && (
          <CaughtUpStage
            className="absolute inset-0 z-20"
            onWatchAgain={() => switchFeed('everyone')}
            waiting={feedWaiting}
            onShowWaiting={showWaiting}
          />
        )}

        {panel === 'queue' && (
          <UpNextSheet
            items={items}
            current={index}
            onPlay={(i) => {
              goTo(i)
              setPanel(null)
            }}
            onClose={() => setPanel(null)}
          />
        )}
        {panel === 'save' && (
          <SaveSheet
            channels={channels}
            selected={currentTags}
            busy={channelBusy}
            created={created}
            onToggle={(tag, on) => void toggleChannel(tag, on)}
            onCreate={(name) => void createChannel(name)}
            onCopy={(url) =>
              void navigator.clipboard
                ?.writeText(url)
                .then(() => flash('Link copied'))
                .catch(() => flash('Couldn’t copy the link'))
            }
            isPrivate={isPrivate}
            privateBusy={privateBusy}
            onPrivate={(on) => void setPostPrivate(on)}
            onClose={() => {
              setPanel(null)
              setCreated(null)
            }}
          />
        )}
        {panel === 'why' && (
          <WhySheet
            item={current}
            friends={whyFriends}
            weights={weights}
            busy={weightBusy}
            onWeight={(username, weight) => {
              const friend = whyFriends.find((f) => f.username === username)
              if (friend) void setFriendWeight(friend, weight)
            }}
            onClose={() => setPanel(null)}
          />
        )}
        {panel === 'share' && (
          <ShareSheet
            url={publicUrl()}
            waiting={pausedForShare.current || timed}
            onClose={() => setPanel(null)}
          />
        )}
        {panel === 'more' && (
          <MoreSheet
            rows={menu.map((row) => ({
              ...row,
              onSelect: () => {
                row.onSelect()
                // Repeat cycles in place; Why this one opens its own sheet.
                if (
                  row.checked === undefined &&
                  row.label !== 'Repeat' &&
                  row.label !== 'Why this one'
                ) {
                  setPanel(null)
                }
              },
            }))}
            onClose={() => setPanel(null)}
          />
        )}
        {paste.toast}
        {learningOpen && (
          <LearningSheet status={learning.status} onClose={() => setLearningOpen(false)} />
        )}
        {toast && (
          <div
            role="status"
            className="nx-plate absolute left-1/2 top-20 z-30 -translate-x-1/2 rounded-full px-4 py-2 text-sm"
          >
            {toast}
          </div>
        )}
      </div>
      <header className="pointer-events-none fixed inset-x-0 top-0 z-[41] flex items-center gap-2 bg-gradient-to-b from-black/70 to-transparent px-3 pb-8 pt-[max(12px,env(safe-area-inset-top))] md:h-20 md:gap-4 md:bg-black md:bg-none md:px-7 md:py-0">
        {/* The same header as every other screen: logo and tabs, then tools. */}
        <NxLogo className="pointer-events-auto hidden md:flex" />
        <PrimaryNav current={navHere} className="pointer-events-auto" />
        {source.feed ? (
          <>
            <FeedSwitch
              mode={source.feed}
              onChange={switchFeed}
              className="pointer-events-auto hidden xl:flex"
            />
            <FeedTypesControl
              types={shownTypes}
              onChange={changeTypes}
              className="pointer-events-auto hidden xl:flex"
            />
          </>
        ) : (
          <Link
            href={back}
            // Phones only; on desktop it leads the row of chips on the stage.
            className="nx-plate pointer-events-auto flex h-10 min-w-0 max-w-[60vw] items-center gap-1.5 rounded-full pl-2 pr-4 text-sm md:hidden"
          >
            <ChevronLeft aria-hidden className="h-4 w-4 shrink-0" />
            <span className="truncate">{title ?? (source.search.q || 'Search')}</span>
          </Link>
        )}
        <span className="flex-1" />
        {source.moment ? (
          <span className="nx-plate flex h-8 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3 text-xs font-extrabold">
            <span
              aria-hidden
              className="block h-2 w-2 rounded-full animate-nx-live-pulse"
              style={{ background: momentHue }}
            />
            <span>LIVE</span>
            {watching > 0 && (
              <span className="hidden font-medium text-white/80 md:inline">{`${watching} watching`}</span>
            )}
          </span>
        ) : (
          !position.via && (
            <span
              className={cn(
                'nx-plate hidden h-8 items-center whitespace-nowrap rounded-full px-3 text-xs tabular-nums text-white/85',
                source.feed ? 'xl:flex' : 'md:flex',
              )}
            >
              {source.feed === 'new'
                ? `${caughtUp ? 0 : Math.max(0, feedTotal - index)} you haven’t seen`
                : source.feed
                  ? `${index + 1} of ${Math.max(feedTotal, items.length)}`
                  : `${position.n} of ${position.of}`}
            </span>
          )
        )}
        <LearningPill
          status={learning.status}
          onOpen={() => setLearningOpen(true)}
          className="pointer-events-auto hidden md:flex"
        />
        <PasteButton onClick={paste.pasteFromClipboard} className="pointer-events-auto" />
        <HeaderSearch shortcut className="pointer-events-auto" />
        <AccountMenu className="pointer-events-auto" avatarOnPhones={false} />
        <ControlButton
          label={shownMuted ? 'Unmute' : 'Mute'}
          onClick={toggleMute}
          className="nx-plate pointer-events-auto md:hidden"
        >
          {shownMuted ? (
            <VolumeX aria-hidden className="h-5 w-5" />
          ) : (
            <Volume2 aria-hidden className="h-5 w-5" />
          )}
        </ControlButton>
      </header>
      <BottomNav current={navHere} />
    </>
  )
}
