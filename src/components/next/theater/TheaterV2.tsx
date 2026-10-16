'use client'

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
  Search,
  Send,
  SkipBack,
  SkipForward,
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
import { useMobileSwipeNavigation } from '@/components/theater/useMobileSwipeNavigation'
import { previewPath, sourceUrl } from '@/lib/activity/preview-path'
import { postAuthor, postText } from '../post'
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
  queueUrl,
  searchHref,
  upcomingSavedKeys,
  type PlaySource,
  type RepeatMode,
} from './queue'
import {
  MoreSheet,
  SaveSheet,
  UpNextSheet,
  type ChannelOption,
  type MenuRow,
} from './TheaterSheets'
import { stage, useDwell, useStageTap, useVideoState } from './usePlayerState'
import { LearningPill, LearningSheet, useLearningStatus } from '../onboarding/learning'
import { PasteButton, usePasteToSave } from '../onboarding/usePasteToSave'
import { channelTitle } from '../channels/ChannelParts'

type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready' }
type Panel = null | 'queue' | 'more' | 'save'

type QueueResponse = SearchResponse & { name?: string; channel?: { tag: string } }

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
export function TheaterV2({ source }: { source: PlaySource }) {
  const router = useRouter()
  const rootRef = useRef<HTMLDivElement>(null)
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  /** A channel's name, once its queue loads. */
  const [title, setTitle] = useState<string | null>(null)
  const [items, setItems] = useState<SearchResultItem[]>([])
  const [index, setIndex] = useState(0)
  const [muted, setMuted] = useState(true)
  const [volume, setVolume] = useState(1)
  const [repeat, setRepeat] = useState<RepeatMode>('off')
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
  const extendingRef = useRef(false)

  // ——— Load the queue from the search this session came from ———
  useEffect(() => {
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
          : source.channel || source.auto
            ? response.items
            : orderByStrength(response.items)
        setTitle(
          source.recent
            ? 'Your saves'
            : (response.name ?? (response.channel ? channelTitle(response.channel.tag) : null)),
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
      .catch(() => {
        if (!controller.signal.aborted) setLoad({ status: 'error' })
      })
    return () => controller.abort()
  }, [source])

  const current = items[index] ?? null
  const currentKey = current ? resultKey(current) : ''
  const kind = current ? kindOf(current) : 'post'
  const isVideo = !!current && isVideoItem(current)
  const theaterItem = useMemo(
    () => (current ? feedItemToTheaterItem(current.post) : null),
    [current],
  )
  const video = useVideoState(currentKey)
  const send = useSendFile(theaterItem)
  const saved = !!current && (current.saved || savedNow.has(currentKey))

  const flash = useCallback((message: string) => {
    setToast(message)
    window.setTimeout(() => setToast((t) => (t === message ? null : t)), 2200)
  }, [])

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
    setEnded(false)
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

  /** "Stick to this vibe": append posts like `from`. Returns the new queue. */
  const extendWithVibe = useCallback(
    async (from: SearchResultItem): Promise<SearchResultItem[] | null> => {
      if (extendingRef.current) return null
      extendingRef.current = true
      try {
        const more = await fetchResults(similarUrl(from, source, videosOnly))
        const list = appendUnique(itemsRef.current, more)
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
    const extended = stick && current ? await extendWithVibe(current) : null
    const after = extended ? nextIndex(extended, index, { repeat: 'off', videosOnly }) : null
    if (after !== null) return goTo(after)
    setEnded(true)
  }, [items, index, repeat, videosOnly, stick, current, goTo, extendWithVibe])

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
      replaceItems(insertAfter(itemsRef.current, index, more))
      flash(`${more.length} more like this, up next`)
      return true
    } catch {
      flash('Couldn’t find more right now')
      return false
    }
  }, [current, source, index, flash, videosOnly, replaceItems])

  // ——— Playback ———
  const timed = !!current && !isVideo && kind !== 'article'
  const dwell = useDwell({
    active: timed && !ended && panel === null,
    seconds: current ? dwellSeconds(current) : 6,
    paused: timedPaused,
    resetKey: currentKey,
    onDone: () => {
      if (repeat === 'one') dwell.seek(0)
      else void next()
    },
  })
  const paused = isVideo ? !video.playing : timedPaused
  const progress = isVideo ? video.progress : timed ? dwell.progress : 0
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

  const seekTo = (p: number) => (isVideo ? stage.seek(p) : dwell.seek(p))

  // Tap the picture to pause (the stage itself only ever starts a stopped clip).
  const playingRef = useRef(video.playing)
  playingRef.current = video.playing
  useStageTap(() => {
    if (isVideo && playingRef.current) stage.pause()
    else if (timed) setTimedPaused((p) => !p)
  })

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
        flash('Sign in to save posts and make channels')
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

  const sendIt = useCallback(async () => {
    if (send.supported) {
      const ok = await send.send()
      if (!ok && send.primed) flash('Ready. Tap Send again to share it.')
      return
    }
    if (navigator.share) {
      await navigator.share({ url: publicUrl() }).catch(() => {})
      return
    }
    await copyLink()
  }, [send, publicUrl, copyLink, flash])

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
      if (t && (t.closest('input, textarea, select, [contenteditable="true"]') || panel)) return
      const k = e.key
      if (k === ' ' || k === 'k') {
        e.preventDefault()
        togglePlay()
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
        router.push(searchHref(source.search))
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
  if (load.status !== 'ready' || !current) {
    return (
      <div className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-5 bg-nx-stage px-6 text-center font-nx-sans text-nx-cream">
        {load.status === 'loading' ? (
          <AdhxLoader label="Lining them up…" />
        ) : (
          <>
            <span className="font-nx-serif text-[30px]">
              {load.status === 'error' ? 'That queue didn’t load' : 'Nothing to play here'}
            </span>
            <Link
              href={back}
              className="rounded-full bg-nx-accent px-5 py-3 text-sm font-bold text-nx-ink"
            >
              Back to search
            </Link>
          </>
        )}
      </div>
    )
  }

  const author = postAuthor(current.post)
  const caption = postText(current.post)
  const overlay = kind === 'post' || kind === 'article'
  const menu: MenuRow[] = [
    send.supported
      ? {
          label: send.mode === 'download' ? 'Download' : 'Send the file',
          onSelect: () => void sendIt(),
        }
      : {
          label: 'Copy text',
          onSelect: () => void navigator.clipboard?.writeText(caption).then(() => flash('Copied')),
        },
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
            : current.post.platform === 'youtube'
              ? 'Open on YouTube'
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
    <div
      ref={rootRef}
      className="fixed inset-0 z-40 overflow-hidden bg-nx-stage font-nx-sans text-white"
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
            <PostStage item={current.post} />
          </div>
        )}
        {kind === 'article' && (
          <div className="absolute inset-0 bg-nx-ink pb-28 pr-[68px] pt-14 md:pb-24 md:pr-24 md:pt-16">
            <ArticleStage item={current.post} onSkip={() => void next()} />
          </div>
        )}
      </div>

      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center gap-2 bg-gradient-to-b from-black/60 to-transparent px-3 pb-8 pt-[max(12px,env(safe-area-inset-top))] md:gap-3 md:px-7">
        <Link
          href={back}
          className="nx-plate pointer-events-auto flex h-10 min-w-0 max-w-[60vw] items-center gap-1.5 rounded-full pl-2 pr-4 text-sm md:max-w-[420px]"
        >
          <ChevronLeft aria-hidden className="h-4 w-4 shrink-0" />
          <span className="truncate">{title ?? (source.search.q || 'Search')}</span>
        </Link>
        <span className="flex-1" />
        <span className="nx-plate hidden h-8 items-center rounded-full px-3 text-xs tabular-nums text-white/85 md:flex">
          {`${index + 1} of ${items.length}`}
        </span>
        <LearningPill
          status={learning.status}
          onOpen={() => setLearningOpen(true)}
          className="pointer-events-auto hidden md:flex"
        />
        <PasteButton onClick={paste.pasteFromClipboard} className="pointer-events-auto" />
        <Link
          href={back}
          aria-label="Search"
          className="nx-plate pointer-events-auto flex h-10 items-center gap-2 rounded-full px-3 text-sm text-white/85 md:w-[260px] md:px-4"
        >
          <Search aria-hidden className="h-4 w-4" />
          <span className="hidden flex-1 md:inline">Describe it…</span>
          <span className="hidden rounded bg-white/15 px-1.5 text-xs md:inline">/</span>
        </Link>
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
        <RailButton
          label={send.supported && send.mode === 'download' ? 'Download' : 'Send'}
          onClick={() => void sendIt()}
        >
          <Send aria-hidden className={cn('h-[21px] w-[21px]', send.sending && 'animate-pulse')} />
        </RailButton>
        <RailButton label="Up next" onClick={() => setPanel(panel === 'queue' ? null : 'queue')}>
          <ListVideo aria-hidden className="h-[22px] w-[22px]" />
        </RailButton>
        <RailButton label="More options" onClick={() => setPanel(panel === 'more' ? null : 'more')}>
          <Ellipsis aria-hidden className="h-[22px] w-[22px]" />
        </RailButton>
      </nav>

      <div
        className={cn(
          'absolute inset-x-0 bottom-0 z-10 flex flex-col gap-2.5 px-4 pb-[max(14px,env(safe-area-inset-bottom))] pt-20 md:gap-3 md:px-7 md:pb-5',
          overlay ? 'pointer-events-none' : 'nx-scrim',
        )}
      >
        {!overlay && (
          <div className="nx-text-shadow flex max-w-[calc(100%-64px)] items-end gap-3 md:max-w-[760px]">
            <NxAvatar author={author} size={40} className="border-2 border-white" />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[15px] font-bold">{author.handle || author.name}</span>
              {caption && (
                <span className="line-clamp-2 text-[15px] leading-[1.35] md:text-[17px]">
                  {caption}
                </span>
              )}
            </span>
          </div>
        )}
        <div
          className={cn(
            'pointer-events-auto flex flex-col gap-1',
            overlay && 'nx-plate rounded-2xl px-3 py-2 md:mx-auto md:w-[min(760px,100%)]',
          )}
        >
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
            disabled={kind === 'article'}
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
        <LearningSheet
          status={learning.status}
          onClose={() => setLearningOpen(false)}
          onRetried={learning.refresh}
        />
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
  )
}
