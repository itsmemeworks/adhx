'use client'

/**
 * Desktop theater chrome (lg+) — the "Filmstrip dock" direction: the stage
 * spans the full viewport width; chrome overlays it (top bar + bottom-left
 * post overlay + bottom-right actions) and the up-next queue is a horizontal
 * filmstrip in a bottom dock, broadcast-console style. Replaces the old
 * right-hand <Rail/>.
 *
 * Two components, one file:
 *  - `DesktopStageChrome` — absolutely-positioned overlays INSIDE the stage
 *    wrapper (brand + LIVE, paste-a-link input, de-clutter, per-type meta
 *    chips, the media post's author/caption overlay with the sticky
 *    show-more expand, and the action buttons).
 *  - `DesktopDock` — the in-flow bottom dock AFTER the stage wrapper
 *    (transport cluster + horizontal filmstrip + end cap), plus the
 *    "Show all" overlay panel reusing `UpNextList`.
 *
 * Both are CSS-hidden below `lg` (the mobile chrome owns those viewports)
 * and carry no timers, so — unlike the mobile chrome — they need no
 * viewport gating beyond CSS.
 */

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  Bookmark,
  Check,
  Clock,
  Loader2,
  Clipboard,
  Minimize2,
  Download as DownloadIcon,
  Link as LinkIcon,
  LogIn,
  ExternalLink,
  Flame,
  Repeat,
  Tag as TagIcon,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Pause,
  Play,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCompactRelativeTime } from '@/lib/utils/format'
import { MatterLogo, PlatformGlyph } from '@/components/matter'
import { AuthorAvatar } from '@/components/feed/AuthorAvatar'
import { previewPath, sourceUrl } from '@/lib/activity/preview-path'
import { inferType } from '@/lib/trending/filter'
import { resolvePastedLink } from '@/lib/theater/paste-preview'
import { useSendFile } from './useSendFile'
import { useClampExpand } from './useClampExpand'
import { theaterItemKey, PLATFORM_LABEL, TRIAGE_TAB_ORDER, TRIAGE_TAB_LABEL } from './types'
import { TheaterLinkedText, stripShortLinksForPreview } from './TheaterText'
import { progressKindFor } from './TheaterProgressLine'
import { UpNextList, TYPE_TILE, warmOnHover } from './UpNextList'
import { SaveCollectionButton } from './SaveCollectionButton'
import { TheaterAvatarMenu } from './TheaterAvatarMenu'
import type {
  SaveCollectionStatus,
  TheaterCollectionMeta,
  TheaterItem,
  TheaterMode,
  TheaterTriageChrome,
} from './types'

export interface DesktopStageChromeProps {
  mode: TheaterMode
  /** Null while loading or in the end-of-feed waiting stage — hide the post overlays, keep the top bar. */
  current: TheaterItem | null
  /** Shared mode (preview pages): the post the visitor landed on (pinned lead). */
  sharedItem?: TheaterItem
  /** Whether the visiting user is signed in (shared mode: swaps the Save link for a direct SavePostButton). */
  authed?: boolean
  /** De-clutter fades the overlays out (mobile-chrome pattern: opacity + slight translate, pointer-events-none). */
  declutter: boolean
  onToggleDeclutter: () => void
  /** Collection mode (`/t/{username}/{tag}`): identity chrome + swaps the top bar's LIVE/paste-input right side for "Make your own", and the bottom-right Save action for the Save-collection CTA. */
  collection?: TheaterCollectionMeta
  saveStatus?: SaveCollectionStatus
  onSaveCollection?: () => void
  /** The signed-in viewer IS this collection's curator — hide clone/make-your-own, show Manage. */
  isCollectionOwner?: boolean
  onRequestSignIn?: () => void
  /** Triage mode (unified-theater-triage.md §2): swaps the top bar's Live/paste-input for a Collection↔Live tab switcher, and the bottom-right action set for Later/Tag/Delete/Done. */
  triage?: TheaterTriageChrome
}

