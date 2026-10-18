'use client'

import { composeArticleCopy, fetchArticleMarkdown } from '@/lib/theater/article-body'
import { RichText, postBody } from '../rich-text'
import { ArticleReader } from '../stages/ArticleReader'
import { timeAgo, useMomentStream } from '../moments/live'
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
  type ChannelOption,
  type MenuRow,
} from './TheaterSheets'
import { stage, useDwell, useStageTap, useVideoState } from './usePlayerState'
import { LearningPill, LearningSheet, useLearningStatus } from '../onboarding/learning'
import { PasteButton, usePasteToSave } from '../onboarding/usePasteToSave'
import { channelTitle } from '../channels/ChannelParts'

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
type Panel = null | 'queue' | 'more' | 'save' | 'share'

type QueueResponse = SearchResponse & {
  name?: string
  channel?: { tag: string }
  /** A moment's detail (Tune in): its items carry when they were saved. */
  moment?: { title: string; hue: string; watching: number }
}

/** What to say when there's nothing to play, by where the queue came from. */
function emptyState(
  source: PlaySource,
  load: Load,
): { title: string; body: string; action: string; href: string; retry?: boolean } {
  const missing = load.status === 'error' && load.missing
  if (source.moment && missing)
    return {
      title: 'This moment has passed',
      body: 'People have moved on. See what they’re saving now.',
      action: 'Right now',
      href: '/now',
    }
  if ((source.channel || source.auto) && missing)
    return {
      title: 'This channel isn’t here',
      body: 'It may have been made private or removed.',
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
  if (source.recent)
    return {
      title: 'Nothing saved yet',
      body: 'Paste a link from X, Instagram or TikTok, or bring in your X bookmarks.',
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
export const NX_POST_SAVED = 'nx-post-saved'

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
  const [arrivals, setArrivals] = useState(0)
  const [waiting, setWaiting] = useState(false)
  const [wander, setWander] = useState(false)
  const waitingRef = useRef(false)
  waitingRef.current = waiting

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
    fetchQueue(
      queueUrl(source, () => searchUrl({ ...source.search, view: 'bento' }, { refine: true })),
      controller.signal,
    )
      .then((response) => {
        // The recent queue is the feed: plain posts, all the viewer's own.
        const results = source.recent
          ? (response.items as unknown as FeedItem[]).map((post) => ({
              post,
              saved: true,
              matched: [],
            }))
          : source.moment
            ? (response.items as unknown as { post: FeedItem; savedAt: string }[]).map(
                ({ post, savedAt }) => ({ post, saved: false, matched: [], savedAt }),
              )
            : source.channel || source.auto
              ? response.items
              : orderByStrength(response.items)
        if (response.moment) {
          setMomentHue(response.moment.hue)
          setWatching(response.moment.watching)
        }
        setTitle(
          source.recent
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
  }, [source, lead])

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
  const goTo = useCallback((i: number) => {
    setCaptionOpen(false)
    setArticleProgress(0)
    setLongPost(false)
    setEnded(false)
    setWaiting(false)
    setArrivals(0)
    setTimedPaused(false)
    setIndex(i)
  }, [])

  // The queue as of now, for async steps that must not act on a stale render.
  const itemsRef = useRef(items)
  itemsRef.current = items
  const indexRef = useRef(index)
  indexRef.current = index
  const replaceItems = useCallback((list: SearchResultItem[]) => {
    itemsRef.current = list
    setItems(list)
  }, [])

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
      if (event.type === 'watching' && event.slug === source.moment) setWatching(event.watching)
      if (event.type !== 'save' || event.item.to?.kind !== 'moment') return
      if (event.item.to.slug !== source.moment) return
      const key = event.item.key
      const at = indexRef.current
      const existing = itemsRef.current.findIndex((i) => resultKey(i) === key)
      // Already watched: only worth replaying when there's nothing else to watch.
      if (existing !== -1 && existing <= at && !waitingRef.current) return
      const arrived: SearchResultItem = {
        post: event.item.post as unknown as FeedItem,
        saved: false,
        matched: [],
        savedAt: event.item.at,
      }
      if (waitingRef.current) {
        // Caught up: it plays now, at the end of the queue (moved there if it was earlier).
        const list = [...itemsRef.current.filter((_, i) => i !== existing), arrived]
        replaceItems(list)
        goTo(list.length - 1)
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
    wander,
    addWander,
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
          replaceItems(insertAfter(itemsRef.current, at, [pasted]))
          setSavedNow((s) => new Set(s).add(post.key))
          goTo(at + 1)
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
    active: timed && !ended && panel === null && !captionOpen,
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
  const ensureSaved = useCallback(async (): Promise<boolean> => {
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
        body: JSON.stringify({ url }),
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
      return true
    } catch {
      flash('Couldn’t save that. Try again.')
      return false
    }
  }, [current, saved, kind, currentKey, flash])

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
    : source.moment
      ? 'now'
      : source.channel || source.auto
        ? 'channels'
        : source.recent
          ? 'saves'
          : 'search'
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
              </span>
            </>
          )}
        </main>
      </div>
    )
  }

  const author = postAuthor(current.post)
  const caption = postText(current.post)
  const overlay = kind === 'post' || kind === 'article'
  const textOnly = !send.supported
  const menu: MenuRow[] = [
    { label: 'Add to a channel', onSelect: () => void save() },
    { label: 'Copy link', onSelect: () => void copyLink() },
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
    {
      label:
        current.post.platform === 'instagram'
          ? 'Open on Instagram'
          : current.post.platform === 'tiktok'
            ? 'Open on TikTok'
            : 'Open on X',
      onSelect: () => {
        const url = sourceUrl(
          current.post.platform ?? 'twitter',
          current.post.author,
          current.post.id,
          kind === 'photo' ? 'photo' : null,
        )
        if (url) window.open(url, '_blank', 'noopener,noreferrer')
      },
    },
    ...(current.saved ? [{ label: 'Archive', danger: true, onSelect: () => void archive() }] : []),
  ]

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
            covered={overlay || (panel !== null && !isVideo)}
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

        {/* Where this queue is from and what's playing, in one row at the stage's top-left. */}
        <div
          className={cn(
            'pointer-events-none absolute inset-x-3 top-[max(64px,calc(env(safe-area-inset-top)+56px))] z-10 flex flex-wrap items-start gap-2 md:left-7 md:right-24 md:top-4',
            // On a cream page see-through chips turn muddy grey: make them solid,
            // and on desktop join them into one pill split by thin lines.
            overlay &&
              '[&_.nx-plate]:!bg-[#1c1b19] [&_.nx-plate]:![backdrop-filter:none] [&_.nx-plate]:![text-shadow:none] [&_.nx-plate]:!shadow-none md:right-auto md:flex-nowrap md:items-stretch md:gap-0 md:divide-x md:divide-white/15 md:overflow-hidden md:rounded-[20px] md:bg-[#1c1b19] md:[&>*]:!rounded-none md:[&>*]:!bg-transparent md:[&>*]:!text-white',
          )}
        >
          {!source.recent && !source.shared && (
            <Link
              href={back}
              className="nx-plate pointer-events-auto hidden h-9 min-w-0 max-w-[320px] items-center gap-1.5 rounded-full pl-2 pr-4 text-[13px] font-bold md:flex"
            >
              <ChevronLeft aria-hidden className="h-4 w-4 shrink-0" />
              <span className="truncate">{title ?? (source.search.q || 'Search')}</span>
            </Link>
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
                  {`${viaReason(position.via, source.shared ? 'post' : source.channel || source.auto ? 'channel' : source.recent ? 'saves' : 'search')} · ${position.n} of ${position.of}`}
                </span>
              </span>
            </div>
          )}
        </div>

        {source.moment && arrivals > 0 && (
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

        <nav
          aria-label="Post actions"
          className="absolute bottom-[164px] right-3 z-10 flex flex-col gap-3 md:bottom-auto md:right-6 md:top-1/2 md:-translate-y-1/2"
        >
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
                Back to search
              </Link>
            </div>
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
            onClose={() => {
              setPanel(null)
              setCreated(null)
            }}
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
                if (row.checked === undefined && row.label !== 'Repeat') setPanel(null)
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
        <Link
          href={back}
          // Phones only; on desktop it leads the row of chips on the stage.
          className="nx-plate pointer-events-auto flex h-10 min-w-0 max-w-[60vw] items-center gap-1.5 rounded-full pl-2 pr-4 text-sm md:hidden"
        >
          <ChevronLeft aria-hidden className="h-4 w-4 shrink-0" />
          <span className="truncate">{title ?? (source.search.q || 'Search')}</span>
        </Link>
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
            <span className="nx-plate hidden h-8 items-center rounded-full px-3 text-xs tabular-nums text-white/85 md:flex">
              {`${position.n} of ${position.of}`}
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
