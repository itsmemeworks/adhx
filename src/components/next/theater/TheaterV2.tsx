'use client'

import { networkLabel } from '@/lib/platform/networks'
import { NetworkIcon } from '../NetworkIcon'

import { composeArticleCopy, fetchArticleMarkdown } from '@/lib/theater/article-body'
import { postBody } from '../rich-text'
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
import { HeaderSearch, focusHeaderSearch, openQuickSearch } from '../QuickSearch'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import {
  Bookmark,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Ellipsis,
  Image as ImageIcon,
  Maximize,
  Minimize,
  Pause,
  Play,
  Plus,
  Send,
  Share,
  SkipBack,
  SkipForward,
  Check,
  Copy,
  Download,
  Radio,
  Sparkles,
  Target,
  Video,
  Volume2,
  VolumeX,
  Waves,
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
import { articleHeadline, hasFullArticle, mediaAspect, postAuthor, postCoverSrc } from '../post'
import { PrivateLock, SaversButton } from '../SaverFaces'
import { bylineNote, SaverNote } from '../SaverNote'
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
import {
  CaughtUpStage,
  FeedSwitch,
  FeedTypesControl,
  WhyChip,
  type CaughtUpRecap,
} from './FeedParts'
import {
  ChannelChip,
  FaceStack,
  FeedFilterSheet,
  KeyHints,
  NextCard,
  PanelDivider,
  PhoneFilterIcon,
  PhoneGob,
  PhoneSearchIcon,
  PhoneTabs,
  QuickWords,
  ReactionStack,
  RoundIconButton,
  SeekBar,
  UpNextList,
  WatchersCard,
  WhyPanel,
  bylineLine,
  momentPace,
  postWords,
  queueSavers,
  savedAgo,
  useWide,
} from './TheaterLayout'
import { SEEN_AFTER_MS, useSeenPosts } from './useSeenPosts'
import { useWatchCounts } from './useWatchCounts'
import {
  DEFAULT_FEED_KINDS,
  FEED_KINDS,
  feedTypesSummary,
  waitingLine,
  type BlendMode,
  type FeedKind,
  type FeedWeight,
} from '@/lib/feed/blend'
import { stage, useDwell, useStageTap, useVideoState } from './usePlayerState'
import { PasteButton, usePasteToSave } from '../onboarding/usePasteToSave'
import { channelTitle } from '../channels/ChannelParts'
import { useBusyLogo } from '../logo-busy'
import { POST_KEPT, POST_SAVED as NX_POST_SAVED } from '@/lib/theater/client-events'
import { GettingReadyStage, KeptChip, SharedWithChip } from './GettingReady'
import { OriginalSheet } from './OriginalSheet'
import { onItsWay, useKeepStatus } from './useKeepStatus'
import { useReactionReplay } from './useReactionReplay'

/** How long a reaction floats on screen. */
const REACTION_MS = 4_400
/** How long a short player message (“Link copied”) stays up, as on the phones. */
export const PLAYER_TOAST_MS = 3_000
/** At most this many float at once (a replay sends up to 12). */
const MAX_FLOATS = 12

type Load =
  | { status: 'loading' }
  | { status: 'error'; missing?: boolean; busy?: boolean }
  | { status: 'ready' }
type Panel = null | 'queue' | 'more' | 'save' | 'share' | 'why' | 'original'

type QueueResponse = SearchResponse & {
  name?: string
  channel?: { tag: string }
  /** A moment's detail (Tune in): its items carry when they were saved. */
  moment?: { title: string; hue: string; watching: number }
  /** Reactions feed offset; distinct from the blended feed's opaque cursor. */
  nextOffset?: number | null
  /** The blended feed (`/api/feed/blend`): paging and the end of New. */
  nextCursor?: string | null
  caughtUp?: boolean
  nothingYet?: boolean
  total?: number
  /** The kinds the feed was filtered to, and (New) unseen posts of other kinds. */
  types?: FeedKind[]
  waiting?: Partial<Record<FeedKind, number>>
  /** Home's lineup: how many posts each part holds. */
  sections?: Record<string, number>
  /** Members only: who else is tuned in. */
  watchers?: Saver[]
  /** A From everyone channel you kept as one of yours ("Kept · Open"). */
  kept?: { tag: string; url: string } | null
}

const FEED_TITLES: Record<BlendMode, string> = {
  new: 'Home',
  everyone: 'Everyone',
  friends: 'Friends only',
  mine: 'Mine',
  lineup: 'Home',
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
  if (source.reacted && !(load.status === 'error' && !missing))
    return {
      title: 'No reactions yet',
      body: 'React to a post in the player and it plays here, with everyone else’s.',
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
      title: 'Nothing kept yet',
      body: 'No algorithm is going to fill this for you. Paste a link to a post from X, Instagram, TikTok, YouTube, Reddit and more, or bring in your X bookmarks.',
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
  /** The stage's frame (full screen goes to it). */
  const frameRef = useRef<HTMLDivElement>(null)
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  useBusyLogo('theater', load.status === 'loading')
  /** A channel's name, once its queue loads. */
  const [title, setTitle] = useState<string | null>(null)
  /** Phones: where the top-left chips end, so a toast never covers a wrapped row. */
  const chipsRef = useRef<HTMLDivElement>(null)
  const [chipsBottom, setChipsBottom] = useState(0)
  /** A From everyone channel you already kept: its tag and your channel's link. */
  const [groupKept, setGroupKept] = useState<{ tag: string; url: string } | null>(null)
  const [items, setItems] = useState<SearchResultItem[]>([])
  const [index, setIndex] = useState(0)
  const preferenceContext = usePreferencesOptional()
  // Settings' "Sound on by default", then the viewer's latest mute choice
  // (shared with the other theater, across tabs and reloads).
  const [muted, setMuted] = useTheaterSoundPreference({
    soundOnByDefault: preferenceContext?.preferences.soundOn ?? false,
    ready: !preferenceContext || !preferenceContext.loading,
  })
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
  const pageEpoch = useRef(0)
  const reactedOffset = useRef<number | null>(null)
  const feedCursor = useRef<string | null>(null)
  const feedLoading = useRef<Promise<boolean> | null>(null)
  const [feedTotal, setFeedTotal] = useState(0)
  /** Home's lineup: how many posts each part holds (`just`, `unseen`, `foryou`). */
  const [feedSections, setFeedSections] = useState<Record<string, number> | null>(null)
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
  const [reactionError, setReactionError] = useState<string | null>(null)
  const reactionTarget = useRef<FeedItem | null>(null)
  const reactionRequest = useRef<AbortController | null>(null)
  /** Reactions already floated this visit (Live arrivals, yours, replays), so none floats twice. */
  const shownReactions = useRef<Set<string>>(new Set())
  const showFloat = useCallback((float: FloatingReaction) => {
    shownReactions.current.add(float.id)
    setFloats((list) =>
      list.some((r) => r.id === float.id) ? list : [...list, float].slice(-MAX_FLOATS),
    )
    window.setTimeout(() => setFloats((list) => list.filter((r) => r.id !== float.id)), REACTION_MS)
  }, [])
  const dropFloats = useCallback((ids: readonly string[]) => {
    const gone = new Set(ids)
    setFloats((list) => list.filter((r) => !gone.has(r.id)))
  }, [])
  useEffect(() => {
    setReactOpen(false)
    setReactionError(null)
    return () => {
      reactionRequest.current?.abort()
      reactionRequest.current = null
    }
  }, [source.moment])

  // ——— Load the queue from the search this session came from ———
  useEffect(() => {
    const epoch = ++pageEpoch.current
    setPanel(null)
    feedCursor.current = null
    reactedOffset.current = null
    feedLoading.current = null
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
    setFeedTotal(0)
    setLoad({ status: 'loading' })
    setCaughtUp(false)
    watchingLive.current = false
    const types = typesKey ? (typesKey.split(',') as FeedKind[]) : null
    fetchQueue(
      source.feed
        ? feedUrl(source.feed, null, 20, types)
        : queueUrl(source, () => searchUrl({ ...source.search, view: 'bento' }, { refine: true })),
      controller.signal,
    )
      .then(async (response) => {
        if (controller.signal.aborted || epoch !== pageEpoch.current) return
        // A card can open a post beyond the first page. Keep the API's order.
        if (source.reacted && source.start) {
          while (
            !response.items.some((item) => resultKey(item) === source.start) &&
            typeof response.nextOffset === 'number'
          ) {
            const offset = response.nextOffset
            const more = await fetchQueue(
              `/api/posts/reacted?limit=50&offset=${offset}`,
              controller.signal,
            )
            if (controller.signal.aborted || epoch !== pageEpoch.current) return
            response = {
              ...more,
              items: appendUnique(response.items, more.items),
              nextOffset:
                typeof more.nextOffset === 'number' && more.nextOffset > offset
                  ? more.nextOffset
                  : null,
            }
          }
        }
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
        if (source.reacted) {
          reactedOffset.current = response.nextOffset ?? null
          setFeedTotal(response.total ?? results.length)
        }
        if (source.feed) {
          feedCursor.current = response.nextCursor ?? null
          feedTypesUsed.current = response.types ?? types
          if (response.types?.length) setShownTypes(response.types)
          setFeedWaiting(response.waiting ?? {})
          setFeedTotal(response.total ?? results.length)
          setFeedSections(response.sections ?? null)
          // Opened Home with nothing left: straight to the end card.
          setCaughtUp(source.feed === 'new' && results.length === 0 && !response.nothingYet)
        }
        if (source.groupChannel) setGroupKept(response.kept ?? null)
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
    return () => {
      controller.abort()
      pageEpoch.current++
    }
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
  // Your note on each post, as set here in the Save sheet (else the server's).
  const [noteNow, setNoteNow] = useState<Map<string, string | null>>(new Map())
  // Savers are only sent to signed-in members; a save made here adds you.
  const { me, loading: authLoading } = useAuthMe()
  // Seen (the feed's watched list): 2s on stage, or skipped. Members only.
  const markSeen = useSeenPosts(!authLoading && !!me?.user && !source.shared, me?.user?.id)
  // Watch counts (plays, finishes, seconds): members only, never a shared preview.
  useWatchCounts(!authLoading && !!me?.user && !source.shared, me?.user?.id, currentKey, isVideo)
  const currentKeyRef = useRef(currentKey)
  currentKeyRef.current = currentKey
  useEffect(() => {
    if (!currentKey || caughtUp) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const visible = () => {
      if (timer !== null) clearTimeout(timer)
      timer = document.hidden ? null : setTimeout(() => markSeen(currentKey), SEEN_AFTER_MS)
    }
    visible()
    document.addEventListener('visibilitychange', visible)
    return () => {
      if (timer !== null) clearTimeout(timer)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [currentKey, caughtUp, markSeen])
  const member = !!me?.user
  // What people left on this post floats up once it settles (members only, once per visit).
  useReactionReplay({
    enabled: member && !caughtUp && !!current,
    fresh: !!source.reacted,
    scope: me?.user?.id ?? 'signed-out',
    platform: current ? (current.post.platform ?? 'twitter') : null,
    id: current?.post.id ?? null,
    isShown: (id) => shownReactions.current.has(id),
    onFloat: showFloat,
    onCancel: dropFloats,
  })
  // Still being kept? "Getting it ready" covers the stage until the copy is here (j1-4).
  const keep = useKeepStatus(
    current && kind !== 'post' && kind !== 'article'
      ? { platform: current.post.platform ?? 'twitter', id: current.post.id }
      : null,
    member && !source.shared,
  )
  const gettingReady = onItsWay(keep.status)
  // The copy just arrived: play it (a load that failed while it waited starts again).
  const wasGettingReady = useRef<{ key: string; on: boolean }>({ key: '', on: false })
  useEffect(() => {
    const was = wasGettingReady.current
    wasGettingReady.current = { key: currentKey, on: gettingReady }
    if (was.key === currentKey && was.on && !gettingReady) {
      window.dispatchEvent(new CustomEvent(POST_KEPT, { detail: { key: currentKey } }))
    }
  }, [currentKey, gettingReady])
  const savers = useMemo<Saver[] | undefined>(() => {
    const mine = noteNow.get(currentKey)
    const list = current?.post.savers?.map((s) => (s.isYou ? withNote(s, mine) : s))
    if (!list) return undefined
    if (!savedNow.has(currentKey) || list.some((s) => s.isYou) || !me?.user) return list
    const you: Saver = withNote(
      {
        username: me.user.username,
        name: me.user.displayName || null,
        avatarUrl: me.user.avatarUrl,
        savedAt: new Date().toISOString(),
        isYou: true,
      },
      mine,
    )
    return [you, ...list]
  }, [current, currentKey, savedNow, me, noteNow])

  /** Friends "Why this one" can show more or less of: whoever else saved it. */
  const whyFriends = useMemo<WhyFriend[]>(
    () =>
      (savers ?? [])
        .filter((s) => !s.isYou)
        .slice(0, 2)
        .map((s) => ({ username: s.username, name: s.name?.trim() || s.username })),
    [savers],
  )

  // A short message (“Link copied”) for 3 s, in the top pill's place; a new one replaces it.
  const toastTimer = useRef<number | null>(null)
  const flash = useCallback((message: string) => {
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current)
    setToast(message)
    toastTimer.current = window.setTimeout(() => {
      toastTimer.current = null
      setToast(null)
    }, PLAYER_TOAST_MS)
  }, [])
  useEffect(
    () => () => {
      if (toastTimer.current !== null) window.clearTimeout(toastTimer.current)
    },
    [],
  )

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

  /** Paginated source queues share a single in-flight request per visit. */
  const loadMoreFeed = useCallback((): Promise<boolean> => {
    const cursor = feedCursor.current
    const offset = reactedOffset.current
    if (source.reacted ? offset === null : !source.feed || !cursor) return Promise.resolve(false)
    if (feedLoading.current) return feedLoading.current
    const epoch = pageEpoch.current
    const url = source.reacted
      ? `/api/posts/reacted?limit=50&offset=${offset}`
      : feedUrl(source.feed!, cursor, 20, feedTypesUsed.current)
    const task = fetchQueue(url)
      .then((response) => {
        if (epoch !== pageEpoch.current) return false
        if (source.reacted) {
          reactedOffset.current =
            typeof response.nextOffset === 'number' && response.nextOffset > offset!
              ? response.nextOffset
              : null
        } else feedCursor.current = response.nextCursor ?? null
        if (typeof response.total === 'number') setFeedTotal(response.total)
        const before = itemsRef.current.length
        const list = appendUnique(
          itemsRef.current,
          source.reacted ? response.items : feedResults(response.items as unknown as FeedItem[]),
        )
        if (list.length === before) return false
        replaceItems(list)
        return true
      })
      .catch(() => false) // Retain the cursor so Next can retry after a connection failure.
      .finally(() => {
        if (feedLoading.current === task) feedLoading.current = null
      })
    feedLoading.current = task
    return task
  }, [source.feed, source.reacted, replaceItems])

  useEffect(() => {
    if (
      load.status === 'ready' &&
      ((source.feed && feedCursor.current) || (source.reacted && reactedOffset.current !== null)) &&
      index >= items.length - 4
    )
      void loadMoreFeed()
  }, [source, load.status, index, items.length, loadMoreFeed])

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
  const liveRevision = useRef(0)
  useMomentStream(
    (event) => {
      liveRevision.current++
      if (event.type === 'watching' && event.slug === source.moment) {
        watchingLive.current = true
        setWatching(event.watching)
        if (event.watchers) setWatchers(event.watchers)
      }
      if (event.type === 'reaction' && event.slug === source.moment) {
        showFloat({
          id: event.id,
          saver: event.saver,
          ...(event.emoji ? { emoji: event.emoji } : { text: event.text }),
        })
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
    () => {
      // Transport reconnection alone does not replay missed events. Reconcile
      // the latest slice without replacing the player or forgetting older queue entries.
      const epoch = pageEpoch.current
      const revision = liveRevision.current
      if (!source.moment) return
      void fetchQueue(queueUrl(source, () => ''))
        .then((response) => {
          if (epoch !== pageEpoch.current) return
          const fresh: SearchResultItem[] = (
            response.items as unknown as { post: FeedItem; savedAt: string; savers?: Saver[] }[]
          ).map(({ post, savedAt, savers }) => ({
            post: savers ? { ...post, savers } : post,
            savedAt,
            saved: false,
            matched: [],
          }))
          const have = new Set(itemsRef.current.map(resultKey))
          const extra = fresh.filter((item) => !have.has(resultKey(item)))
          const updated = new Map(fresh.map((item) => [resultKey(item), item]))
          const current = itemsRef.current.map((item) =>
            revision === liveRevision.current ? (updated.get(resultKey(item)) ?? item) : item,
          )
          if (!current.length) return // Initial source loading owns the first queue.
          replaceItems(insertAfter(current, indexRef.current, extra))
          if (extra.length) {
            setArrivals((n) => n + extra.length)
            if (waitingRef.current) goTo(indexRef.current + 1)
          }
        })
        .catch(() => {})
    },
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

  /**
   * React to the post that was on screen when the picker opened. Live goes to
   * the room (which echoes it back to you, and keeps it on the post); any
   * other post floats yours at once and keeps it (`/api/posts/reactions`).
   * Words stay in the picker until the server has them.
   */
  const sendReaction = useCallback(
    async (reaction: { emoji: ReactionEmoji } | { text: string }): Promise<boolean> => {
      const post = reactionTarget.current ?? itemsRef.current[indexRef.current]?.post
      if (!post || reactionRequest.current) return false
      const controller = new AbortController()
      reactionRequest.current = controller
      setReacting(true)
      setReactionError(null)
      const live = !!source.moment
      const body = JSON.stringify({
        ...reaction,
        platform: post.platform ?? 'twitter',
        id: post.id,
      })
      // Yours floats at once, with your face (Live waits for the room's echo).
      const draftId = `mine-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
      if (!live && me?.user) {
        showFloat({
          id: draftId,
          saver: {
            username: me.user.username,
            name: me.user.displayName || null,
            avatarUrl: me.user.avatarUrl,
            savedAt: new Date().toISOString(),
            isYou: true,
          },
          ...reaction,
        })
        if ('emoji' in reaction) setReactOpen(false)
      }
      const failed = (status?: number) => {
        if (live) {
          setReactionError(
            status === 429
              ? 'Easy there. Try again in a moment.'
              : 'That didn’t send. Your words are still here. Try again.',
          )
          return
        }
        dropFloats([draftId])
        flash(
          status === 429 ? 'Easy there. Try again in a moment.' : 'Couldn’t send that. Try again.',
        )
      }
      try {
        const response = await fetch(
          live
            ? `/api/moments/${encodeURIComponent(source.moment!)}/react`
            : '/api/posts/reactions',
          {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
            body,
          },
        )
        if (controller.signal.aborted) return false
        if (!response.ok) {
          failed(response.status)
          return false
        }
        const kept = (await response.json().catch(() => null)) as { id?: string } | null
        if (kept?.id) shownReactions.current.add(kept.id)
        setReactOpen(false)
        return true
      } catch {
        if (!controller.signal.aborted) failed()
        return false
      } finally {
        if (reactionRequest.current === controller) {
          reactionRequest.current = null
          setReacting(false)
        }
      }
    },
    [source.moment, me, showFloat, dropFloats, flash],
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

  const blockingPanel = useRef(false)
  blockingPanel.current = panel === 'share' || panel === 'original'
  const next = useCallback(async () => {
    if (blockingPanel.current) return
    const epoch = pageEpoch.current
    if (
      (source.feed || source.reacted) &&
      nextIndex(items, index, { repeat: 'off', videosOnly }) === null
    ) {
      // The feed pages in: fetch more before wrapping or ending.
      for (
        let tries = 0;
        tries < 3 && (feedCursor.current || reactedOffset.current !== null);
        tries++
      ) {
        await loadMoreFeed()
        if (epoch !== pageEpoch.current || blockingPanel.current) return
        const after = nextIndex(itemsRef.current, index, { repeat: 'off', videosOnly })
        if (after !== null) return goTo(after)
      }
      if (feedCursor.current || reactedOffset.current !== null) {
        flash('More posts are still loading. Try Next again in a moment.')
        return
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
    if (epoch !== pageEpoch.current || blockingPanel.current) return
    const after = extended ? nextIndex(extended, index, { repeat: 'off', videosOnly }) : null
    if (after !== null) {
      // Say so: otherwise "4 of 4" quietly becomes "5 of 24".
      flash(
        source.shared
          ? 'Now: more like this, from everyone’s saves'
          : `That’s everything from ${sourceName}. Now: more like the last one`,
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
    source.reacted,
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
    active: timed && !ended && !caughtUp && panel === null,
    seconds: current ? dwellSeconds(current) : 6,
    paused: timedPaused,
    resetKey: currentKey,
    onDone: () => {
      if (repeat === 'one') dwell.seek(0)
      else void next()
    },
  })
  // Repeat chosen after the queue ran out ("That's all"): play this post
  // again rather than sit at the end. Repeat all then goes round the queue.
  // (The menu steps Off → All → One, so All mustn't jump away from it.)
  useEffect(() => {
    if (!ended || repeat === 'off') return
    setEnded(false)
    if (isVideo) {
      stage.seek(0)
      stage.resume()
    } else {
      dwell.seek(0)
    }
  }, [ended, repeat, isVideo, dwell])
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

  // Reading or sharing holds the same video. Resume only our own pause,
  // and only if the same post in the same queue is still on stage.
  const pausedForShare = useRef(false)
  const modalPause = useRef<{ key: string; source: PlaySource; resume: boolean } | null>(null)
  useEffect(() => {
    const blocked = panel === 'share' || panel === 'original'
    if (blocked) {
      if (
        !modalPause.current ||
        modalPause.current.key !== currentKey ||
        modalPause.current.source !== source
      ) {
        modalPause.current = { key: currentKey, source, resume: isVideo && playingRef.current }
        if (modalPause.current.resume) stage.pause()
      }
      pausedForShare.current = modalPause.current.resume
    } else {
      const held = modalPause.current
      modalPause.current = null
      pausedForShare.current = false
      if (held?.resume && held.key === currentKey && held.source === source && isVideo)
        stage.resume()
    }
  }, [panel, isVideo, currentKey, source])

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    else void frameRef.current?.requestFullscreen?.().catch(() => {})
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
      flash(kind === 'article' ? 'Article copied' : 'Words copied')
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

  // ——— The frame around the stage (design boards) ———
  // Wide screens get the columns; only leaf placement depends on it, never the stage.
  const wide = useWide()
  const moreRef = useRef<HTMLButtonElement>(null)
  const [moreAnchor, setMoreAnchor] = useState<CSSProperties | null>(null)
  const [filterOpen, setFilterOpen] = useState(false)
  /** The quick word last said here (it stays lit). */
  const [said, setSaid] = useState<string | null>(null)
  // The video's own shape, for posts that didn't say how big they are.
  const [measured, setMeasured] = useState<{ key: string; aspect: number } | null>(null)
  const loaded = load.status === 'ready'
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const onMeta = (e: Event) => {
      const v = e.target
      if (!(v instanceof HTMLVideoElement) || !v.videoWidth || !v.videoHeight) return
      setMeasured({ key: currentKeyRef.current, aspect: v.videoWidth / v.videoHeight })
    }
    root.addEventListener('loadedmetadata', onMeta, true)
    return () => root.removeEventListener('loadedmetadata', onMeta, true)
  }, [loaded, caughtUp])

  /** Wide screens: menus open beside the rail, level with the button's bottom. */
  const railAnchor = useCallback(
    (button: HTMLElement | null) => {
      const rect = button?.getBoundingClientRect()
      setMoreAnchor(
        wide && rect
          ? {
              right: Math.max(12, window.innerWidth - rect.left + 14),
              bottom: Math.max(16, window.innerHeight - rect.bottom - 8),
            }
          : null,
      )
    },
    [wide],
  )
  const toggleMore = useCallback(() => {
    if (panel === 'more') {
      setPanel(null)
      return
    }
    railAnchor(moreRef.current)
    setPanel('more')
  }, [panel, railAnchor])

  /** Made for you: "Keep this channel" (private until you share it). */
  const [keeping, setKeeping] = useState(false)
  const [kept, setKept] = useState(false)
  const keepChannel = useCallback(async () => {
    if (source.groupChannel) {
      // From everyone: everything in it goes into one of your channels (saved for you first).
      setKeeping(true)
      try {
        const res = await fetch(
          `/api/channels/group/${encodeURIComponent(source.groupChannel)}/keep`,
          { method: 'POST' },
        )
        if (!res.ok) throw new Error('keep')
        const body = (await res.json()) as { tag: string; url: string; added: number }
        setGroupKept({ tag: body.tag, url: body.url })
        flash('It’s one of your channels now. Private until you share it.')
      } catch {
        flash('Couldn’t keep that channel. Try again.')
      } finally {
        setKeeping(false)
      }
      return
    }
    if (!source.auto) return
    setKeeping(true)
    try {
      const res = await fetch(`/api/channels/auto/${encodeURIComponent(source.auto)}/keep`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublic: false }),
      })
      if (!res.ok) throw new Error('keep')
      setKept(true)
      flash('It’s one of your channels now. Private until you share it.')
    } catch {
      flash('Couldn’t keep that channel. Try again.')
    } finally {
      setKeeping(false)
    }
  }, [source.auto, source.groupChannel, flash])

  const sayWord = useCallback(
    (text: string) => {
      setSaid(text)
      reactionTarget.current = itemsRef.current[indexRef.current]?.post ?? null
      void sendReaction({ text })
    },
    [sendReaction],
  )

  /** What New played today, from the people who saved it (the caught-up card). */
  const recap = useMemo<CaughtUpRecap | null>(() => {
    if (source.feed !== 'new') return null
    const day = Date.now() - 86_400_000
    const today = items.filter((i) =>
      (i.post.savers ?? []).some((s) => !s.isYou && Date.parse(s.savedAt) > day),
    )
    if (today.length === 0) return null
    const people = new Map<string, Saver>()
    for (const i of today)
      for (const s of i.post.savers ?? [])
        if (!s.isYou && !people.has(s.username)) people.set(s.username, s)
    return {
      count: today.length,
      savers: [...people.values()],
      covers: today.map((i) => postCoverSrc(i.post)).filter((c): c is string => !!c),
      onPlay: () => goTo(items.indexOf(today[0])),
    }
  }, [source.feed, items, goTo])

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
  // Where the top-left chips end on a phone: LIVE and the watchers can wrap onto two rows.
  useEffect(() => {
    const el = chipsRef.current
    if (wide || !source.moment || !el) return
    const measure = () => setChipsBottom(Math.round(el.getBoundingClientRect().bottom))
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [wide, source.moment, load.status])

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
            tonight={wide}
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
  const words = postWords(current.post)
  const overlay = kind === 'post' || kind === 'article'
  const textOnly = !send.supported

  // Where the post came from: the byline's network line opens the original.
  const originalUrl = sourceUrl(
    current.post.platform ?? 'twitter',
    current.post.author,
    current.post.id,
    kind === 'photo' ? 'photo' : null,
  )
  const networkName = networkLabel(current.post.platform)

  const menu: MenuRow[] = [
    // The blended feed says why each post is here.
    ...(current.post.why ? [{ label: 'Why this one', onSelect: openWhy }] : []),
    { label: 'Add to a channel', more: true, onSelect: () => void save() },
    // Members only (savers come with a session): keep this save to yourself.
    ...(saved || savers
      ? [
          {
            label: 'Just for me',
            hint: 'Your people won’t see this save',
            checked: isPrivate,
            onSelect: () => void setPostPrivate(!isPrivate),
          },
        ]
      : []),
    { label: 'Copy link', onSelect: () => void copyLink() },
    { label: 'More like this', onSelect: () => void moreLikeThis() },
    ...(originalUrl
      ? [
          {
            label: `Open on ${networkName}`,
            icon: <NetworkIcon platform={current.post.platform} className="h-4 w-4" />,
            onSelect: () => void window.open(originalUrl, '_blank', 'noopener,noreferrer'),
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
      checked: videosOnly,
      onSelect: () => setVideosOnly((v) => !v),
    },
    {
      label: 'Stick to this vibe',
      checked: stick,
      onSelect: () => setStick((v) => !v),
    },
    // Wide screens have Up next beside the stage, and ⌘V (or the header's keyboard Paste).
    ...(!wide ? [{ label: 'Up next', onSelect: () => setPanel('queue') }] : []),
    ...(isVideo && video.pip.supported
      ? [{ label: 'Picture in picture', onSelect: () => stage.togglePip() }]
      : []),
    ...(!wide ? [{ label: 'Paste a link', onSelect: () => void paste.pasteFromClipboard() }] : []),
    ...(current.saved ? [{ label: 'Archive', divider: true, onSelect: () => void archive() }] : []),
  ]

  // ——— The frame's shape ———
  // feed: New's column on the left · list: Up next on the right · panel: a
  // channel or moment, its own panel on the right and the stage in a dimmed room.
  const layout: 'feed' | 'list' | 'panel' = source.feed
    ? 'feed'
    : source.moment || isChannelSource(source)
      ? 'panel'
      : 'list'
  const after = nextIndex(items, index, { repeat: 'off', videosOnly })
  const upNext = after !== null && after !== index ? items[after] : null
  const textFrame = overlay
  const aspect = Math.min(
    16 / 9,
    Math.max(
      9 / 16,
      mediaAspect(current.post) ?? (measured?.key === currentKey ? measured.aspect : 9 / 16),
    ),
  )
  const tallFrame = !textFrame && aspect < 1
  const showNextCard = wide && layout === 'feed' && !!upNext && !caughtUp
  const reserve = !wide ? 0 : showNextCard ? 78 : layout === 'panel' && source.moment ? 72 : 0
  const secondsLeft =
    repeat === 'one'
      ? null
      : isVideo && video.duration
        ? (1 - video.progress) * video.duration
        : timed
          ? (1 - dwell.progress) * dwellSeconds(current)
          : null
  const timeNow = isVideo && video.duration ? clock(video.progress * video.duration) : null
  const timeAll = isVideo && video.duration ? clock(video.duration) : null
  const timeLabel = timeNow
    ? `${timeNow} / ${timeAll}`
    : timed
      ? `${clock(dwell.progress * dwellSeconds(current))} / ${clock(dwellSeconds(current))}`
      : reading
        ? `${Math.round(articleProgress * 100)}% read`
        : ''
  const fullTransport = wide && layout !== 'panel' && !tallFrame
  const muteOnFrame = isVideo && !fullTransport
  const unseen =
    source.feed === 'new'
      ? caughtUp
        ? 0
        : feedSections
          ? // The lineup: Just saved and Not seen yet still ahead (For you aside).
            Math.max(
              0,
              (feedSections.just ?? 0) +
                (feedSections.unseen ?? 0) -
                items.slice(0, index).filter((i) => {
                  const part = (i.post as { section?: string }).section
                  return part === 'just' || part === 'unseen'
                }).length,
            )
          : Math.max(0, feedTotal - index)
      : null
  const countLine =
    source.feed === 'new'
      ? `${unseen ?? 0} you haven’t seen`
      : source.feed
        ? `${index + 1} of ${Math.max(feedTotal, items.length)}`
        : `${position.n} of ${position.of}`
  const cover = postCoverSrc(current.post)
  const channelKind = source.groupChannel
    ? 'From everyone'
    : source.reacted
      ? 'Your people'
      : source.auto
        ? 'Made for you'
        : source.friend
          ? 'Your people'
          : 'Channel'
  const inQueue = queueSavers(items)

  const muteButton = (
    <ControlButton
      label={shownMuted ? 'Unmute' : 'Mute'}
      onClick={toggleMute}
      className={cn(
        'pointer-events-auto absolute z-20 border-0 bg-black/55 backdrop-blur-md hover:bg-black/70',
        wide ? 'right-4 top-4' : 'right-3 top-[max(68px,calc(env(safe-area-inset-top)+60px))]',
      )}
    >
      {shownMuted ? (
        <VolumeX aria-hidden className="h-5 w-5" />
      ) : (
        <Volume2 aria-hidden className="h-5 w-5" />
      )}
    </ControlButton>
  )

  // Previous and Next as small glyphs on the transport, after play/pause (a
  // channel's room has its own stack at xl). A moment's room shows them: with
  // a mouse, tuning in has no other way past a post. Everywhere else the boards
  // move on by swipe, J and ←, so they stay out of sight until a keyboard
  // reaches them. Screen readers always have them.
  const transportSkips = (shown: boolean) => (
    <span
      className={cn(
        'flex shrink-0 gap-0.5',
        !shown && 'sr-only focus-within:not-sr-only',
        !shown && layout === 'panel' && !source.moment && 'xl:hidden',
      )}
    >
      <ControlButton
        label="Previous"
        onClick={prev}
        className="-my-2.5 h-8 w-8 text-white/90 hover:bg-white/10"
      >
        <SkipBack aria-hidden className="h-4 w-4" fill="currentColor" />
      </ControlButton>
      <ControlButton
        label="Next"
        onClick={() => void next()}
        className="-my-2.5 h-8 w-8 text-white/90 hover:bg-white/10"
      >
        <SkipForward aria-hidden className="h-4 w-4" fill="currentColor" />
      </ControlButton>
    </span>
  )

  const backChip = (
    <Link
      href={back}
      className="pointer-events-auto flex h-9 min-w-0 max-w-[320px] items-center gap-1.5 rounded-full border border-white/[0.14] bg-black/50 pl-2 pr-4 text-[13px] font-bold backdrop-blur-md"
    >
      <ChevronLeft aria-hidden className="h-4 w-4 shrink-0" />
      <span className="truncate">{title ?? (source.search.q || 'Search')}</span>
    </Link>
  )

  const viaNote = !source.moment && position.via && (
    // Not from the source: say what it is like and why it's playing.
    <div
      role="note"
      className="flex min-w-0 max-w-full items-center gap-2.5 rounded-2xl border border-white/[0.14] bg-black/55 py-2 pl-3 pr-4 backdrop-blur-md md:max-w-[420px]"
    >
      <Sparkles aria-hidden className="h-4 w-4 shrink-0 text-nx-accent" fill="currentColor" />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-bold">{viaLabel(position.via)}</span>
        <span className="truncate text-xs text-white/65">
          {`${viaReason(position.via, source.shared ? 'post' : isChannelSource(source) ? 'channel' : source.recent ? 'saves' : 'search')} · ${position.n} of ${position.of}`}
        </span>
      </span>
    </div>
  )

  const liveChip = source.moment && (
    <span className="flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-[#ff5a3c]/50 bg-black/55 pl-3 pr-3.5 text-[13px] font-extrabold tracking-[0.08em] backdrop-blur-md">
      <span
        aria-hidden
        className="block h-[9px] w-[9px] rounded-full bg-[#ff5a3c] shadow-[0_0_0_4px_rgba(255,90,60,0.28),0_0_0_8px_rgba(255,90,60,0.1)]"
      />
      <span>LIVE</span>
      {!wide && watching > 0 && (
        <span className="font-semibold tracking-normal text-white/80">{`${watching} watching`}</span>
      )}
    </span>
  )

  const tunedChip = source.moment && (
    <button
      type="button"
      onClick={() => toggleWander(!wander)}
      aria-pressed={wander}
      className="pointer-events-auto flex h-9 items-center gap-[7px] whitespace-nowrap rounded-full border border-white/[0.12] bg-black/55 pl-2.5 pr-3.5 text-[13px] backdrop-blur-md"
    >
      <Check aria-hidden className="h-3.5 w-3.5 text-[#5ee38a]" strokeWidth={3} />
      <span className="font-extrabold">Tuned in</span>
      <span aria-hidden className="text-nx-soft">
        ·
      </span>
      <span className="text-nx-soft">{wander ? 'Wandering' : 'Staying close'}</span>
    </button>
  )

  const toastPill = toast ? (
    <span
      role="status"
      data-player-toast
      className="flex min-h-10 max-w-full items-center rounded-full bg-nx-cream px-4 py-2 text-center text-sm font-extrabold text-black shadow-nx-toast animate-nx-drop-in"
    >
      {toast}
    </span>
  ) : null

  const railStyle = (on = false, ring = false) =>
    cn(
      'pointer-events-auto flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full transition-colors',
      wide && layout !== 'panel'
        ? on
          ? 'bg-nx-accent text-black'
          : 'bg-[#262320] text-nx-cream hover:bg-[#2f2b27]'
        : wide
          ? cn(
              'border border-white/[0.14] bg-white/10 backdrop-blur-md hover:bg-white/[0.16]',
              on ? 'text-nx-accent' : 'text-white',
            )
          : cn('bg-black/45 backdrop-blur-md', on ? 'text-nx-accent' : 'text-white'),
      ring && 'ring-2 ring-inset ring-nx-accent',
    )
  const railItem = (button: ReactNode, label: string) =>
    wide && layout === 'panel' ? (
      <span className="flex flex-col items-center gap-[5px]">
        {button}
        <span className="text-xs text-nx-soft">{label}</span>
      </span>
    ) : (
      button
    )
  const ShareIcon = isVideo ? Video : kind === 'photo' ? ImageIcon : Send

  return (
    <>
      <div
        ref={rootRef}
        className={cn(
          'fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] top-0 z-40 overflow-hidden bg-nx-stage font-nx-sans text-white md:bottom-0 md:top-[72px]',
          wide && 'flex',
          wide && layout !== 'panel' && 'gap-8 px-8 py-6',
        )}
        onTouchStart={swipe.onTouchStart}
        onTouchMove={swipe.onTouchMove}
        onTouchEnd={swipe.onTouchEnd}
        onTouchCancel={swipe.onTouchCancel}
      >
        {wide && layout === 'feed' && source.feed && (
          // New's own column: whose saves, and what's coming up and why.
          <aside aria-label="Up next" className="flex min-h-0 w-[280px] shrink-0 flex-col gap-3">
            <div className="flex items-baseline gap-2">
              <h1 className="m-0 flex-1 font-nx-serif text-[40px] font-normal leading-[0.95]">
                {FEED_TITLES[source.feed]}
              </h1>
              <span className="whitespace-nowrap text-[13px] font-semibold text-nx-soft">
                {countLine}
              </span>
              <FeedTypesControl
                types={shownTypes}
                onChange={changeTypes}
                compact
                className="self-center [&>button]:h-9 [&>button]:w-9"
              />
            </div>
            <FeedSwitch
              mode={source.feed}
              onChange={switchFeed}
              className="gap-1 bg-nx-surface [&>button]:h-10 [&>button]:flex-1"
            />
            <h2 className="m-0 mt-2 text-xs font-extrabold uppercase tracking-[0.08em] text-nx-muted">
              Up next
            </h2>
            <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 [scrollbar-width:none]">
              <UpNextList items={items} index={index} variant="feed" onPlay={goTo} />
            </div>
            {source.feed === 'new' && items.length - index > 6 && (
              <span className="px-2.5 text-[13px] text-nx-muted">
                {`${Math.max(0, (unseen ?? 0) - 6)} more after these. Then you’re caught up.`}
              </span>
            )}
          </aside>
        )}

        <section
          aria-label="Now playing"
          className={cn(
            'absolute inset-0',
            wide && 'relative inset-auto flex min-w-0 flex-1 flex-col',
            wide && layout === 'panel' && 'overflow-hidden',
          )}
        >
          {wide && layout === 'panel' && cover && (
            // The room the stage sits in: its own picture, blurred and dimmed.
            <img
              src={cover}
              alt=""
              aria-hidden
              className="pointer-events-none absolute -inset-[60px] h-[calc(100%+120px)] w-[calc(100%+120px)] max-w-none object-cover blur-[48px] brightness-[0.32] saturate-[1.2]"
            />
          )}
          {wide && layout === 'panel' && !source.moment && (
            <>
              {/* Under the stage, which may cover its end (as on the board). */}
              <div className="absolute left-6 top-5 max-w-[calc(50%-24px)]">
                <ChannelChip
                  href={back}
                  label={
                    source.groupChannel || source.auto || source.channel
                      ? 'Channel'
                      : source.reacted
                        ? 'Your people'
                        : 'Saves'
                  }
                  name={title ?? 'Channel'}
                  position={`${position.n} of ${Math.max(position.of, feedTotal)}`}
                  covers={items}
                />
              </div>
              {/* Only where the room is wide enough to keep clear of the rail. */}
              <div className="absolute right-6 top-1/2 z-10 hidden -translate-y-1/2 flex-col gap-2.5 xl:flex">
                <button
                  type="button"
                  aria-label="Previous"
                  onClick={prev}
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-white/[0.12] bg-black/50 text-white"
                >
                  <ChevronUp aria-hidden className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  aria-label="Next"
                  onClick={() => void next()}
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-nx-cream text-black"
                >
                  <ChevronDown aria-hidden className="h-5 w-5" />
                </button>
              </div>
              <div className="absolute bottom-[22px] left-6">
                <KeyHints />
              </div>
            </>
          )}
          {wide && layout === 'panel' && source.moment && (
            <>
              <div className="absolute left-6 top-5 z-10 flex w-[220px] flex-col items-start gap-2">
                {liveChip}
                {tunedChip}
                {member && <WatchersCard watchers={watchers} />}
              </div>
              {member && (
                <ReactionStack reactions={floats} className="absolute bottom-24 left-6 z-10" />
              )}
              {!toast && arrival && (arrival.now || arrivals === 1) && (
                <ArrivalToast
                  saver={arrival.saver}
                  post={arrival.post}
                  hue={momentHue}
                  now={arrival.now}
                  onPlay={arrival.now ? undefined : () => goTo(index + 1)}
                  className="absolute right-0 top-5 z-30 max-w-[240px]"
                />
              )}
              <div
                role="radiogroup"
                aria-label="When this moment runs out"
                className="absolute bottom-5 left-1/2 z-10 flex h-[52px] -translate-x-1/2 gap-1 rounded-full border border-white/[0.12] bg-black/55 p-1 backdrop-blur-md"
              >
                {[
                  {
                    on: !wander,
                    label: 'Stay close',
                    icon: Target,
                    pick: () => toggleWander(false),
                  },
                  { on: wander, label: 'Wander', icon: Waves, pick: () => toggleWander(true) },
                ].map((b) => (
                  <button
                    key={b.label}
                    type="button"
                    role="radio"
                    aria-checked={b.on}
                    onClick={b.pick}
                    className={cn(
                      'flex h-11 items-center gap-2 whitespace-nowrap rounded-full px-[22px] text-[15px]',
                      b.on
                        ? 'bg-nx-cream font-extrabold text-black'
                        : 'font-semibold text-nx-cream',
                    )}
                  >
                    <b.icon aria-hidden className="h-4 w-4" />
                    <span>{b.label}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          <div
            className={cn(
              'absolute inset-0',
              wide &&
                'relative inset-auto flex min-h-0 flex-1 items-center justify-center [container-type:size]',
              wide && layout === 'panel' && 'pt-5',
            )}
            style={
              {
                '--nx-ar': String(aspect),
                '--nx-reserve': `${reserve + (wide && layout === 'panel' ? 20 : 0)}px`,
                '--nx-side': layout === 'panel' ? '160px' : '72px',
              } as CSSProperties
            }
          >
            <div
              className={cn('absolute inset-0', wide && 'relative inset-auto flex items-end gap-5')}
              // The dimmed room centres the stage itself; the rail hangs beside it.
              style={
                wide
                  ? { marginBottom: reserve, paddingLeft: layout === 'panel' ? 80 : 0 }
                  : undefined
              }
            >
              <div className={cn('absolute inset-0', wide && 'relative inset-auto')}>
                <div
                  ref={frameRef}
                  className={cn(
                    'absolute inset-0 overflow-hidden bg-nx-stage',
                    wide &&
                      'relative inset-auto shrink-0 rounded-[24px] bg-nx-surface [&:fullscreen]:rounded-none',
                    wide &&
                      (textFrame
                        ? 'h-[calc(100cqh_-_var(--nx-reserve))] w-[min(calc(100cqw_-_var(--nx-side)),720px)]'
                        : 'w-[min(calc(100cqw_-_var(--nx-side)),calc((100cqh_-_var(--nx-reserve))_*_var(--nx-ar)))] [aspect-ratio:var(--nx-ar)]'),
                    wide && layout === 'panel' && 'shadow-[0_30px_80px_rgba(0,0,0,0.6)]',
                  )}
                  style={
                    wide && source.moment
                      ? { boxShadow: `0 0 0 2px ${momentHue}8c, 0 30px 80px rgba(0,0,0,0.6)` }
                      : undefined
                  }
                >
                  <h2 className="sr-only">{words.title || author.handle || author.name}</h2>
                  <div className="absolute inset-0">
                    <Stage
                      item={theaterItem}
                      muted={muted}
                      onRequestUnmute={() => setMuted(false)}
                      onEnded={() => {
                        if (!blockingPanel.current) void next()
                      }}
                      photoCaption={false}
                      repeat={repeat === 'one'}
                      covered={overlay || caughtUp || gettingReady || (panel !== null && !isVideo)}
                    />
                    {gettingReady && keep.status && (
                      <GettingReadyStage post={current.post} status={keep.status} wide={wide} />
                    )}
                    {kind === 'post' && (
                      // Room on the right so the rail never sits on the words.
                      <div
                        className={cn(
                          'absolute inset-0 bg-nx-cream',
                          wide
                            ? 'px-2 pb-20 pt-16'
                            : 'pb-28 pr-[68px] pt-14 md:pb-24 md:pr-24 md:pt-16',
                        )}
                      >
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
                        <div
                          className={cn(
                            'absolute inset-0 bg-nx-ink',
                            wide
                              ? 'px-2 pb-20 pt-16'
                              : 'pb-24 pr-[68px] pt-14 md:pb-20 md:pr-24 md:pt-16',
                          )}
                        >
                          <ArticleReader
                            item={current.post}
                            inline
                            onNext={() => void next()}
                            onProgress={setArticleProgress}
                            seekRef={articleSeek}
                          />
                        </div>
                      ) : (
                        <div
                          className={cn(
                            'absolute inset-0 bg-nx-ink',
                            wide
                              ? 'px-2 pb-20 pt-16'
                              : 'pb-28 pr-[68px] pt-14 md:pb-24 md:pr-24 md:pt-16',
                          )}
                        >
                          <ArticleStage item={current.post} onSkip={() => void next()} />
                        </div>
                      ))}
                  </div>

                  {/* What's playing, at the stage's top-left. */}
                  {toast && !caughtUp && (
                    // A short message takes the top pills' place for 3 s, never stacked under them.
                    <div
                      className={cn(
                        'pointer-events-none absolute inset-x-3 z-30 flex justify-center',
                        wide ? 'top-4' : 'top-[max(68px,calc(env(safe-area-inset-top)+60px))]',
                      )}
                    >
                      {toastPill}
                    </div>
                  )}
                  <div
                    ref={chipsRef}
                    aria-hidden={toast ? true : undefined}
                    className={cn(
                      'pointer-events-none absolute z-10 flex flex-wrap items-start gap-2',
                      toast && 'invisible',
                      wide
                        ? 'inset-x-4 top-4 pr-14'
                        : 'inset-x-3 top-[max(68px,calc(env(safe-area-inset-top)+60px))] pr-14',
                      // On a cream page see-through chips turn muddy grey: make them solid.
                      overlay &&
                        '[&>[role=note]]:!bg-[#1c1b19] [&>a]:!bg-[#1c1b19] [&>button]:!bg-[#1c1b19] [&_.nx-plate]:!bg-[#1c1b19] [&_.nx-plate]:![backdrop-filter:none] [&_.nx-plate]:![text-shadow:none] [&_.nx-plate]:!shadow-none',
                    )}
                  >
                    {!wide && source.moment && (
                      <>
                        {liveChip}
                        {member && watchers.length > 0 && (
                          <WatchersBar
                            watchers={watchers}
                            className="pointer-events-auto !py-1.5"
                          />
                        )}
                      </>
                    )}
                    {layout === 'list' && !source.recent && !source.shared && backChip}
                    {!wide && layout === 'panel' && !source.moment && backChip}
                    {gettingReady && !isPrivate ? (
                      <SharedWithChip people={keep.people} className="max-w-full" />
                    ) : keep.justKept ? (
                      <KeptChip />
                    ) : null}
                    {wide && whyChip && !gettingReady && (
                      <WhyChip post={current.post} onOpen={openWhy} />
                    )}
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
                    {!wide && source.moment && tuneIntro && !overlay && (
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
                          Playing what people are saving like this, newest first. It keeps going as
                          new saves land.
                        </span>
                        <div
                          role="group"
                          aria-label="How close to stay"
                          // Edge to edge in the plate: 16 − 14 leaves the 8 px floor.
                          className="flex gap-1 rounded-[8px] bg-white/10 p-[3px]"
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
                                'h-8 flex-1 rounded-[8px] text-[13px] font-bold',
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
                    {viaNote}
                  </div>
                  {muteOnFrame && !gettingReady && muteButton}

                  {member && !(wide && layout === 'panel' && source.moment) && (
                    // Rising from just above the byline, clear of the rail.
                    <ReactionFloats
                      reactions={floats}
                      className="absolute bottom-[200px] left-0 right-[72px] z-20"
                    />
                  )}

                  {/* The byline and transport, on the stage's bottom scrim. */}
                  <div
                    className={cn(
                      // Taps fall through to the stage except on the controls and caption.
                      'pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col bg-gradient-to-b from-transparent to-black/90',
                      !wide && 'gap-2 px-4 pb-3 pt-24',
                      wide && layout === 'panel' && 'gap-2.5 px-[18px] pb-3 pt-[110px]',
                      wide && layout !== 'panel' && tallFrame && 'gap-2 px-5 pb-[18px] pt-[110px]',
                      wide && layout !== 'panel' && !tallFrame && 'gap-2 px-6 pb-[18px] pt-[120px]',
                    )}
                  >
                    {!overlay && (
                      <div
                        className={cn(
                          'nx-text-shadow flex min-w-0 flex-col',
                          wide ? 'max-w-[760px] gap-2' : 'gap-2 pr-[68px]',
                          wide && layout === 'panel' && 'gap-2.5 pb-3.5',
                        )}
                      >
                        {!wide && source.moment && title && (
                          <span className="flex h-[26px] items-center gap-1.5 self-start whitespace-nowrap rounded-full bg-black/45 px-2.5 text-xs font-semibold backdrop-blur-md [text-shadow:none]">
                            <span className="text-nx-soft">In</span>
                            <span className="min-w-0 truncate font-extrabold">{title}</span>
                          </span>
                        )}
                        {!wide && whyChip && (
                          <WhyChip
                            post={current.post}
                            onOpen={openWhy}
                            chevron
                            className="self-start [text-shadow:none]"
                          />
                        )}
                        {/* The note sits on its own line over the whole byline. */}
                        {savers && savers.length > 0 && !gettingReady && bylineNote(savers) && (
                          <SaverNote
                            saver={bylineNote(savers)!}
                            className="self-start [text-shadow:none]"
                          />
                        )}
                        {/* Who saved it: faces and "You and Mum saved this · 1h". The post's
                            own author, network and words live in the original-post sheet. */}
                        {((savers && savers.length > 0) || isPrivate || current.wander) && (
                          <div className="flex min-w-0 items-center gap-2.5">
                            {savers && savers.length > 0 && (
                              <SaversButton
                                savers={savers}
                                placement="above"
                                noteBubble={false}
                                framed
                                faces={
                                  <FaceStack
                                    savers={savers}
                                    size={wide && layout !== 'panel' ? 30 : 28}
                                  />
                                }
                              />
                            )}
                            {savers && savers.length > 0 && (
                              <span
                                className={cn(
                                  'min-w-0 truncate font-bold',
                                  wide && layout === 'feed' ? 'text-[15px]' : 'text-sm',
                                  layout === 'panel' && 'font-extrabold',
                                )}
                              >
                                {bylineLine(savers)}
                              </span>
                            )}
                            {isPrivate && <PrivateLock tone="scrim" />}
                            {(() => {
                              const when = current.savedAt
                                ? timeAgo(current.savedAt)
                                : layout === 'panel'
                                  ? null
                                  : savedAgo(savers)
                              return when && savers && savers.length > 0 ? (
                                <span
                                  className={cn(
                                    'shrink-0 whitespace-nowrap text-nx-soft',
                                    wide && layout === 'feed' ? 'text-sm' : 'text-[13px]',
                                  )}
                                >
                                  {`· ${when}`}
                                </span>
                              ) : null
                            })()}
                            {current.wander && (
                              <span className="nx-plate rounded-full px-2.5 py-0.5 text-xs font-bold">
                                Wandering
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    {fullTransport ? (
                      <div className="pointer-events-auto mt-1.5 flex items-center gap-3">
                        <ControlButton
                          label={paused ? 'Play' : 'Pause'}
                          onClick={togglePlay}
                          className="bg-white/[0.14] hover:bg-white/20"
                        >
                          {paused ? (
                            <Play
                              aria-hidden
                              className="h-5 w-5"
                              fill="currentColor"
                              strokeWidth={0}
                            />
                          ) : (
                            <Pause
                              aria-hidden
                              className="h-5 w-5"
                              fill="currentColor"
                              strokeWidth={0}
                            />
                          )}
                        </ControlButton>
                        {transportSkips(false)}
                        {timeNow ? (
                          <span className="text-[13px] font-semibold tabular-nums">{timeNow}</span>
                        ) : null}
                        <SeekBar
                          value={progress}
                          onSeek={seekTo}
                          disabled={kind === 'article' && !reading}
                        />
                        <span className="whitespace-nowrap text-[13px] font-semibold tabular-nums text-nx-soft">
                          {timeAll ?? timeLabel}
                        </span>
                        {isVideo && (
                          <ControlButton
                            label={shownMuted ? 'Unmute' : 'Mute'}
                            onClick={toggleMute}
                          >
                            {shownMuted ? (
                              <VolumeX aria-hidden className="h-5 w-5" />
                            ) : (
                              <Volume2 aria-hidden className="h-5 w-5" />
                            )}
                          </ControlButton>
                        )}
                        <ControlButton
                          label={fullscreen ? 'Exit full screen' : 'Full screen'}
                          onClick={toggleFullscreen}
                        >
                          {fullscreen ? (
                            <Minimize aria-hidden className="h-5 w-5" />
                          ) : (
                            <Maximize aria-hidden className="h-5 w-5" />
                          )}
                        </ControlButton>
                      </div>
                    ) : wide && layout !== 'panel' ? (
                      <div className="pointer-events-auto mt-1.5 flex items-center gap-2.5">
                        <ControlButton
                          label={paused ? 'Play' : 'Pause'}
                          onClick={togglePlay}
                          className="bg-white/[0.14] hover:bg-white/20"
                        >
                          {paused ? (
                            <Play
                              aria-hidden
                              className="h-5 w-5"
                              fill="currentColor"
                              strokeWidth={0}
                            />
                          ) : (
                            <Pause
                              aria-hidden
                              className="h-5 w-5"
                              fill="currentColor"
                              strokeWidth={0}
                            />
                          )}
                        </ControlButton>
                        {transportSkips(false)}
                        <SeekBar
                          value={progress}
                          onSeek={seekTo}
                          disabled={kind === 'article' && !reading}
                        />
                        <span className="whitespace-nowrap text-xs font-semibold tabular-nums text-nx-soft">
                          {timeLabel}
                        </span>
                      </div>
                    ) : (
                      // Phones and the dimmed room: a thin line; tap the picture to pause,
                      // or the quiet glyph at its start (the one screen readers find).
                      <div className="pointer-events-auto flex items-center gap-2.5">
                        <ControlButton
                          label={paused ? 'Play' : 'Pause'}
                          onClick={togglePlay}
                          className="-my-2.5 -ml-2 h-8 w-8 text-white/90 hover:bg-white/10"
                        >
                          {paused ? (
                            <Play
                              aria-hidden
                              className="h-4 w-4"
                              fill="currentColor"
                              strokeWidth={0}
                            />
                          ) : (
                            <Pause
                              aria-hidden
                              className="h-4 w-4"
                              fill="currentColor"
                              strokeWidth={0}
                            />
                          )}
                        </ControlButton>
                        {transportSkips(wide && !!source.moment)}
                        <SeekBar
                          value={progress}
                          onSeek={seekTo}
                          disabled={kind === 'article' && !reading}
                          thin
                        />
                        {overlay && timeLabel && (
                          <span className="whitespace-nowrap text-[11px] font-semibold tabular-nums text-white/85">
                            {timeLabel}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {source.moment && waiting && (
                    // Dim what's behind, so the note doesn't read over the last post.
                    <div
                      aria-hidden
                      className="pointer-events-none absolute inset-0 z-[15] bg-black/60 backdrop-blur-[2px]"
                    />
                  )}
                  {source.moment && waiting && (
                    <div
                      role="status"
                      className="nx-plate absolute left-1/2 top-1/2 z-20 flex w-[min(320px,calc(100%-32px))] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2 rounded-3xl px-6 py-5 text-center"
                    >
                      <span
                        aria-hidden
                        className="block h-3 w-3 rounded-full animate-nx-live-pulse"
                        style={{ background: momentHue }}
                      />
                      <span className="font-nx-serif text-[28px] leading-tight">
                        You’re all caught up. Go touch grass.
                      </span>
                      <span className="text-sm text-white/75">
                        New saves play here as they land.
                      </span>
                    </div>
                  )}
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
                        <Link
                          href={back}
                          className="rounded-full border border-white/30 px-5 py-3 text-sm"
                        >
                          {source.feed ? 'Browse channels' : 'Back to search'}
                        </Link>
                      </div>
                    </div>
                  )}
                  {member && reactOpen && (
                    <ReactionPicker
                      onEmoji={(emoji) => sendReaction({ emoji })}
                      onText={(text) => sendReaction({ text })}
                      onClose={() => setReactOpen(false)}
                      live={!!source.moment}
                      disabled={reacting}
                      error={reactionError}
                      className="absolute inset-x-3 bottom-[max(16px,env(safe-area-inset-bottom))] z-40"
                    />
                  )}
                </div>
                {showNextCard && upNext && (
                  <NextCard
                    item={upNext}
                    seconds={secondsLeft}
                    onSkip={() => void next()}
                    className={cn(
                      'absolute top-full mt-4',
                      tallFrame ? 'left-1/2 w-[520px] -translate-x-1/2' : 'inset-x-0',
                    )}
                  />
                )}
              </div>

              <nav
                aria-label="Post actions"
                className={cn(
                  'z-10 flex flex-col',
                  wide && layout === 'panel'
                    ? 'w-[60px] items-center gap-3.5 pb-3.5'
                    : wide
                      ? 'gap-3.5 pb-2'
                      : 'absolute bottom-[34px] right-3 max-h-[calc(100%-150px)] gap-3 overflow-y-auto overscroll-contain [scrollbar-width:none]',
                )}
              >
                {current &&
                  railItem(
                    <ReactButton
                      open={reactOpen}
                      className={railStyle(false, reactOpen).replace('pointer-events-auto ', '')}
                      onToggle={() => {
                        if (!member) {
                          if (authLoading) return
                          // Signed out: sign in, then back to this post's own page (like Save).
                          const returnTo = previewPath(
                            current.post.platform ?? 'twitter',
                            current.post.author,
                            current.post.id,
                            kind === 'photo' ? 'photo' : null,
                          )
                          window.location.assign(`/start?${new URLSearchParams({ returnTo })}`)
                          return
                        }
                        if (!reactOpen) {
                          reactionTarget.current = itemsRef.current[indexRef.current]?.post ?? null
                          setReactionError(null)
                        }
                        setReactOpen((o) => !o)
                      }}
                    />,
                    'React',
                  )}
                {railItem(
                  <button
                    type="button"
                    aria-label={saved ? 'Saved. Add to a channel' : 'Save'}
                    title={saved ? 'Saved. Add to a channel' : 'Save'}
                    aria-pressed={saved}
                    onClick={() => void save()}
                    className={railStyle(saved)}
                  >
                    <Bookmark
                      aria-hidden
                      className="h-[22px] w-[22px]"
                      fill={saved ? 'currentColor' : 'none'}
                    />
                  </button>,
                  saved ? 'Saved' : 'Save',
                )}
                {railItem(
                  <button
                    type="button"
                    aria-label="Share"
                    title="Share"
                    onClick={(e) => {
                      railAnchor(e.currentTarget)
                      shareIt()
                    }}
                    className={railStyle()}
                  >
                    <ShareIcon aria-hidden className="h-[22px] w-[22px]" />
                  </button>,
                  'Share',
                )}
                {railItem(
                  <button
                    type="button"
                    aria-label={
                      textOnly
                        ? copied
                          ? 'Copied'
                          : kind === 'article'
                            ? 'Copy the article'
                            : 'Copy the text'
                        : 'Download'
                    }
                    title={textOnly ? 'Copy the text' : 'Download'}
                    onClick={() => void downloadIt()}
                    className={railStyle()}
                  >
                    {textOnly ? (
                      copied ? (
                        <Check
                          aria-hidden
                          className="h-[22px] w-[22px] text-nx-accent"
                          strokeWidth={2.6}
                        />
                      ) : (
                        <Copy aria-hidden className="h-[21px] w-[21px]" />
                      )
                    ) : (
                      <Download
                        aria-hidden
                        className={cn('h-[21px] w-[21px]', send.sending && 'animate-pulse')}
                      />
                    )}
                  </button>,
                  textOnly ? 'Copy' : 'Download',
                )}
                {railItem(
                  // The network's own mark: who posted it and everything they wrote.
                  <button
                    type="button"
                    aria-label={`The original post on ${networkName}`}
                    title={`The original post on ${networkName}`}
                    aria-haspopup="dialog"
                    aria-expanded={panel === 'original'}
                    onClick={() => setPanel(panel === 'original' ? null : 'original')}
                    className={railStyle(false, panel === 'original')}
                  >
                    <NetworkIcon platform={current.post.platform} className="h-[22px] w-[22px]" />
                  </button>,
                  'Original',
                )}
                {railItem(
                  <button
                    ref={moreRef}
                    type="button"
                    aria-label="More options"
                    title="More options"
                    aria-haspopup="menu"
                    aria-expanded={panel === 'more'}
                    onClick={toggleMore}
                    className={railStyle(false, panel === 'more')}
                  >
                    <Ellipsis aria-hidden className="h-[22px] w-[22px]" />
                  </button>,
                  'More',
                )}
              </nav>
            </div>
          </div>
        </section>

        {wide && layout === 'feed' && panel === 'why' && (
          <WhyPanel
            item={current}
            onClose={() => setPanel(null)}
            friends={
              whyFriends.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  {whyFriends.map((friend) => {
                    const weight = weights?.[friend.username] ?? 0
                    return (
                      <div key={friend.username} className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                          {friend.name}
                        </span>
                        {([-1, 1] as const).map((w) => (
                          <button
                            key={w}
                            type="button"
                            aria-pressed={weight === w}
                            aria-label={`Show ${w === 1 ? 'more' : 'less'} from ${friend.name}`}
                            disabled={weights === null || weightBusy === friend.username}
                            onClick={() => void setFriendWeight(friend, weight === w ? 0 : w)}
                            className={cn(
                              'h-8 shrink-0 whitespace-nowrap rounded-full border px-3 text-[13px] font-semibold disabled:opacity-50',
                              weight === w
                                ? 'border-nx-cream bg-nx-cream text-black'
                                : 'border-white/[0.08] text-nx-muted',
                            )}
                          >
                            {w === 1 ? 'Show more' : 'Show less'}
                          </button>
                        ))}
                      </div>
                    )
                  })}
                </div>
              ) : null
            }
          />
        )}

        {wide && layout === 'list' && (
          <aside aria-label="Up next" className="flex min-h-0 w-[320px] shrink-0 flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3 px-2 pb-2">
              <h2 className="m-0 font-nx-serif text-[32px] font-normal leading-none">Up next</h2>
              <span className="truncate whitespace-nowrap text-[13px] text-nx-muted">
                {source.recent ? 'From My saves' : source.shared ? 'More like this' : countLine}
              </span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:none]">
              <UpNextList items={items} index={index} variant="saves" onPlay={goTo} />
            </div>
          </aside>
        )}

        {wide && layout === 'panel' && (
          <aside
            aria-label={source.moment ? 'This moment' : 'Channel'}
            className="relative z-10 flex min-h-0 w-[400px] shrink-0 flex-col gap-3.5 overflow-y-auto border-l border-white/[0.08] bg-nx-ink px-7 py-6 [scrollbar-width:none]"
          >
            {source.moment ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold uppercase tracking-[0.1em] text-nx-muted">
                    Right now
                  </span>
                  <Link
                    href="/now"
                    className="flex h-11 items-center rounded-full border border-white/[0.22] px-4 text-sm font-extrabold text-nx-cream"
                  >
                    Leave
                  </Link>
                </div>
                <h1 className="m-0 -mt-1.5 font-nx-serif text-[44px] font-normal leading-[0.95]">
                  {title ?? 'Right now'}
                </h1>
                <span className="flex items-center gap-2 text-sm text-nx-soft">
                  <span aria-hidden className="block h-2 w-2 rounded-full bg-[#ff5a3c]" />
                  <span className="font-extrabold text-nx-cream">LIVE</span>
                  <span aria-hidden>·</span>
                  <span>{momentPace(items)}</span>
                  {watching > 0 && (
                    <>
                      <span aria-hidden>·</span>
                      <span>{`${watching} watching`}</span>
                    </>
                  )}
                </span>
                <PanelDivider />
                <h2 className="m-0 text-[15px] font-extrabold">Up next</h2>
                <UpNextList
                  items={items}
                  index={index}
                  variant="moment"
                  hue={momentHue}
                  onPlay={goTo}
                  limit={6}
                />
                {member && (
                  <>
                    <PanelDivider />
                    <h2 className="m-0 text-[15px] font-extrabold">Say something</h2>
                    <QuickWords onSay={sayWord} disabled={reacting} said={said} />
                    {reactionError && (
                      <p role="status" className="m-0 text-sm text-[#ffb891]">
                        {reactionError}
                      </p>
                    )}
                  </>
                )}
                <p className="m-0 text-[13px] leading-[1.45] text-nx-muted">
                  <span className="font-extrabold text-nx-soft">Stay close</span>
                  <span> keeps you on this moment. </span>
                  <span className="font-extrabold text-nx-soft">Wander</span>
                  <span> drifts into nearby saves when it runs out.</span>
                </p>
              </>
            ) : (
              <>
                <span className="text-xs font-extrabold uppercase tracking-[0.1em] text-nx-muted">
                  {channelKind}
                </span>
                <h1 className="m-0 font-nx-serif text-[42px] font-normal leading-[0.95]">
                  {title ?? 'Channel'}
                </h1>
                <div className="flex items-center gap-2.5 text-sm text-nx-soft">
                  {inQueue.length > 0 && (
                    <FaceStack savers={inQueue} size={26} ring="#0f0e0c" max={3} />
                  )}
                  <span>
                    {[
                      `${Math.max(position.of, feedTotal)} ${source.reacted ? 'posts with reactions' : 'saves'}`,
                      inQueue.length > 0 ? bylineLine(inQueue, false) : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </div>
                <div className="mt-1 flex gap-2.5">
                  {source.groupChannel &&
                    (groupKept ? (
                      // Kept: one of your channels now; Open goes to it.
                      <Link
                        href={groupKept.url}
                        className="flex h-[52px] flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full border border-nx-accent/60 px-5 text-[15px] font-extrabold text-nx-accent"
                      >
                        <Check aria-hidden className="h-[18px] w-[18px]" strokeWidth={2.6} />
                        <span>Kept · Open</span>
                      </Link>
                    ) : (
                      <button
                        type="button"
                        disabled={keeping}
                        onClick={() => void keepChannel()}
                        className="flex h-[52px] flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-nx-accent px-5 text-[15px] font-extrabold text-black disabled:opacity-70"
                      >
                        <Plus aria-hidden className="h-[18px] w-[18px]" strokeWidth={2.6} />
                        <span>Keep this channel</span>
                      </button>
                    ))}
                  {source.auto && (
                    // Made for you: keep it as one of your own channels (private until shared).
                    <button
                      type="button"
                      disabled={keeping || kept}
                      onClick={() => void keepChannel()}
                      className="flex h-[52px] flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-nx-accent px-5 text-[15px] font-extrabold text-black disabled:opacity-70"
                    >
                      {kept ? (
                        <Check aria-hidden className="h-[18px] w-[18px]" strokeWidth={2.6} />
                      ) : (
                        <Plus aria-hidden className="h-[18px] w-[18px]" strokeWidth={2.6} />
                      )}
                      <span>{kept ? 'Kept' : 'Keep this channel'}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      void navigator.clipboard
                        ?.writeText(window.location.href)
                        .then(() => flash('Link copied'))
                        .catch(() => flash('Couldn’t copy the link'))
                    }
                    className="flex h-[52px] items-center justify-center gap-2 whitespace-nowrap rounded-full border border-white/[0.22] px-[18px] text-[15px] font-extrabold text-nx-cream"
                  >
                    <Share aria-hidden className="h-[18px] w-[18px]" />
                    <span>{source.reacted ? 'Copy link' : 'Share channel'}</span>
                  </button>
                </div>
                <PanelDivider />
                <div className="flex items-baseline justify-between">
                  <h2 className="m-0 text-[15px] font-extrabold">Up next</h2>
                  <span className="text-[13px] text-nx-muted">
                    {`${Math.max(0, Math.max(position.of, feedTotal) - position.n)} to go`}
                  </span>
                </div>
                <UpNextList
                  items={items}
                  index={index}
                  variant="channel"
                  onPlay={goTo}
                  limit={12}
                />
              </>
            )}
          </aside>
        )}

        {caughtUp && (
          <CaughtUpStage
            className="absolute inset-0 z-20"
            onWatchAgain={() => switchFeed('everyone')}
            waiting={feedWaiting}
            onShowWaiting={showWaiting}
            recap={recap}
            tonight={wide}
          />
        )}

        {!toast && !wide && source.moment && arrival && (arrival.now || arrivals === 1) && (
          <div
            className="absolute right-3 top-[max(116px,calc(env(safe-area-inset-top)+108px))] z-30 max-w-[calc(100%-24px)]"
            style={chipsBottom > 0 ? { top: `max(116px, ${chipsBottom + 8}px)` } : undefined}
          >
            <ArrivalToast
              saver={arrival.saver}
              post={arrival.post}
              hue={momentHue}
              now={arrival.now}
              onPlay={arrival.now ? undefined : () => goTo(index + 1)}
            />
          </div>
        )}
        {!toast && source.moment && arrivals > 0 && !(arrivals === 1 && arrival) && (
          <div
            role="status"
            className="absolute left-1/2 top-[max(76px,calc(env(safe-area-inset-top)+64px))] z-30 flex -translate-x-1/2 items-center gap-3 whitespace-nowrap rounded-full bg-[#1c1b19]/95 py-2 pl-4 pr-2 text-sm shadow-nx-toast animate-nx-slide-in md:top-4"
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
            note={
              current && {
                platform: current.post.platform ?? 'twitter',
                id: current.post.id,
                value: savers?.find((s) => s.isYou)?.note ?? null,
              }
            }
            onNote={(note) => setNoteNow((m) => new Map(m).set(currentKey, note))}
            onClose={() => {
              setPanel(null)
              setCreated(null)
            }}
          />
        )}
        {panel === 'why' && !(wide && layout === 'feed') && (
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
            anchor={wide ? moreAnchor : null}
            url={publicUrl()}
            post={
              member ? { platform: current.post.platform ?? 'twitter', id: current.post.id } : null
            }
            waiting={pausedForShare.current || timed}
            onClose={() => setPanel(null)}
          />
        )}
        {panel === 'original' && (
          <OriginalSheet
            post={current.post}
            kind={kind}
            url={originalUrl}
            onCopy={(url) => {
              setPanel(null)
              void navigator.clipboard
                ?.writeText(url)
                .then(() => flash('Link copied'))
                .catch(() => flash('Couldn’t copy the link'))
            }}
            onClose={() => setPanel(null)}
          />
        )}
        {panel === 'more' && (
          <MoreSheet
            anchor={wide ? moreAnchor : null}
            rows={menu.map((row) => ({
              ...row,
              onSelect: () => {
                row.onSelect()
                // Switches and Repeat change in place; Why this one and Up next open their own.
                if (
                  row.checked === undefined &&
                  row.label !== 'Repeat' &&
                  row.label !== 'Why this one' &&
                  row.label !== 'Up next'
                ) {
                  setPanel(null)
                }
              },
            }))}
            onClose={() => setPanel(null)}
          />
        )}
        {filterOpen && source.feed && (
          <FeedFilterSheet
            types={shownTypes}
            onTypes={changeTypes}
            mode={source.feed}
            onMode={(mode) => {
              setFilterOpen(false)
              switchFeed(mode)
            }}
            unseen={unseen}
            waiting={waitingLine(feedWaiting) || null}
            summary={feedTypesSummary(shownTypes)}
            onClose={() => setFilterOpen(false)}
          />
        )}
        {paste.toast}
        {toast && caughtUp && (
          // No stage to sit on: under the header instead.
          <div className="pointer-events-none absolute inset-x-4 top-[max(68px,calc(env(safe-area-inset-top)+60px))] z-30 flex justify-center md:top-4">
            {toastPill}
          </div>
        )}
      </div>
      <header className="pointer-events-none fixed inset-x-0 top-0 z-[41] flex items-center gap-2.5 bg-gradient-to-b from-black/60 to-transparent px-4 pb-6 pt-[max(12px,env(safe-area-inset-top))] md:h-[72px] md:gap-4 md:border-b md:border-white/[0.08] md:bg-nx-ink md:bg-none md:px-8 md:py-0 lg:gap-7">
        {/* Phones: Gob, New · Channels · Live, and one tool. */}
        <PhoneGob className="pointer-events-auto md:hidden" />
        <PhoneTabs
          current={navHere}
          unseen={unseen}
          className="pointer-events-auto min-w-0 md:hidden"
        />
        {/* Wide: the same header as every other screen, logo, tabs and search. */}
        <NxLogo className="pointer-events-auto hidden md:flex" />
        <PrimaryNav current={navHere} className="pointer-events-auto" />
        <span className="flex-1" />
        {source.feed && (
          <RoundIconButton
            label={`What’s in your feed: ${feedTypesSummary(shownTypes)}`}
            icon={PhoneFilterIcon}
            onClick={() => setFilterOpen(true)}
            className="pointer-events-auto lg:hidden"
          />
        )}
        {/* Phones show one tool (the feed's filter wins); tablets have room for both. */}
        <RoundIconButton
          label="Search"
          icon={PhoneSearchIcon}
          onClick={openQuickSearch}
          className={cn('pointer-events-auto lg:hidden', source.feed && 'hidden md:flex')}
        />
        {/* Wide screens paste with ⌘V (the pill kept for keyboards); below lg it's in ⋯. */}
        <PasteButton
          onClick={paste.pasteFromClipboard}
          keyboardOnlyFrom="lg"
          className="pointer-events-auto hidden lg:flex"
        />
        <div className="pointer-events-auto hidden lg:flex">
          <HeaderSearch shortcut className="md:w-[260px] xl:w-[340px]" />
        </div>
        <AccountMenu className="pointer-events-auto" avatarOnPhones={false} />
      </header>
      <BottomNav current={navHere} />
    </>
  )
}

/** A saver with the note set here (undefined: as the server sent it; null: none). */
function withNote(saver: Saver, note: string | null | undefined): Saver {
  if (note === undefined) return saver
  const { note: _was, ...rest } = saver
  return note ? { ...rest, note } : rest
}