export interface DesktopDockProps {
  mode: TheaterMode
  items: TheaterItem[]
  current: TheaterItem | null
  currentKey: string | null
  isSeen: (key: string) => boolean
  seenReady: boolean
  freshKeys: ReadonlySet<string>
  newCount: number
  savedToday: number
  onSelect: (key: string) => void
  waiting?: boolean
  muted: boolean
  onToggleMute: () => void
  canPrev: boolean
  canNext: boolean
  onPrev: () => void
  onNext: () => void
  /** De-clutter slides the dock away entirely (the shell's floating restore button brings it back). */
  declutter: boolean
  /** Collection mode: appends a "loops" divider + a ghosted copy of the first card after the filmstrip, and hides the live-pulse-only savedToday/newCount lines in the end cap. */
  collection?: TheaterCollectionMeta
  /** Triage mode: end cap shows "{remaining} left" + streak instead of savedToday/newCount. */
  triage?: TheaterTriageChrome
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

const GLASS =
  'inline-flex h-11 items-center justify-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-4 text-[12.5px] font-semibold text-white backdrop-blur-md transition-colors hover:bg-white/20 disabled:opacity-60'
/**
 * Save drives account signups, so it's ALWAYS the visually primary action —
 * every Save variant (sign-in prompt, SavePostButton, TriageLiveSaveButton,
 * SaveCollectionButton) uses this class. Download is a power-user affordance,
 * not a headline feature, so it stays on GLASS alongside Link/Open.
 */
const PRIMARY =
  'inline-flex h-11 items-center justify-center gap-1.5 rounded-full bg-clay-grad px-5 text-[12.5px] font-semibold text-white shadow-glow transition-opacity hover:opacity-90 disabled:opacity-60'

/**
 * Shared-mode, signed-in Save (ported verbatim from the deleted Rail.tsx):
 * POSTs the CURRENT item's canonical source URL (never the on-ADHX preview
 * path stored in `current.url`'s pulse-item convention) to the same
 * platform-agnostic endpoint the preview pages' own "Save to collection"
 * CTAs use. Computed via `sourceUrl()` rather than trusting `current.url`.
 */
/** Cross-mount cache of "is this post already in the viewer's collection?"
 * lookups, keyed by theaterItemKey — one GET per post per page lifetime. */
const ownershipCache = new Map<string, boolean>()

export function SavePostButton({
  current,
  className,
}: {
  current: TheaterItem
  /** Full button class string — the caller owns the visual style (glass on-stage here). */
  className: string
}) {
  const [status, setStatus] = useState<SaveStatus>('idle')
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const key = theaterItemKey(current)

  useEffect(() => {
    setStatus('idle')
  }, [key])

  // A post already in the viewer's collection must open as "Saved", not
  // "Save" — this button only renders for signed-in viewers, so the
  // `/api/feed?id=` single-bookmark lookup (which ignores read state) is the
  // membership check. Cached per key so re-staging a post costs nothing.
  useEffect(() => {
    if (!current.bookmarkId) return
    if (ownershipCache.has(key)) {
      if (ownershipCache.get(key)) setStatus('saved')
      return
    }
    let cancelled = false
    const q = new URLSearchParams({ unreadOnly: 'false', filter: 'all', limit: '5' })
    q.append('id', current.bookmarkId)
    fetch(`/api/feed?${q}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const owned = !!(d?.items ?? []).find(
          (f: { id: string; platform?: string }) =>
            (f.platform ?? 'twitter') === current.platform && f.id === current.bookmarkId,
        )
        ownershipCache.set(key, owned)
        if (!cancelled && owned) setStatus('saved')
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [key, current.bookmarkId, current.platform])

  // The shell completes a deferred ?save=1 save (post-sign-in) itself and
  // announces it here so the button reflects reality without owning the flow.
  useEffect(() => {
    function handleSaved(e: Event) {
      const detail = (e as CustomEvent<{ key?: string }>).detail
      if (detail?.key === key) setStatus('saved')
    }
    window.addEventListener('theater-post-saved', handleSaved)
    return () => window.removeEventListener('theater-post-saved', handleSaved)
  }, [key])

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    },
    [],
  )

  const handleSave = async () => {
    if (status === 'saving' || status === 'saved' || !current.bookmarkId) return
    setStatus('saving')
    try {
      const url = sourceUrl(current.platform, current.author, current.bookmarkId)
      if (!url) throw new Error('No source URL for this post')
      const res = await fetch('/api/bookmarks/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || data?.error) throw new Error(data?.error || 'Save failed')
      ownershipCache.set(key, true)
      setStatus('saved')
    } catch {
      // Quiet failure — never crash the chrome over a save hiccup. Reset
      // after a beat so the button is tappable again.
      setStatus('error')
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => setStatus('idle'), 2000)
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleSave()}
      disabled={status === 'saving' || status === 'saved'}
      className={className}
    >
      {status === 'saving' ? (
        <Loader2 size={14} className="animate-spin" />
      ) : status === 'saved' ? (
        <Check size={14} />
      ) : (
        <Bookmark size={14} />
      )}
      {status === 'saved' ? 'Saved' : status === 'error' ? 'Try again' : 'Save'}
    </button>
  )
}

/** The "Open on {platform}" link-out chip shared by the top bar and the merged meta line. */
function PlatformTimeChip({ item }: { item: TheaterItem }) {
  const src = sourceUrl(item.platform, item.author, item.bookmarkId ?? '')
  const label = PLATFORM_LABEL[item.platform] ?? item.platform
  const inner = (
    <>
      <PlatformGlyph platform={item.platform} size={12} />
      <span className="font-mono text-[11px]" suppressHydrationWarning>
        {formatCompactRelativeTime(item.createdAt)}
      </span>
    </>
  )
  const cls =
    'inline-flex min-h-[32px] flex-none items-center gap-1.5 rounded-full bg-black/40 px-2.5 text-white/80 backdrop-blur-sm'
  return src ? (
    <a
      href={src}
      target="_blank"
      rel="noopener noreferrer"
      className={cls}
      title={`Open on ${label}`}
    >
      {inner}
    </a>
  ) : (
    <span className={cls} title={`Open on ${label}`}>
      {inner}
    </span>
  )
}

function FlameChip({ trendCount }: { trendCount: number }) {
  if (trendCount < 2) return null
  return (
    <span className="inline-flex flex-none items-center gap-1 rounded-full bg-black/40 px-2 py-0.5 text-[11px] font-bold text-orange-300">
      <Flame size={11} className="text-orange-400" fill="currentColor" />
      {trendCount}
    </span>
  )
}

/**
 * Navigate to an app-internal path only. `resolvePastedLink` already only
 * builds root-relative app paths, but the pasted text is user/clipboard
 * input, so the sink enforces the invariant too (defense-in-depth, and what
 * proves it to CodeQL: no `javascript:` scheme can survive the leading-`/`
 * requirement, no protocol-relative `//host` escape, and the resolved URL
 * must land on this origin). Exported for unit testing.
 */
export function navigateToAppPath(path: string): void {
  if (!path.startsWith('/') || path.startsWith('//')) return
  const dest = new URL(path, window.location.origin)
  if (dest.origin !== window.location.origin) return
  window.location.assign(dest.toString())
}

export function DesktopStageChrome({
  mode,
  current,
  authed,
  declutter,
  onToggleDeclutter,
  collection,
  saveStatus = 'idle',
  onSaveCollection,
  isCollectionOwner = false,
  onRequestSignIn,
  triage,
}: DesktopStageChromeProps) {
  const [pasteValue, setPasteValue] = useState('')
  const [pasteError, setPasteError] = useState(false)
  const pasteErrorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [linkCopied, setLinkCopied] = useState(false)
  const linkCopiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const currentKey = current ? theaterItemKey(current) : null
  const { ref: captionRef, expanded, setExpanded, overflowing } = useClampExpand(currentKey)
  const sendFile = useSendFile(current)

  useEffect(
    () => () => {
      if (pasteErrorTimeoutRef.current) clearTimeout(pasteErrorTimeoutRef.current)
      if (linkCopiedTimeoutRef.current) clearTimeout(linkCopiedTimeoutRef.current)
    },
    [],
  )

  const tryResolve = (text: string) => {
    const path = resolvePastedLink(text)
    if (path) {
      setPasteValue('')
      setPasteError(false)
      navigateToAppPath(path)
      return
    }
    setPasteError(true)
    if (pasteErrorTimeoutRef.current) clearTimeout(pasteErrorTimeoutRef.current)
    pasteErrorTimeoutRef.current = setTimeout(() => setPasteError(false), 2000)
  }

  // Global ⌘V: only below lg is this component mounted-but-hidden — a global
  // paste listener must respect the same breakpoint so it doesn't fire twice
  // alongside a (future) mobile equivalent, and must never hijack a paste
  // aimed at an actual input/textarea/contentEditable.
  useEffect(() => {
    // Triage mode's global paste-to-preview is already covered by
    // `<PasteToPreview/>` (mounted once, app-wide, in AuthedHome) — this
    // component doesn't even render the paste input in triage mode (see the
    // top bar below), so a second listener here would just double-navigate.
    if (triage) return
    const handler = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target) {
        const tag = target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return
      }
      if (typeof window === 'undefined' || !window.matchMedia('(min-width: 1024px)').matches) return
      const text = e.clipboardData?.getData('text')
      if (!text) return
      const path = resolvePastedLink(text)
      if (path) navigateToAppPath(path)
    }
    window.addEventListener('paste', handler)
    return () => window.removeEventListener('paste', handler)
  }, [triage])

  const kind = current ? inferType(current) : null
  const textLike = kind !== null && ['text', 'quote', 'article'].includes(kind)
  const isMedia = kind === 'video' || kind === 'photo'
  const trendCount = current ? (current.trendCount ?? current.saveCount ?? 0) : 0
  const tagCount = triage?.tags?.length ?? 0
  const handle = current?.author ? current.author.replace(/^@+/, '') : ''
  const caption = current ? (current.text || '').trim() : ''
  const platformLabel = current ? (PLATFORM_LABEL[current.platform] ?? current.platform) : ''
  const openUrl = current
    ? sourceUrl(current.platform, current.author, current.bookmarkId ?? '')
    : null

  const handleCopyLink = async () => {
    if (!current) return
    try {
      const path = previewPath(current.platform, current.author, current.bookmarkId || '')
      const url = new URL(path, window.location.origin).toString()
      await navigator.clipboard.writeText(url)
      setLinkCopied(true)
      if (linkCopiedTimeoutRef.current) clearTimeout(linkCopiedTimeoutRef.current)
      linkCopiedTimeoutRef.current = setTimeout(() => setLinkCopied(false), 1600)
    } catch {
      // Clipboard denial has nothing actionable to surface.
    }
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-10 hidden lg:block">
      {/* Top bar: brand + LIVE left, meta chips (text-like
          posts only) + paste-a-link + de-clutter right. */}
      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-4 px-7 pb-10 pt-4 transition-[opacity,transform] duration-200 ease-out',
          declutter && '-translate-y-3 opacity-0',
        )}
        style={{ background: 'linear-gradient(rgba(8,7,10,.62), transparent)' }}
      >
        <div
          className={cn(
            'pointer-events-auto flex min-w-0 gap-3.5',
            // Collection mode: the wordmark, tag name and curator line sit on
            // one shared text baseline (per live review) — other modes keep
            // vertical centering for their pill controls.
            collection && !triage ? 'items-baseline' : 'items-center',
          )}
        >
          {collection && !triage ? (
            // Inline-flow brand: an inline anchor's baseline is its TEXT
            // baseline, so the wordmark sits on the same ruler as the tag
            // name + curator line (MatterLogo is a nested flex whose
            // computed baseline is the icon's bottom edge — wrong ruler).
            <a href="/" aria-label="ADHX home" className="flex-none whitespace-nowrap">
              <img
                src="/adhx-cloud.png"
                alt=""
                aria-hidden
                style={{ height: 32 }}
                className="inline-block w-auto align-[-30%]"
              />
              <span
                className="ml-2 font-indie-flower leading-none text-white"
                style={{ fontSize: 28.5 }}
              >
                ADHX
              </span>
            </a>
          ) : (
            <a href="/" aria-label="ADHX home" className="flex-none">
              <MatterLogo size={19} className="[&>span]:text-white" />
            </a>
          )}
          {triage ? (
            <>
              <span className="h-5 w-px flex-none bg-white/20" aria-hidden />
              <div className="inline-flex flex-none rounded-full bg-white/10 p-1 text-[12.5px] font-semibold">
                {TRIAGE_TAB_ORDER.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => triage.onTabChange(t)}
                    aria-current={triage.tab === t ? 'true' : undefined}
                    className={cn(
                      'rounded-full px-4 py-1.5 whitespace-nowrap transition-colors',
                      // Hardcoded dark ink: `text-ink` flips light in dark theme and vanishes on the white pill.
                      triage.tab === t
                        ? 'bg-white text-[#1c1917]'
                        : 'text-white/60 hover:text-white',
                    )}
                  >
                    {TRIAGE_TAB_LABEL[t]}
                  </button>
                ))}
              </div>
            </>
          ) : collection ? (
            <>
              <span className="h-5 w-px flex-none self-center bg-white/20" aria-hidden />
              <span className="flex-none truncate text-[19px] font-bold leading-none text-white">
                #{collection.tag}
              </span>
              <span className="min-w-0 truncate font-mono text-[11px] leading-none text-white/55">
                curated by{' '}
                <Link
                  href={`/t/${encodeURIComponent(collection.curator)}`}
                  onClick={(e) => e.stopPropagation()}
                  className="underline decoration-white/30 underline-offset-2 transition-colors hover:text-white"
                >
                  @{collection.curator}
                </Link>{' '}
                · {collection.count} {collection.count === 1 ? 'post' : 'posts'} ·{' '}
                <Repeat size={10} className="inline" aria-hidden /> loops
              </span>
            </>
          ) : (
            <>
              <span className="inline-flex flex-none items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-white/55">
                <span className="h-2 w-2 flex-none rounded-full bg-live" aria-hidden />
                Live
              </span>
            </>
          )}
        </div>

        <div className="pointer-events-auto flex flex-none items-center gap-2.5">
          {triage ? (
            triage.tab === 'live' && current && textLike ? (
              <>
                <FlameChip trendCount={trendCount} />
                <PlatformTimeChip item={current} />
              </>
            ) : null
          ) : collection ? (
            !isCollectionOwner && (
              <a href="/?start=1" className={GLASS}>
                Make your own
              </a>
            )
          ) : (
            <>
              {current && textLike && (
                <>
                  <FlameChip trendCount={trendCount} />
                  <PlatformTimeChip item={current} />
                </>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  tryResolve(pasteValue)
                }}
                className={cn(
                  'flex h-11 w-[420px] items-center gap-2.5 rounded-full border bg-white/[.08] px-4 pr-2 backdrop-blur-md transition-colors',
                  pasteError ? 'border-red-400/60' : 'border-white/[.18]',
                )}
              >
                <Clipboard size={15} className="flex-none text-white/55" />
                <input
                  type="text"
                  aria-label="Paste a link to preview"
                  placeholder="Paste a link to preview — X, Instagram, TikTok, YouTube"
                  spellCheck={false}
                  value={pasteValue}
                  onChange={(e) => setPasteValue(e.target.value)}
                  onPaste={(e) => {
                    const text = e.clipboardData.getData('text')
                    if (!text) return
                    e.preventDefault()
                    tryResolve(text)
                  }}
                  className="min-w-0 flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-white/45"
                />
                {pasteError ? (
                  <span className="flex-none text-[11px] text-red-300">Not a supported link</span>
                ) : (
                  <span className="flex-none rounded-md border border-white/[.22] px-1.5 py-0.5 font-mono text-[10.5px] text-white/50">
                    ⌘V
                  </span>
                )}
              </form>
            </>
          )}

          <TheaterAvatarMenu />

          {triage && (
            <button
              type="button"
              onClick={triage.onClose}
              aria-label="Close triage"
              className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-full border border-white/[.18] bg-white/[.08] text-white backdrop-blur-md"
            >
              <X size={16} />
            </button>
          )}

          <button
            type="button"
            onClick={onToggleDeclutter}
            aria-label="Hide controls"
            className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-full border border-white/[.18] bg-white/[.08] text-white backdrop-blur-md"
          >
            <Minimize2 size={16} />
          </button>
        </div>
      </div>

      {/* Bottom scrim: non-interactive, media posts only (text-like stages
          carry their own composition). `current` is already null during the
          waiting/end-of-feed stage, so no separate `waiting` check is needed. */}
      {current && isMedia && (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-56"
          style={{ background: 'linear-gradient(transparent, rgba(11,11,17,.84))' }}
        />
      )}

      {/* Bottom-left: the post overlay — merged meta line + caption. Media
          posts only; text/quote/article render their own composition on the
          stage itself. */}
      {current && isMedia && (
        <div
          className={cn(
            'pointer-events-auto absolute bottom-6 left-7 flex w-[min(640px,46vw)] flex-col gap-2.5 transition-[opacity,transform] duration-200 ease-out',
            declutter && 'translate-y-3 opacity-0 pointer-events-none',
          )}
        >
          <div className="flex min-w-0 items-center gap-2">
            <AuthorAvatar
              src={current.authorAvatarUrl ?? current.thumbnailUrl}
              author={current.author}
              size="sm"
            />
            <span className="truncate text-[13.5px] font-bold text-white">
              {current.authorName || (handle ? `@${handle}` : 'Saved post')}
            </span>
            {handle && (
              <span className="truncate font-mono text-[11px] text-white/50">@{handle}</span>
            )}
            <span className="h-[3px] w-[3px] flex-none rounded-full bg-white/[.35]" />
            <PlatformTimeChip item={current} />
            <FlameChip trendCount={trendCount} />
          </div>

          {caption && (
            <div className={cn(expanded && 'rounded-lg bg-black/70 px-3 py-2 backdrop-blur-sm')}>
              <p
                ref={captionRef}
                className={cn(
                  'text-[15px] leading-snug text-white/90 [text-shadow:0_1px_3px_rgba(0,0,0,.6)]',
                  expanded ? 'max-h-[38vh] overflow-y-auto overscroll-contain' : 'line-clamp-2',
                )}
              >
                <TheaterLinkedText
                  platform={current.platform}
                  text={caption}
                  hasMedia
                  links={current.textLinks}
                  hideTweetLinks={!!current.quote}
                />
              </p>
              {(overflowing || expanded) && (
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  className="mt-1 flex h-8 items-center text-[13px] font-semibold text-clay"
                >
                  {expanded ? 'less' : 'more'}
                </button>
              )}
            </div>
          )}

          {/* Tag chips (unified-theater-triage.md §B) — the Collection tab's
              current item only; display-only, nothing renders without tags.
              Text/quote/article posts render their own composition on the
              stage (no media overlay here), so their chips are rendered by
              `TriageStage` itself, aligned to the text column instead. */}
          {triage?.tab === 'collection' && triage.tags && triage.tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {triage.tags.map((t) => (
                <span
                  key={t}
                  className="flex-none rounded-full border border-white/12 bg-white/[.06] px-2 py-0.5 text-[10.5px] text-white/55"
                >
                  #{t}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Bottom-right: action buttons. Triage's Collection tab replaces the
          whole set with Later/Tag/Delete/Done — see
          docs/specs/unified-theater-triage.md §2. */}
      {current && triage && triage.tab === 'collection' ? (
        <div
          className={cn(
            'pointer-events-auto absolute bottom-6 right-7 flex items-center gap-2 transition-[opacity,transform] duration-200 ease-out',
            declutter && 'translate-y-3 opacity-0 pointer-events-none',
          )}
        >
          <button type="button" onClick={triage.onLater} className={GLASS}>
            <Clock size={14} />
            Later
          </button>
          <button
            type="button"
            onClick={triage.onTag}
            className={cn(GLASS, tagCount > 0 && 'border-clay/50 text-clay')}
          >
            <TagIcon size={14} fill={tagCount > 0 ? 'currentColor' : 'none'} />
            {tagCount > 0 ? `Tag · ${tagCount}` : 'Tag'}
          </button>
          <button type="button" onClick={triage.onDelete} className={GLASS}>
            <Trash2 size={14} />
            Delete
          </button>
          <button type="button" onClick={triage.onDone} className={PRIMARY}>
            <Check size={14} />
            Done
          </button>
          {openUrl && (
            <a
              href={openUrl}
              target="_blank"
              rel="noopener noreferrer"
              title={`Open on ${platformLabel}`}
              className={GLASS}
            >
              <ExternalLink size={14} />
              Open
            </a>
          )}
        </div>
      ) : current ? (
        <div
          className={cn(
            'pointer-events-auto absolute bottom-6 right-7 flex items-center gap-2 transition-[opacity,transform] duration-200 ease-out',
            declutter && 'translate-y-3 opacity-0 pointer-events-none',
          )}
        >
          {sendFile.supported && (
            <button
              type="button"
              onClick={() => void sendFile.send()}
              disabled={sendFile.sending}
              title={
                sendFile.mode === 'share'
                  ? 'Opens your share sheet with the file'
                  : 'Download the file'
              }
              className={GLASS}
            >
              {sendFile.sending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <DownloadIcon size={14} />
              )}
              Download
            </button>
          )}
          <button type="button" onClick={() => void handleCopyLink()} className={GLASS}>
            {linkCopied ? <Check size={14} className="text-done" /> : <LinkIcon size={14} />}
            {linkCopied ? 'Copied' : 'Link'}
          </button>
          {collection ? (
            isCollectionOwner ? (
              <a href={`/?tag=${encodeURIComponent(collection.tag)}`} className={GLASS}>
                <TagIcon size={14} />
                Manage collection
              </a>
            ) : (
              <SaveCollectionButton
                count={collection.count}
                status={saveStatus}
                onSave={() => onSaveCollection?.()}
                className={PRIMARY}
              />
            )
          ) : (mode === 'shared' && authed) || triage?.tab === 'live' ? (
            triage?.tab === 'live' ? (
              <>
                <button
                  type="button"
                  onClick={() => triage.onLiveTag?.(current)}
                  title="Tag this post (saves it to your collection first)"
                  className={GLASS}
                >
                  <TagIcon size={14} />
                  Tag
                </button>
                <TriageLiveSaveButton current={current} triage={triage} className={PRIMARY} />
              </>
            ) : (
              <SavePostButton current={current} className={PRIMARY} />
            )
          ) : (
            <button type="button" onClick={() => onRequestSignIn?.()} className={PRIMARY}>
              <LogIn size={14} />
              Save
            </button>
          )}
          {openUrl && (
            <a
              href={openUrl}
              target="_blank"
              rel="noopener noreferrer"
              title={`Open on ${platformLabel}`}
              className={GLASS}
            >
              <ExternalLink size={14} />
              Open
            </a>
          )}
        </div>
      ) : null}
    </div>
  )
}

/**
 * Triage mode's Live-tab Save button: always-authed direct save (the theater
 * is only ever reached signed in from the authed Collection), tracked via
 * `TheaterTriageChrome.savedKeys` rather than owning its own fetch state —
 * `SavePostButton` above assumes `mode === 'shared'`'s sign-in-modal flow,
 * which doesn't apply here.
 */
function TriageLiveSaveButton({
  current,
  triage,
  className,
}: {
  current: TheaterItem
  triage: TheaterTriageChrome
  className: string
}) {
  const saved = triage.savedKeys.has(theaterItemKey(current))
  return (
    <button
      type="button"
      onClick={() => !saved && triage.onSave(current)}
      disabled={saved}
      className={className}
    >
      {saved ? <Check size={14} /> : <Bookmark size={14} />}
      {saved ? 'Saved' : 'Save'}
    </button>
  )
}

const TRANSPORT_BTN =
  'inline-flex h-10 w-10 flex-none items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-inset hover:text-ink disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-ink-3'

export function DesktopDock({
  mode: _mode,
  items,
  current,
  currentKey,
  isSeen,
  seenReady,
  freshKeys,
  newCount,
  savedToday,
  onSelect,
  waiting,
  muted,
  onToggleMute,
  canPrev,
  canNext,
  onPrev,
  onNext,
  declutter,
  collection,
  triage,
}: DesktopDockProps) {
  const [showAll, setShowAll] = useState(false)
  const cardRefs = useRef<Map<string, HTMLButtonElement>>(new Map())

  const kind = progressKindFor(current)
  const [videoPlaying, setVideoPlaying] = useState(true)
  const [timedPaused, setTimedPaused] = useState(false)
  const [liveMuted, setLiveMuted] = useState<boolean | null>(null)

  useEffect(() => {
    const handlePlaying = (e: Event) => {
      const detail = (e as CustomEvent<{ playing: boolean }>).detail
      if (detail) setVideoPlaying(detail.playing)
    }
    const handleMuted = (e: Event) => {
      const detail = (e as CustomEvent<{ muted: boolean }>).detail
      if (detail) setLiveMuted(detail.muted)
    }
    window.addEventListener('theater-playing-state', handlePlaying)
    window.addEventListener('theater-muted-state', handleMuted)
    return () => {
      window.removeEventListener('theater-playing-state', handlePlaying)
      window.removeEventListener('theater-muted-state', handleMuted)
    }
  }, [])

  useEffect(() => {
    setTimedPaused(false)
  }, [currentKey])

  useEffect(() => {
    if (!currentKey) return
    const el = cardRefs.current.get(currentKey)
    el?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' })
  }, [currentKey])

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowAll(false)
    }
    if (showAll) window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [showAll])

  const paused = kind === 'video' ? !videoPlaying : timedPaused
  const displayMuted = liveMuted ?? muted
  const soundPulse = kind === 'video' && displayMuted && videoPlaying

  const handleTogglePause = () => {
    if (kind === 'video') {
      window.dispatchEvent(new CustomEvent(videoPlaying ? 'theater-pause' : 'theater-resume'))
      return
    }
    if (kind === 'timed') {
      setTimedPaused((was) => {
        window.dispatchEvent(new CustomEvent(was ? 'theater-resume' : 'theater-pause'))
        return !was
      })
    }
  }

  const currentIndex = currentKey ? items.findIndex((it) => theaterItemKey(it) === currentKey) : -1

  const handlePanelSelect = (key: string) => {
    onSelect(key)
    setShowAll(false)
  }

  return (
    <div
      className={cn(
        'relative hidden flex-none items-center gap-4 border-t border-hairline bg-surface px-5 text-ink transition-all duration-200 lg:flex',
        declutter ? 'h-0 overflow-hidden border-t-0 opacity-0' : 'h-[124px]',
      )}
    >
      {/* Transport cluster */}
      <div className="flex flex-none items-center gap-0.5">
        <button
          type="button"
          aria-label="Previous post"
          disabled={!canPrev}
          onClick={onPrev}
          className={TRANSPORT_BTN}
        >
          <ChevronLeft size={18} />
        </button>
        {/* Pause and audio always render — disabled when the current post
            can't use them (e.g. audio on a photo) — so the cluster never
            shifts horizontally as the theater advances across content types. */}
        <button
          type="button"
          aria-label={paused ? 'Play' : 'Pause'}
          disabled={kind === 'none'}
          aria-disabled={kind === 'none'}
          onClick={handleTogglePause}
          className={TRANSPORT_BTN}
        >
          {paused ? (
            <Play size={16} fill="currentColor" />
          ) : (
            <Pause size={16} fill="currentColor" />
          )}
        </button>
        <button
          type="button"
          aria-label="Next post"
          disabled={!canNext}
          onClick={onNext}
          className={TRANSPORT_BTN}
        >
          <ChevronRight size={18} />
        </button>
        <button
          type="button"
          aria-label={displayMuted ? 'Unmute' : 'Mute'}
          disabled={kind !== 'video'}
          aria-disabled={kind !== 'video'}
          onClick={onToggleMute}
          className={cn(TRANSPORT_BTN, soundPulse && 'animate-sound-pulse text-ink')}
        >
          {displayMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
        <span className="mx-1.5 h-6 w-px flex-none bg-hairline" />
      </div>

      {/* Filmstrip */}
      <div
        className="flex flex-1 items-stretch gap-2.5 overflow-x-auto py-3 [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: 'none' }}
      >
        {items.map((item, i) => {
          const key = theaterItemKey(item)
          const isCurrent = key === currentKey
          const isNext = currentIndex >= 0 && i === currentIndex + 1
          const seen = seenReady && isSeen(key)
          const fresh = freshKeys.has(key)
          const type = inferType(item)
          const tile = TYPE_TILE[type]
          const Icon = tile.icon
          const handle = item.author ? item.author.replace(/^@+/, '') : ''
          const caption = stripShortLinksForPreview((item.text || '').trim())

          return (
            <button
              key={key}
              type="button"
              ref={(el) => {
                if (el) cardRefs.current.set(key, el)
                else cardRefs.current.delete(key)
              }}
              onClick={() => onSelect(key)}
              onMouseEnter={() => warmOnHover(item)}
              aria-current={isCurrent ? 'true' : undefined}
              className={cn(
                'flex w-[168px] flex-none flex-col gap-1.5 rounded-[10px] border-2 p-2 text-left transition-colors',
                isCurrent
                  ? 'border-clay bg-inset'
                  : 'border-transparent bg-black/15 hover:bg-inset/60',
                !isCurrent && seen && 'opacity-55',
                !isCurrent && fresh && 'bg-clay/[0.07]',
              )}
            >
              <div className="relative h-14 w-full flex-none overflow-hidden rounded-md bg-inset">
                {item.thumbnailUrl ? (
                  <img
                    src={item.thumbnailUrl}
                    alt=""
                    referrerPolicy="no-referrer"
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className={cn('flex h-full w-full items-center justify-center', tile.bg)}>
                    <Icon size={14} />
                  </div>
                )}
                {fresh && !isCurrent && (
                  <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-clay ring-2 ring-surface" />
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <PlatformGlyph
                  platform={item.platform}
                  size={10}
                  className="flex-none text-ink-3"
                />
                <span className="font-mono text-[10px] text-ink-3" suppressHydrationWarning>
                  {formatCompactRelativeTime(item.createdAt)}
                </span>
                <span className="ml-auto flex-none">
                  {isCurrent ? (
                    <span className="text-[9.5px] font-bold uppercase tracking-wide text-clay">
                      NOW
                    </span>
                  ) : isNext ? (
                    <span className="text-[9.5px] font-bold uppercase tracking-wide text-clay">
                      NEXT →
                    </span>
                  ) : seen ? (
                    <Check size={10} className="text-done" />
                  ) : null}
                </span>
              </div>
              <p className="truncate text-[11.5px] leading-tight text-ink">
                {caption || (handle ? `@${handle}` : 'Saved post')}
              </p>
            </button>
          )
        })}

        {/* Collection mode loops: a dashed divider announces the wrap, then a
            ghosted (opacity-45) copy of the first card previews where "next"
            after the last item goes — matching goNext's actual wrap target. */}
        {collection && items.length > 0 && (
          <>
            <div
              aria-hidden
              className="flex w-[72px] flex-none flex-col items-center justify-center gap-1 rounded-[10px] border-2 border-dashed border-hairline text-ink-3"
            >
              <Repeat size={16} />
              <span className="text-[9px] font-bold uppercase tracking-wide">Loops</span>
            </div>
            {(() => {
              const first = items[0]
              const key = theaterItemKey(first)
              const type = inferType(first)
              const tile = TYPE_TILE[type]
              const Icon = tile.icon
              const handle = first.author ? first.author.replace(/^@+/, '') : ''
              const caption = stripShortLinksForPreview((first.text || '').trim())
              return (
                <button
                  type="button"
                  onClick={() => onSelect(key)}
                  aria-label="Back to the first post"
                  className="flex w-[168px] flex-none flex-col gap-1.5 rounded-[10px] border-2 border-transparent bg-black/15 p-2 text-left opacity-45 transition-opacity hover:opacity-70"
                >
                  <div className="relative h-14 w-full flex-none overflow-hidden rounded-md bg-inset">
                    {first.thumbnailUrl ? (
                      <img
                        src={first.thumbnailUrl}
                        alt=""
                        referrerPolicy="no-referrer"
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div
                        className={cn('flex h-full w-full items-center justify-center', tile.bg)}
                      >
                        <Icon size={14} />
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <PlatformGlyph
                      platform={first.platform}
                      size={10}
                      className="flex-none text-ink-3"
                    />
                    <span className="font-mono text-[10px] text-ink-3" suppressHydrationWarning>
                      {formatCompactRelativeTime(first.createdAt)}
                    </span>
                  </div>
                  <p className="truncate text-[11.5px] leading-tight text-ink">
                    {caption || (handle ? `@${handle}` : 'Saved post')}
                  </p>
                </button>
              )
            })()}
          </>
        )}
      </div>

      {/* End cap */}
      <div className="relative flex flex-none flex-col items-end justify-center gap-1 pl-1">
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-ink-2 hover:text-ink"
        >
          {showAll ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
          Show all · {items.length}
        </button>
        {/* savedToday/newCount are live-pulse concepts — collection mode is a
            static curated queue, and triage's Collection tab is the user's
            own backlog, so neither line is meaningful for either. Triage
            shows "{remaining} left" + streak instead. */}
        {triage && triage.tab === 'collection' ? (
          <span className="flex items-center gap-1.5 text-[10.5px] text-ink-3">
            <span className="font-mono">{triage.remaining} left</span>
            {triage.streak.current > 0 && (
              <span className="inline-flex items-center gap-0.5 font-semibold text-flame">
                <Flame size={10} fill="currentColor" />
                {triage.streak.current}
              </span>
            )}
          </span>
        ) : (
          <>
            {!collection &&
              (waiting ? (
                <span className="text-[10.5px] text-ink-3">Waiting for new sends…</span>
              ) : (
                savedToday > 0 && (
                  <span className="text-[10.5px] text-ink-3">{savedToday} saved today</span>
                )
              ))}
            {!collection && newCount > 0 && (
              <span className="text-[10.5px] font-semibold text-clay">{newCount} new</span>
            )}
          </>
        )}

        {showAll && (
          <div className="absolute bottom-full right-4 z-20 mb-2 flex max-h-[62vh] w-[380px] flex-col overflow-hidden rounded-xl border border-hairline bg-surface shadow-m-lg">
            <div className="flex items-center justify-between px-4 pb-1 pt-3">
              <span className="text-[11px] font-bold uppercase tracking-wide text-ink-3">
                Up next
              </span>
              <button
                type="button"
                onClick={() => setShowAll(false)}
                aria-label="Close"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-ink-3 hover:bg-inset"
              >
                <X size={14} />
              </button>
            </div>
            <UpNextList
              items={items}
              currentKey={currentKey}
              isSeen={isSeen}
              seenReady={seenReady}
              freshKeys={freshKeys}
              newCount={newCount}
              onSelect={handlePanelSelect}
              className="min-h-0 flex-1 pb-2"
            />
          </div>
        )}
      </div>
    </div>
  )
}
