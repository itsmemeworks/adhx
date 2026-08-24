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
 *    wrapper (brand + LIVE, paste-a-link input, flame chip,
 *    the media post's author/caption overlay (Read opens the stacked article),
 *    and the action buttons — Open is the source platform glyph).
 *  - `DesktopDock` — the in-flow bottom dock AFTER the stage wrapper
 *    (two-row transport + de-clutter + horizontal filmstrip + end cap), plus the
 *    "Show all" overlay panel reusing `UpNextList`.
 *
 * Both are CSS-hidden below `lg` (the mobile chrome owns those viewports)
 * and carry no timers, so — unlike the mobile chrome — they need no
 * viewport gating beyond CSS.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTheaterActionHotkeys } from './useTheaterActionHotkeys'
import Link from 'next/link'
import {
  Bookmark,
  Check,
  Loader2,
  Clipboard,
  Link as LinkIcon,
  Repeat,
  Repeat1,
  Tag as TagIcon,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Maximize2,
  Pause,
  Play,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { addedToAdhxLabel, formatCompactRelativeTime, hasKnownTimestamp } from '@/lib/utils/format'
import { MatterLogo, PlatformGlyph } from '@/components/matter'
import { AuthorAvatar } from '@/components/feed/AuthorAvatar'
import { authorProfileUrl, sourceUrl } from '@/lib/activity/preview-path'
import { pingAnalytic } from '@/lib/analytics/client'
import { inferType } from '@/lib/trending/filter'
import { resolvePastedPost } from '@/lib/theater/paste-preview'
import { navigateToAppPath } from '@/lib/theater/navigate-app-path'
import { useSendFile } from './useSendFile'
import { fileSendCopy, textCopyAction } from './send-action'
import { useTheaterCopy } from './useTheaterCopy'
import { useTheaterStageEvents } from './useTheaterStageEvents'
import { SavePostButton, PersonalLiveSaveButton } from './SavePostButton'
import { FlameChip } from './TheaterMetaChips'
import { TheaterTagChips } from './TheaterTagChips'
import { StageGlass } from './StageGlass'
import { QuoteArticleToggle } from './QuoteArticleToggle'
import { TheaterCollectionActions } from './TheaterCollectionActions'
import { useClampExpand } from './useClampExpand'
import {
  theaterItemKey,
  isQuoteReader,
  offerArticleMode,
  PLATFORM_LABEL,
  PERSONAL_TAB_ORDER,
  PERSONAL_TAB_LABEL,
  REPEAT_MODE_LABEL,
} from './types'
import { TheaterCaption } from './TheaterCaption'
import { stripShortLinksForPreview } from './TheaterText'
import { progressKindFor } from './TheaterProgressLine'
import { UpNextList, TYPE_TILE, warmOnHover } from './UpNextList'
import { SavePlaylistButton } from './SavePlaylistButton'
import { TheaterAvatarMenu } from './TheaterAvatarMenu'
import { logAV } from './YtDebugOverlay'
import type {
  RepeatMode,
  SavePlaylistStatus,
  TheaterPlaylistMeta,
  TheaterItem,
  TheaterMode,
  TheaterPersonalChrome,
  TheaterAccountTabs,
} from './types'

export interface DesktopStageChromeProps {
  mode: TheaterMode
  /** Null while loading or in the end-of-feed waiting stage — hide the post overlays, keep the top bar. */
  current: TheaterItem | null
  /** Whether the visiting user is signed in (shared mode: swaps the Save link for a direct SavePostButton). */
  authed?: boolean
  /** De-clutter fades the overlays out (mobile-chrome pattern: opacity + slight translate, pointer-events-none). */
  declutter: boolean
  onToggleDeclutter: () => void
  /** Playlist mode (`/t/{username}/{tag}`): identity chrome + swaps the top bar's LIVE/paste-button right side for "Make your own", and the bottom-right Save action for the Save-playlist CTA. */
  playlist?: TheaterPlaylistMeta
  saveStatus?: SavePlaylistStatus
  onSavePlaylist?: () => void
  /** The signed-in viewer IS this playlist's curator — hide clone/make-your-own, show Manage. */
  isPlaylistOwner?: boolean
  onRequestSignIn?: () => void
  /** Playlist mode, non-owner viewers: the "Make your own" CTA — opens the sign-in modal in place (authed non-owners are routed home instead, handled by the caller). */
  onRequestMakeYourOwn?: () => void
  /** Collection mode: Collection↔Live tab switcher in the top bar; Collection tab adds Archive to the Live action row. */
  collection?: TheaterPersonalChrome
  /** Shared+authed: open the tag picker after the Save pill morphs to Tag. */
  onSharedTag?: (item: TheaterItem) => void
  /** Shared-lead tags (chips + Tag · N). Collection/live use `collection.tags`. */
  itemTags?: string[]
  /** Signed-in shared preview: same Live ⇄ My Collection cluster as `/`. */
  accountTabs?: TheaterAccountTabs
  /**
   * Personal Live / My Collection: add the pasted post in place instead of
   * navigating to its preview page. Receives the url as pasted (already a
   * supported post link). Signed-out home and shared previews omit this and
   * still `location.assign` to the preview.
   */
  onPastePost?: (url: string) => boolean | Promise<boolean>
  /** Video/photo + quote: stacked article reader instead of full-bleed media. */
  articleMode?: boolean
  onToggleArticleMode?: () => void
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
  /** Passed straight through to `UpNextList` for its section headings — the arrival snapshot the queue was grouped by. Absent only in playlist mode (one authored order, no groups); shared mode passes it and pins its lead post out of the grouping instead. */
  wasSeenOnEntry?: (key: string) => boolean
  /** The shared post on a preview page — pinned as the lead row and excluded from the section grouping (it isn't "what's new", it's the link the visitor followed). Passed straight to `UpNextList`. */
  pinnedKey?: string | null
  /** How many posts the end cap's count is out of — what will actually play from here (see `computeQueueTotal`). Falls back to `items.length`. */
  queueTotal?: number
  savedToday: number
  onSelect: (key: string) => void
  waiting?: boolean
  muted: boolean
  /**
   * Sets TheaterShell's `muted` state to an explicit value (not a blind
   * toggle — the audio button computes the target from the DISPLAYED state,
   * `displayMuted`, which can diverge from this `muted` prop; see
   * `handleAudioTap` below). This is the persistence path only — the
   * gesture-context fast path is the synchronous `theater-set-muted` window
   * event `handleAudioTap` dispatches alongside this call.
   */
  onSetMuted: (muted: boolean) => void
  canPrev: boolean
  canNext: boolean
  onPrev: () => void
  onNext: () => void
  /** De-clutter slides the dock away entirely (the shell's floating restore button brings it back). */
  declutter: boolean
  /** Hide chrome — lives in the dock so the top-right avatar never moves. */
  onToggleDeclutter?: () => void
  /** Collection mode: appends a "loops" divider + a ghosted copy of the first card after the filmstrip, and hides the live-pulse-only savedToday/newCount lines in the end cap. */
  playlist?: TheaterPlaylistMeta
  /** Collection mode: end cap shows "{remaining} left" instead of savedToday/newCount. */
  collection?: TheaterPersonalChrome
  /**
   * shared-post-repeat (desktop parity with TheaterMobileChrome): the shared
   * post is pinned and repeating. The filmstrip's current card swaps its
   * "NOW" tag for a Repeat glyph + "Repeat" (the state cue — mirrors the
   * mobile peek bar's relabeled center button), and the transport's next
   * chevron gets the clay accent (the deliberate way past the loop). No
   * separate end-cap chip — an earlier version had one, but stacked next to
   * the filmstrip tag it read as a third, redundant indicator (owner: it
   * also visually mushed with the current card's tag into "MOWN"); one tag
   * + one accented control is enough ("facts shown once").
   */
  repeatCurrent?: boolean
  /**
   * The Spotify-style repeat control (round 8): current mode + the cycling
   * handler. Both absent in playlist mode (that queue always loops) and
   * collection (finite backlog) — the button only renders when the handler is
   * provided.
   */
  repeatMode?: RepeatMode
  onCycleRepeat?: () => void
  /** Video/photo + quote in article mode — dock pause/audio follow the reader. */
  articleMode?: boolean
}

export { navigateToAppPath } from '@/lib/theater/navigate-app-path'
export { SavePostButton } from './SavePostButton'

const GLASS =
  'inline-flex h-11 items-center justify-center gap-1.5 rounded-full px-4 text-[12.5px] font-semibold text-white transition-colors disabled:opacity-60'
/**
 * The Save buttons: a Bookmark glyph on the same frosted glass as GLASS,
 * distinguished by a clay border. Covers SavePostButton,
 * PersonalLiveSaveButton, the signed-out Save prompt, AND SavePlaylistButton.
 * Archive's solid fill lives on TheaterCollectionActions.
 */
const SAVE_OUTLINE =
  'inline-flex h-11 items-center justify-center gap-1.5 rounded-full border border-clay px-5 text-[12.5px] font-semibold text-white transition-colors hover:bg-white/10 disabled:opacity-60'

export function DesktopStageChrome({
  mode,
  current,
  authed,
  declutter,
  onToggleDeclutter: _onToggleDeclutter,
  playlist,
  saveStatus = 'idle',
  onSavePlaylist,
  isPlaylistOwner = false,
  onRequestSignIn,
  onRequestMakeYourOwn,
  collection,
  onSharedTag,
  itemTags,
  accountTabs,
  onPastePost,
  articleMode = false,
  onToggleArticleMode,
}: DesktopStageChromeProps) {
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteValue, setPasteValue] = useState('')
  const [pasteError, setPasteError] = useState(false)
  const pasteErrorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pasteWrapRef = useRef<HTMLDivElement>(null)
  const pasteInputRef = useRef<HTMLInputElement>(null)
  const currentKey = current ? theaterItemKey(current) : null
  const { ref: captionRef, overflowing } = useClampExpand(currentKey)
  // Eager on a shared preview page: there's one post the visitor followed a
  // link FOR (pinned + repeating, not skimmed past), so the file should be
  // ready before they reach for Send — the only way the share sheet opens
  // inside the tap's own user activation. Elsewhere the 2s skim guard stands.
  const sendFile = useSendFile(current, { eager: mode === 'shared' })

  useEffect(
    () => () => {
      if (pasteErrorTimeoutRef.current) clearTimeout(pasteErrorTimeoutRef.current)
    },
    [],
  )

  useEffect(() => {
    if (!pasteOpen) return
    pasteInputRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setPasteOpen(false)
      setPasteError(false)
      setPasteValue('')
    }
    const onPointer = (e: PointerEvent) => {
      if (pasteWrapRef.current?.contains(e.target as Node)) return
      setPasteOpen(false)
      setPasteError(false)
      setPasteValue('')
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointer)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointer)
    }
  }, [pasteOpen])

  const onPastePostRef = useRef(onPastePost)
  onPastePostRef.current = onPastePost

  const flashPasteError = () => {
    setPasteError(true)
    if (pasteErrorTimeoutRef.current) clearTimeout(pasteErrorTimeoutRef.current)
    pasteErrorTimeoutRef.current = setTimeout(() => setPasteError(false), 2000)
  }

  const tryResolve = useCallback(
    async (text: string) => {
      const pasted = resolvePastedPost(text)
      if (!pasted) {
        flashPasteError()
        return
      }
      // Personal Live / My Collection: add in place and stay on this tab.
      // Never bounce to a preview page — PasteToPreview on /library is a
      // different surface; AuthedTheater does not mount it.
      const handle = onPastePostRef.current
      if (handle) {
        const ok = await handle(pasted.url)
        if (!ok) {
          flashPasteError()
          return
        }
        setPasteValue('')
        setPasteError(false)
        setPasteOpen(false)
        return
      }
      if (collection) {
        // Personal chrome without a handler must not navigate away.
        flashPasteError()
        return
      }
      setPasteValue('')
      setPasteError(false)
      navigateToAppPath(pasted.path)
    },
    [collection],
  )

  // Global ⌘V: only below lg is this component mounted-but-hidden — a global
  // paste listener must respect the same breakpoint so it doesn't fire twice
  // alongside the mobile paste button, and must never hijack a paste aimed
  // at an actual input/textarea/contentEditable. Playlist mode has no paste.
  useEffect(() => {
    if (playlist && !collection) return
    const handler = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target) {
        const tag = target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return
      }
      if (typeof window === 'undefined' || !window.matchMedia('(min-width: 1024px)').matches) return
      const text = e.clipboardData?.getData('text')
      if (!text) return
      void tryResolve(text)
    }
    window.addEventListener('paste', handler)
    return () => window.removeEventListener('paste', handler)
  }, [collection, playlist, tryResolve])

  const kind = current ? inferType(current) : null
  const quoteReader = isQuoteReader(current, false)
  const textLike = (kind !== null && ['text', 'quote', 'article'].includes(kind)) || quoteReader
  const isMedia = (kind === 'video' || kind === 'photo') && !quoteReader
  const showMediaCaption = isMedia && !articleMode
  const showArticleToggle = offerArticleMode(current, overflowing, articleMode)
  const fileAction = fileSendCopy(kind)
  const copyAction = textCopyAction(kind)
  const trendCount = current ? (current.trendCount ?? current.saveCount ?? 0) : 0
  const displayTags = collection?.tags ?? itemTags
  const tagCount = displayTags?.length ?? 0
  const tabs = collection
    ? {
        tab: collection.tab,
        onTabChange: collection.onTabChange,
        onClose: collection.onClose,
      }
    : accountTabs
  const handle = current?.author ? current.author.replace(/^@+/, '') : ''
  const caption = current ? (current.text || '').trim() : ''
  const platformLabel = current ? (PLATFORM_LABEL[current.platform] ?? current.platform) : ''
  const openUrl = current
    ? sourceUrl(current.platform, current.author, current.bookmarkId ?? '')
    : null
  const { linkCopied, textCopied, copyLink, copyText } = useTheaterCopy(current, caption)
  const rootRef = useRef<HTMLDivElement>(null)
  useTheaterActionHotkeys('desktop', rootRef)

  return (
    <div ref={rootRef} className="pointer-events-none absolute inset-0 z-10 hidden lg:block">
      {/* Top bar: brand + LIVE left, paste-a-link + avatar right.
          De-clutter lives in the dock — the menu stays put. */}
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
            playlist && !collection ? 'items-baseline' : 'items-center',
          )}
        >
          {playlist && !collection ? (
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
          {tabs ? (
            <>
              <span className="h-5 w-px flex-none bg-white/20" aria-hidden />
              {/* The close button lives INSIDE this same pill container, right
                  of the tab buttons — owner review: it should read as part of
                  one contained cluster with the tab selector, not stranded
                  among the far-right avatar controls. */}
              <div className="inline-flex flex-none items-center gap-0.5 rounded-full bg-white/10 p-1 text-[12.5px] font-semibold">
                {PERSONAL_TAB_ORDER.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => tabs.onTabChange(t)}
                    aria-current={tabs.tab === t ? 'true' : undefined}
                    className={cn(
                      'rounded-full px-4 py-1.5 whitespace-nowrap transition-colors',
                      // Hardcoded dark ink: `text-ink` flips light in dark theme and vanishes on the white pill.
                      tabs.tab === t ? 'bg-white text-[#1c1917]' : 'text-white/60 hover:text-white',
                    )}
                  >
                    {PERSONAL_TAB_LABEL[t]}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={tabs.onClose}
                  aria-label="Close"
                  className="ml-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/15 hover:text-white"
                >
                  <X size={14} />
                </button>
              </div>
            </>
          ) : playlist ? (
            <>
              <span className="h-5 w-px flex-none self-center bg-white/20" aria-hidden />
              <span className="flex-none truncate text-[19px] font-bold leading-none text-white">
                #{playlist.tag}
              </span>
              <span className="min-w-0 truncate font-mono text-[11px] leading-none text-white/55">
                <span>curated by </span>
                <Link
                  href={`/t/${encodeURIComponent(playlist.curator)}`}
                  onClick={(e) => e.stopPropagation()}
                  className="underline decoration-white/30 underline-offset-2 transition-colors hover:text-white"
                >
                  @{playlist.curator}
                </Link>
                <span>
                  {' '}
                  · {playlist.count} {playlist.count === 1 ? 'post' : 'posts'} ·{' '}
                </span>
                <Repeat size={10} className="inline" aria-hidden />
                <span> loops</span>
              </span>
            </>
          ) : (
            <>
              <span className="inline-flex flex-none items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-white/55">
                <span className="h-2 w-2 flex-none rounded-full bg-live" aria-hidden />
                <span>Live</span>
              </span>
            </>
          )}
        </div>

        <div className="pointer-events-auto flex flex-none items-center gap-2.5">
          {/* One slot: left of paste (or the playlist CTA). Never next to
              the author/caption — every post type uses this same corner. */}
          {current ? <FlameChip trendCount={trendCount} /> : null}
          {playlist && !collection ? (
            !isPlaylistOwner && (
              <StageGlass
                as="button"
                type="button"
                onClick={() => onRequestMakeYourOwn?.()}
                className={GLASS}
              >
                Make your own
              </StageGlass>
            )
          ) : (
            <div ref={pasteWrapRef}>
              {pasteOpen ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    void tryResolve(pasteValue)
                  }}
                  className={cn(
                    'flex h-10 w-[420px] items-center gap-2.5 rounded-full border bg-white/[.08] px-4 pr-2 backdrop-blur-md transition-colors',
                    pasteError ? 'border-red-400/60' : 'border-white/[.18]',
                  )}
                >
                  <Clipboard size={15} className="flex-none text-white/55" />
                  <input
                    ref={pasteInputRef}
                    type="text"
                    aria-label="Paste a link to preview"
                    placeholder={
                      onPastePost
                        ? 'Paste a link to save — X, Instagram, TikTok, YouTube'
                        : 'Paste a link to preview — X, Instagram, TikTok, YouTube'
                    }
                    spellCheck={false}
                    value={pasteValue}
                    onChange={(e) => setPasteValue(e.target.value)}
                    onPaste={(e) => {
                      const text = e.clipboardData.getData('text')
                      if (!text) return
                      e.preventDefault()
                      void tryResolve(text)
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
              ) : (
                <button
                  type="button"
                  aria-label="Paste a link"
                  aria-expanded={false}
                  onClick={() => setPasteOpen(true)}
                  className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-full border border-white/25 bg-white/10 text-white backdrop-blur-md transition-colors hover:bg-white/20"
                >
                  <Clipboard size={16} />
                </button>
              )}
            </div>
          )}

          {/* Signed-out visitors on desktop only get the burger fallback in
              home/shared mode — the personal theater is always reached
              authed — matching the mobile chrome's `allowSignedOut` gate. */}
          <TheaterAvatarMenu
            onRequestSignIn={onRequestSignIn}
            allowSignedOut={!collection && !playlist}
            theaterActive={mode === 'home' || !!collection || !!accountTabs}
            theaterTabs={tabs ? { tab: tabs.tab, onTabChange: tabs.onTabChange } : undefined}
          />
        </div>
      </div>

      {/* Media veil: a light bottom fade under the 2-line caption. Long
          text goes to Read, not an expand/dim overlay. */}
      {current && showMediaCaption && (
        <div
          className={cn(
            'pointer-events-none absolute inset-0 transition-opacity duration-200',
            declutter && 'opacity-0',
          )}
          style={{
            background: 'linear-gradient(transparent 55%, rgba(11,11,17,.84))',
          }}
        />
      )}

      {/* Bottom-left: author + caption + Read. Read sits with the text
          (not the Download/Save row) so it's obvious it's about the
          caption. Article mode hides the caption but keeps Watch here. */}
      {current && (showMediaCaption || (showArticleToggle && onToggleArticleMode)) && (
        <div
          className={cn(
            'pointer-events-auto absolute bottom-6 left-7 flex w-[min(640px,46vw)] flex-col items-start gap-2.5 transition-[opacity,transform] duration-200 ease-out',
            declutter && 'translate-y-3 opacity-0 pointer-events-none',
          )}
        >
          {showMediaCaption && (
            <div className="flex min-w-0 items-center gap-2">
              {(() => {
                const profileUrl = authorProfileUrl(current.platform, current.author)
                const inner = (
                  <>
                    <AuthorAvatar
                      src={current.authorAvatarUrl ?? current.thumbnailUrl}
                      author={current.author}
                      size="sm"
                    />
                    <span className="truncate text-[13.5px] font-bold text-white">
                      {current.authorName || (handle ? `@${handle}` : 'Saved post')}
                    </span>
                    {handle && (
                      <span className="truncate font-mono text-[11px] text-white/50">
                        @{handle}
                      </span>
                    )}
                  </>
                )
                // Tappable author (round 8): jump to the creator's profile on
                // their own platform. Plain row when there's no handle.
                return profileUrl ? (
                  <a
                    href={profileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-w-0 items-center gap-2 transition-opacity hover:opacity-85"
                    title={`View @${handle} on ${PLATFORM_LABEL[current.platform] ?? current.platform}`}
                  >
                    {inner}
                  </a>
                ) : (
                  <div className="flex min-w-0 items-center gap-2">{inner}</div>
                )
              })()}
            </div>
          )}

          {showMediaCaption && caption && (
            <TheaterCaption
              captionRef={captionRef}
              platform={current.platform}
              text={caption}
              links={current.textLinks}
              hideTweetLinks={!!current.quote}
              className="text-[15px] leading-snug"
            />
          )}
          {showArticleToggle && onToggleArticleMode ? (
            <QuoteArticleToggle articleMode={articleMode} onToggle={onToggleArticleMode} />
          ) : null}
        </div>
      )}

      {/* Bottom-right: chips sit in the action row so author+caption stay
          at a fixed height whether the post is tagged or not. Articles
          (no left overlay) still show their tags here. */}
      {current ? (
        <div
          className={cn(
            'pointer-events-auto absolute bottom-6 right-7 flex items-center gap-2 transition-[opacity,transform] duration-200 ease-out',
            declutter && 'translate-y-3 opacity-0 pointer-events-none',
          )}
        >
          <TheaterTagChips
            tags={displayTags}
            className="flex max-w-[min(28vw,16rem)] flex-nowrap items-center justify-end gap-1.5 overflow-x-auto"
          />
          <div className="flex items-center gap-2">
            {sendFile.supported ? (
              <StageGlass
                as="button"
                type="button"
                onClick={() => void sendFile.send()}
                disabled={sendFile.sending}
                title={
                  sendFile.mode === 'share'
                    ? `Opens your share sheet with the ${kind === 'photo' ? 'photo' : 'video'}`
                    : fileAction.title
                }
                className={cn(GLASS, sendFile.primed && 'border-clay')}
                data-theater-action="download"
              >
                {/* Same contract as the mobile pill: the spinner covers the file
                  fetch a tap starts, and `primed` asks for the second tap the
                  share sheet needs rather than downgrading to a link. Reachable
                  here on a tablet, which gets this chrome at lg+ widths. */}
                {sendFile.sending ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <fileAction.Icon size={14} />
                )}
                <span>
                  {sendFile.sending
                    ? 'Getting file'
                    : sendFile.primed
                      ? 'Tap again'
                      : fileAction.label}
                </span>
              </StageGlass>
            ) : textLike && caption ? (
              // Text-like posts have no file — the slot copies tweet text or
              // the article, labeled so it's clear what you get.
              <StageGlass
                as="button"
                type="button"
                onClick={() => void copyText()}
                title={copyAction.title}
                className={GLASS}
                data-theater-action="copy"
              >
                {textCopied ? (
                  <Check size={14} className="text-done" />
                ) : (
                  <copyAction.Icon size={14} />
                )}
                <span>{textCopied ? copyAction.copiedLabel : copyAction.idleLabel}</span>
              </StageGlass>
            ) : null}
            <StageGlass
              as="button"
              type="button"
              onClick={() => void copyLink()}
              className={GLASS}
              data-theater-action="link"
            >
              {linkCopied ? <Check size={14} className="text-done" /> : <LinkIcon size={14} />}
              <span>{linkCopied ? 'Copied' : 'Link'}</span>
            </StageGlass>
            {playlist ? (
              isPlaylistOwner ? (
                <StageGlass
                  as="a"
                  href={`/library?tag=${encodeURIComponent(playlist.tag)}`}
                  className={GLASS}
                >
                  <TagIcon size={14} />
                  <span>Manage playlist</span>
                </StageGlass>
              ) : (
                <SavePlaylistButton
                  count={playlist.count}
                  status={saveStatus}
                  onSave={() => onSavePlaylist?.()}
                  className={SAVE_OUTLINE}
                />
              )
            ) : collection?.tab === 'collection' ? (
              <StageGlass
                as="button"
                type="button"
                onClick={collection.onTag}
                className={GLASS}
                data-theater-action="tag"
              >
                <TagIcon
                  size={14}
                  className={tagCount > 0 ? 'text-clay' : undefined}
                  fill={tagCount > 0 ? 'currentColor' : 'none'}
                />
                <span>{tagCount > 0 ? `Tag · ${tagCount}` : 'Tag'}</span>
              </StageGlass>
            ) : (mode === 'shared' && authed) || collection?.tab === 'live' ? (
              collection?.tab === 'live' ? (
                <>
                  <StageGlass
                    as="button"
                    type="button"
                    onClick={() => collection.onLiveTag?.(current)}
                    title="Tag this post (saves it to your collection first)"
                    className={GLASS}
                    data-theater-action="tag"
                  >
                    <TagIcon
                      size={14}
                      className={tagCount > 0 ? 'text-clay' : undefined}
                      fill={tagCount > 0 ? 'currentColor' : 'none'}
                    />
                    <span>{tagCount > 0 ? `Tag · ${tagCount}` : 'Tag'}</span>
                  </StageGlass>
                  <PersonalLiveSaveButton
                    current={current}
                    collection={collection}
                    className={SAVE_OUTLINE}
                  />
                </>
              ) : (
                <SavePostButton
                  current={current}
                  className={SAVE_OUTLINE}
                  tags={displayTags}
                  onTag={onSharedTag ? () => onSharedTag(current) : undefined}
                />
              )
            ) : (
              <StageGlass
                as="button"
                type="button"
                onClick={() => onRequestSignIn?.()}
                className={SAVE_OUTLINE}
                data-theater-action="save"
              >
                <Bookmark size={14} />
                <span>Save</span>
              </StageGlass>
            )}
            {openUrl && current && (
              <StageGlass
                as="a"
                href={openUrl}
                target="_blank"
                rel="noopener noreferrer"
                title={`Open on ${platformLabel}`}
                aria-label={`Open on ${platformLabel}`}
                className={cn(GLASS, 'w-11 px-0')}
                data-theater-action="open"
                onClick={() =>
                  pingAnalytic('post.open', {
                    platform: current.platform,
                    id: current.bookmarkId || undefined,
                  })
                }
              >
                <PlatformGlyph platform={current.platform} size={14} />
              </StageGlass>
            )}
            {collection?.tab === 'collection' && (
              <TheaterCollectionActions collection={collection} variant="desktop" />
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

// hover:bg-white/15 — the circular disc. Matter hex tokens (`ink/10`,
// `inset` on `bg-surface`) either drop /NN or sit too close to the dock
// to read as a button.
const TRANSPORT_BTN =
  'inline-flex h-10 w-10 flex-none items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-white/15 hover:text-ink disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-ink-3'

export function DesktopDock({
  mode: _mode,
  items,
  current,
  currentKey,
  isSeen,
  seenReady,
  freshKeys,
  newCount,
  wasSeenOnEntry,
  pinnedKey,
  queueTotal,
  savedToday,
  onSelect,
  waiting,
  muted,
  onSetMuted,
  canPrev,
  canNext,
  onPrev,
  onNext,
  declutter,
  onToggleDeclutter,
  playlist,
  collection,
  repeatCurrent = false,
  repeatMode,
  onCycleRepeat,
  articleMode = false,
}: DesktopDockProps) {
  const [showAll, setShowAll] = useState(false)
  const cardRefs = useRef<Map<string, HTMLButtonElement>>(new Map())

  const kind = progressKindFor(current, articleMode)
  const { videoPlaying, timedPaused, setTimedPaused, liveMuted, setLiveMuted } =
    useTheaterStageEvents()

  useEffect(() => {
    setTimedPaused(false)
    // Same reason as the mobile chrome: `liveMuted` is a report about the
    // element that WAS on stage, so carrying it across items shows the
    // previous post's mute state on the new one (state review, 2026-08-22).
    setLiveMuted(null)
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

  // Computed from the DISPLAYED state (not the shell's possibly-stale
  // `muted` prop) so the button always moves the direction the icon shows —
  // then dispatches synchronously (gesture-context fast path for
  // StageVideo/StageYouTube) alongside the shell setter (persistence, one
  // render later). See `onSetMuted`'s doc comment above. Mirrors
  // TheaterMobileChrome's identical handler.
  const handleAudioTap = () => {
    const next = !displayMuted
    logAV(
      `audio tap: displayed=${displayMuted ? 'muted' : 'unmuted'} -> requesting ${next ? 'muted' : 'unmuted'}`,
    )
    window.dispatchEvent(new CustomEvent('theater-set-muted', { detail: { muted: next } }))
    onSetMuted(next)
  }

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
      {/* Transport: 3-col grid. Repeat sits under play/pause (how this
          plays); expand is bottom-left; mute under next. */}
      <div className="flex flex-none items-center gap-2">
        <div className="grid grid-cols-3 justify-items-center gap-0.5">
          <button
            type="button"
            aria-label="Previous post"
            disabled={!canPrev}
            onClick={onPrev}
            className={TRANSPORT_BTN}
          >
            <ChevronLeft size={18} />
          </button>
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
            className={cn(
              TRANSPORT_BTN,
              // shared-post-repeat: accent the deliberate way past the loop.
              repeatCurrent && canNext && 'text-clay hover:bg-white/15 hover:text-clay',
            )}
          >
            <ChevronRight size={18} />
          </button>
          {onToggleDeclutter ? (
            <button
              type="button"
              onClick={onToggleDeclutter}
              aria-label="Hide controls"
              title="Hide controls"
              className={TRANSPORT_BTN}
            >
              <Maximize2 size={16} />
            </button>
          ) : (
            <span className="h-10 w-10" aria-hidden />
          )}
          {/* Spotify-style repeat (round 8): off → all → one. Clay = active.
              Under play/pause — it's how this item plays. */}
          {onCycleRepeat && repeatMode ? (
            <button
              type="button"
              onClick={onCycleRepeat}
              aria-label={REPEAT_MODE_LABEL[repeatMode].action}
              title={REPEAT_MODE_LABEL[repeatMode].state}
              className={cn(TRANSPORT_BTN, repeatMode !== 'off' && 'text-clay hover:text-clay')}
            >
              {repeatMode === 'one' ? <Repeat1 size={16} /> : <Repeat size={16} />}
            </button>
          ) : (
            <span className="h-10 w-10" aria-hidden />
          )}
          {/* Audio always renders — disabled on non-video — so the
              cell under next never collapses as the theater advances. */}
          <button
            type="button"
            aria-label={displayMuted ? 'Unmute' : 'Mute'}
            disabled={kind !== 'video'}
            aria-disabled={kind !== 'video'}
            onClick={handleAudioTap}
            className={cn(TRANSPORT_BTN, soundPulse && 'animate-sound-pulse text-ink')}
          >
            {displayMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
        </div>
        <span className="mx-1 h-16 w-px flex-none bg-hairline" />
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
              {/* Fixed-height meta row: NOW / NEXT → / Repeat used to
                  inherit body line-height (and NEXT could wrap), so those
                  cards grew taller than the rest of the strip. */}
              <div className="flex h-4 min-w-0 items-center gap-1.5">
                <PlatformGlyph
                  platform={item.platform}
                  size={10}
                  className="flex-none text-ink-3"
                />
                {hasKnownTimestamp(item.addedAt) && (
                  <span
                    className="font-mono text-[10px] leading-none text-ink-3"
                    title={addedToAdhxLabel(item.addedAt as string)}
                    aria-label={addedToAdhxLabel(item.addedAt as string)}
                    suppressHydrationWarning
                  >
                    {formatCompactRelativeTime(item.addedAt as string)}
                  </span>
                )}
                <span className="ml-auto flex h-4 flex-none items-center leading-none">
                  {/* shared-post-repeat (owner: the desktop filmstrip's NOW
                      tag sitting near a separate repeat glyph elsewhere read
                      as garbled "MOWN") — while pinned, the current card's
                      tag IS the repeat state: one cohesive icon+label tag,
                      never NOW alongside a second indicator. */}
                  {isCurrent && repeatCurrent ? (
                    <span className="inline-flex items-center gap-1 whitespace-nowrap text-[9.5px] font-bold uppercase leading-none tracking-wide text-clay">
                      <Repeat size={10} aria-hidden />
                      <span>Repeat</span>
                    </span>
                  ) : isCurrent ? (
                    <span className="whitespace-nowrap text-[9.5px] font-bold uppercase leading-none tracking-wide text-clay">
                      NOW
                    </span>
                  ) : isNext ? (
                    <span className="whitespace-nowrap text-[9.5px] font-bold uppercase leading-none tracking-wide text-clay">
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
            after the last item goes — matching goNext's actual wrap target.
            Hidden while the repeat button is on 'one' — the queue isn't
            wrapping then, the current post is looping. */}
        {playlist && items.length > 0 && repeatMode !== 'one' && (
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
                  <div className="flex h-4 min-w-0 items-center gap-1.5">
                    <PlatformGlyph
                      platform={first.platform}
                      size={10}
                      className="flex-none text-ink-3"
                    />
                    {hasKnownTimestamp(first.addedAt) && (
                      <span
                        className="font-mono text-[10px] text-ink-3"
                        title={addedToAdhxLabel(first.addedAt as string)}
                        aria-label={addedToAdhxLabel(first.addedAt as string)}
                        suppressHydrationWarning
                      >
                        {formatCompactRelativeTime(first.addedAt as string)}
                      </span>
                    )}
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
        {/* Vertical stack (owner: the count and new-count sit BELOW the
            "Show all" text so the end cap doesn't eat filmstrip width). */}
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-ink-2 hover:text-ink"
        >
          {showAll ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
          <span>Show all</span>
        </button>
        {/* "N posts" counts what will actually PLAY from here — the unwatched
            run while repeat is off, the whole queue once it isn't (see
            `computeQueueTotal`). Saying 26 when auto-advance will only play the
            5 pending ones is the desktop version of the misleading "3 / 26"
            the mobile peek bar used to show. */}
        <span className="font-mono text-[10.5px] text-ink-3">
          {queueTotal ?? items.length} posts
        </span>
        {!playlist && newCount > 0 && (
          <span className="text-[10.5px] font-semibold text-clay">{newCount} new</span>
        )}
        {/* savedToday/newCount are live-pulse concepts — collection mode is a
            static curated queue, and the personal theater's Collection tab is the user's
            own backlog, so neither line is meaningful for either. Collection
            shows "{remaining} left" instead. */}
        {collection && collection.tab === 'collection' ? (
          <span className="flex items-center gap-1.5 text-[10.5px] text-ink-3">
            <span className="font-mono">{collection.remaining} left</span>
          </span>
        ) : (
          <>
            {/* shared-post-repeat: NO end-cap chip here (removed after owner
                feedback — a third indicator alongside the filmstrip's own
                Repeat tag and the accented next chevron was one too many;
                "facts shown once"). The current card IS the state cue on
                desktop, same as the mobile peek bar's relabeled center
                button; the chevron accent is the "way out" cue. */}
            {/* newCount now rides the count line under "Show all" above —
                only the ambient savedToday/waiting line remains here. */}
            {!playlist &&
              (waiting ? (
                <span className="text-[10.5px] text-ink-3">Waiting for new sends…</span>
              ) : (
                savedToday > 0 && (
                  <span className="text-[10.5px] text-ink-3">{savedToday} saved today</span>
                )
              ))}
          </>
        )}

        {showAll && (
          <div className="absolute bottom-full right-4 z-20 mb-2 flex max-h-[62vh] w-[380px] flex-col overflow-hidden rounded-xl border border-hairline bg-surface shadow-m-lg">
            <div className="flex items-center justify-between px-4 pb-1 pt-3">
              {/* The panel's title states what happens when the queue runs out
                  — the one thing the list itself can't show (owner: "shouldn't
                  the title of Show all be relevant to the selection?"). It also
                  stops the header repeating the "Up next" group heading
                  directly below it. Falls back to "Up next" where repeat isn't
                  offered (the personal theater's Collection tab). */}
              <span className="text-[11px] font-bold uppercase tracking-wide text-ink-3">
                {repeatMode ? REPEAT_MODE_LABEL[repeatMode].queue : 'Up next'}
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
              wasSeenOnEntry={wasSeenOnEntry}
              pinnedKey={pinnedKey}
              onSelect={handlePanelSelect}
              repeatCurrent={repeatCurrent}
              className="min-h-0 flex-1 pb-2"
            />
          </div>
        )}
      </div>
    </div>
  )
}
