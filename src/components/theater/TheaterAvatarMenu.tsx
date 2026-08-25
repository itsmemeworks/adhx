'use client'

import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'
import { usePathname } from 'next/navigation'
import {
  Activity,
  Bookmark,
  Inbox,
  LogIn,
  LogOut,
  Menu,
  Radio,
  Settings,
  Tag,
  Trophy,
  type LucideIcon,
} from 'lucide-react'
import { useAuthMe } from '@/components/auth'
import { cn } from '@/lib/utils'
import { PERSONAL_TAB_ORDER, PERSONAL_TAB_LABEL, type PersonalTab } from './types'
import { resolveAccountAvatarSrc } from '@/lib/avatar/generated-avatar'
import { usePreferences } from '@/lib/preferences-context'
import { THEATER_SHORTCUT_KEYS } from './theater-shortcuts'
import { isSavedPath } from '@/lib/theater/collection-href'

// The theater is ALWAYS dark regardless of the site's light/dark theme, so
// the dropdown panel uses a hardcoded palette rather than the Matter theme
// tokens — same precedent as SignInModal.tsx.
const PANEL = '#201b16'
const BORDER = '#322b23'
const INK = '#f3ece0'
const MUTED = '#857a69'
const SUBTLE = '#b8ac99'

const MENU_ROW =
  'flex items-center gap-2.5 px-4 py-2.5 text-[13px] transition-colors hover:bg-white/[.06] focus:bg-white/10 focus:outline-none'

/** The "you are here" marker for the current screen's menu row (round 8,
 * owner: it wasn't obvious from the burger which screen was loaded). */
function CurrentDot() {
  return (
    <span
      className="ml-auto h-1.5 w-1.5 flex-none rounded-full bg-clay"
      aria-hidden
      data-testid="menu-current-dot"
    />
  )
}

/** A plain `<a>` menu item — shared shape for every nav link in both the
 * signed-in and signed-out menus. `current` marks the screen the visitor is
 * already on: bright ink + a clay dot + `aria-current="page"`. */
function MenuLink({
  href,
  onClick,
  current = false,
  children,
}: {
  href: string
  onClick: () => void
  current?: boolean
  children: ReactNode
}) {
  return (
    <a
      href={href}
      role="menuitem"
      aria-current={current ? 'page' : undefined}
      onClick={onClick}
      className={MENU_ROW}
      style={{ color: current ? INK : SUBTLE }}
    >
      {children}
      {current && <CurrentDot />}
    </a>
  )
}

/**
 * The "Theater" nav entry — identical in the signed-in and signed-out
 * menus, and identical semantics to the Header's own Theater nav item:
 * already inside the home theater, it just closes the menu (a real
 * navigation would restart the stage the visitor is already watching) and
 * carries the current-screen marker — the front page IS the theater;
 * anywhere else (a shared preview page, the leaderboard), it's a real link
 * home. `isHome` can NOT be derived from the pathname alone: the home
 * theater rewrites the address bar to each staged post's preview path
 * (TheaterShell's URL-sync effect), and Next's `usePathname` tracks native
 * `replaceState` — so mid-session the URL reads `/{author}/status/{id}`
 * while the visitor is still on the home theater (owner report: Theater
 * never showed as selected). The theater chromes therefore pass
 * `theaterActive` explicitly (see that prop), OR'd into `isHome` by the
 * caller below.
 */
function TheaterMenuEntry({
  isHome,
  onClose,
  markCurrent = true,
}: {
  isHome: boolean
  onClose: () => void
  /** When Live / Saved sit under Theater, the selected child carries
   * the current-screen marker — Theater stays the same Radio + 13px row as
   * Library, not a second "you are here". */
  markCurrent?: boolean
}) {
  const current = isHome && markCurrent
  if (isHome) {
    return (
      <button
        type="button"
        role="menuitem"
        aria-current={current ? 'page' : undefined}
        onClick={onClose}
        className={`${MENU_ROW} w-full text-left`}
        style={{ color: current ? INK : SUBTLE }}
      >
        <Radio size={15} />
        <span>Theater</span>
        {current && <CurrentDot />}
      </button>
    )
  }
  return (
    <MenuLink href="/" onClick={onClose}>
      <Radio size={15} />
      <span>Theater</span>
    </MenuLink>
  )
}

/**
 * The Theater Radio row plus Live / Saved indented under it (owner:
 * keep the same icon and 13px font as Library; the tabs are sub-rows with
 * their own icons). Mobile has no room for a tab pill in the top scrim, so
 * this is the only switcher there. Desktop keeps its top-bar pill for the
 * mouse and still mounts these rows so `.` + arrows can pick a tab.
 *
 * Selecting a tab goes through `onTabChange` rather than an `<a href>`: the
 * pair is routes (`/live` and `/saved`) but the chrome flips the tab locally
 * first so the switch is instant, then navigates — a plain link would reload
 * the stage the viewer is watching.
 */
const PERSONAL_TAB_ICON: Record<PersonalTab, LucideIcon> = {
  live: Activity,
  collection: Inbox,
}

function TheaterTabsGroup({
  tab,
  onTabChange,
  onClose,
  isHome,
}: {
  tab: PersonalTab
  onTabChange: (tab: PersonalTab) => void
  onClose: () => void
  isHome: boolean
}) {
  return (
    <>
      <TheaterMenuEntry isHome={isHome} onClose={onClose} markCurrent={false} />
      {PERSONAL_TAB_ORDER.map((t) => {
        const Icon = PERSONAL_TAB_ICON[t]
        return (
          <button
            key={t}
            type="button"
            role="menuitem"
            aria-current={tab === t ? 'page' : undefined}
            onClick={() => {
              onTabChange(t)
              onClose()
            }}
            className={`${MENU_ROW} w-full py-2.5 pr-4 pl-[2.4rem] text-left`}
            style={{ color: tab === t ? INK : SUBTLE }}
          >
            <Icon size={15} />
            <span>{PERSONAL_TAB_LABEL[t]}</span>
            {tab === t && <CurrentDot />}
          </button>
        )
      })}
    </>
  )
}

export interface TheaterAvatarMenuProps {
  className?: string
  /**
   * Opens the theater's shared sign-in modal (the "save-post" intent — the
   * same one the Save CTAs trigger) from the signed-out burger's "Sign in"
   * entry. Only read when `allowSignedOut` is set and the visitor isn't
   * authenticated.
   */
  onRequestSignIn?: () => void
  /**
   * Renders a burger-menu fallback (Theater / Leaderboard / Sign in) for
   * signed-out visitors in this exact slot, instead of this component's
   * default "render nothing" behavior — one menu implementation covering
   * both auth states rather than a second component. Callers opt in per
   * mode: the home theater and shared preview pages pass this (signed-out
   * visitors there had no navigation at all); the collection theater is always reached
   * authed, and playlist mode already has its own "Make your own"
   * signed-out conversion CTA, so neither passes it.
   */
  allowSignedOut?: boolean
  /**
   * The mount site IS the home theater screen (home mode, or collection — the
   * theater overlaying `/`), regardless of what the address bar says (the
   * URL-sync effect rewrites it to per-post preview paths mid-session, and
   * usePathname follows). Marks the Theater entry as current and makes it
   * close-only. Shared preview pages and the leaderboard omit it — there,
   * Theater is a real link home and never marked.
   */
  theaterActive?: boolean
  /**
   * Expands the Theater entry into Live / Saved with the selected one
   * marked. Passed whenever the Live ⇄ Saved switch exists (personal
   * theater + signed-in shared preview). Playlist / signed-out home omit it
   * and keep the single Theater row.
   */
  theaterTabs?: { tab: PersonalTab; onTabChange: (tab: PersonalTab) => void }
}

/**
 * Avatar button + dropdown for the theater chrome. Signed in: the account
 * menu — Your collection / Theater / Tags / Leaderboard / Settings (the same
 * nav set as the authed Header's own avatar menu, so signed-in visitors
 * aren't stranded on a preview page) plus Sign out. Signed out with
 * `allowSignedOut`: a burger menu (Theater/Leaderboard/Sign in) in the same
 * slot, so new mobile visitors have SOME way to reach the public surfaces.
 * Signed out without `allowSignedOut` (or while auth is still loading):
 * renders nothing.
 */
export function TheaterAvatarMenu({
  className,
  onRequestSignIn,
  allowSignedOut = false,
  theaterActive = false,
  theaterTabs,
}: TheaterAvatarMenuProps) {
  const { me, loading } = useAuthMe()
  const { preferences } = usePreferences()
  const [open, setOpen] = useState(false)
  // A remote avatar that fails to load falls through to the generated icon,
  // same as having no avatarUrl at all.
  const [avatarBroken, setAvatarBroken] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const pathname = usePathname()

  useEffect(() => {
    if (!open) return

    function menuItems(): HTMLElement[] {
      if (!containerRef.current) return []
      return [...containerRef.current.querySelectorAll<HTMLElement>('[role="menuitem"]')]
    }

    // `.` clicks the trigger, so focus is still on the avatar/burger.
    // Put it on the first row so arrows and Enter drive the menu, not the stage.
    menuItems()[0]?.focus()

    function handlePointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }

    function focusAt(index: number, items: HTMLElement[]) {
      if (items.length === 0) return
      items[(index + items.length) % items.length]?.focus()
    }

    function handleKeyDownCapture(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        e.preventDefault()
        setOpen(false)
        return
      }
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return

      const items = menuItems()
      const current = items.findIndex((el) => el === document.activeElement)

      if (e.key === 'ArrowDown' || e.key === 'j' || e.key === 'J' || e.key === 'ArrowRight') {
        e.preventDefault()
        e.stopPropagation()
        focusAt(current >= 0 ? current + 1 : 0, items)
        return
      }
      if (e.key === 'ArrowUp' || e.key === 'k' || e.key === 'K' || e.key === 'ArrowLeft') {
        e.preventDefault()
        e.stopPropagation()
        focusAt(current >= 0 ? current - 1 : items.length - 1, items)
        return
      }
      if (e.key === 'Home') {
        e.preventDefault()
        e.stopPropagation()
        focusAt(0, items)
        return
      }
      if (e.key === 'End') {
        e.preventDefault()
        e.stopPropagation()
        focusAt(items.length - 1, items)
        return
      }
      if (e.key === 'Enter' || e.key === ' ') {
        const item = current >= 0 ? items[current] : items[0]
        if (item) {
          e.preventDefault()
          e.stopPropagation()
          item.click()
        }
        return
      }

      // `.` toggles this menu via the theater handler clicking the trigger.
      // `?` opens help — close the menu so the overlay is not stacked under it.
      if (e.key === '.' || e.key === '?' || (e.key === '/' && e.shiftKey)) {
        if (e.key !== '.') setOpen(false)
        return
      }
      if (THEATER_SHORTCUT_KEYS.has(e.key)) {
        e.stopPropagation()
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDownCapture, true)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDownCapture, true)
    }
  }, [open])

  if (loading) return null

  // Already on the home theater: the Theater nav entry just closes the menu
  // instead of navigating (a real navigation would restart the stage the
  // visitor is already watching). From anywhere else (a shared preview
  // page), it's a real link home. Shared by both the signed-in and
  // signed-out menus below.
  // `theaterActive` folds in because the home theater's URL-sync rewrites
  // the pathname to per-post preview paths mid-session — see
  // TheaterMenuEntry's doc comment.
  const isHome = pathname === '/' || pathname === '/live' || isSavedPath(pathname) || theaterActive
  // Current-screen markers for the other nav entries (round 8). Prefix match
  // so /leaderboard/[window] etc. still count.
  const isLeaderboard = pathname === '/leaderboard' || pathname?.startsWith('/leaderboard/')
  const isTags = pathname === '/tags' || pathname?.startsWith('/tags/')
  const isSettings = pathname === '/settings' || pathname?.startsWith('/settings/')
  const close = () => setOpen(false)

  if (!me?.authenticated || !me.user) {
    if (!allowSignedOut) return null

    return (
      <div
        ref={containerRef}
        className={cn('relative', className)}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Menu"
          aria-haspopup="menu"
          aria-expanded={open}
          data-theater-action="menu"
          onClick={() => setOpen((v) => !v)}
          className="flex h-10 w-10 flex-none items-center justify-center rounded-full border border-white/25 bg-white/10 text-white backdrop-blur-md transition-colors hover:bg-white/20"
        >
          <Menu size={18} />
        </button>

        {open && (
          <div
            role="menu"
            className="absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-2xl border shadow-2xl"
            style={{ backgroundColor: PANEL, borderColor: BORDER }}
          >
            <TheaterMenuEntry isHome={isHome} onClose={close} />
            <MenuLink href="/leaderboard" onClick={close} current={isLeaderboard}>
              <Trophy size={15} />
              <span>Leaderboard</span>
            </MenuLink>
            <div className="my-1 h-px" style={{ backgroundColor: BORDER }} />
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false)
                onRequestSignIn?.()
              }}
              className={`${MENU_ROW} w-full text-left`}
              style={{ color: SUBTLE }}
            >
              <LogIn size={15} />
              <span>Sign in</span>
            </button>
          </div>
        )}
      </div>
    )
  }

  const { user, identities } = me
  const avatarSrc = resolveAccountAvatarSrc({
    avatarSource: preferences.avatarSource,
    xAvatarUrl: identities?.x?.avatarUrl,
    username: user.username || user.displayName,
    broken: avatarBroken,
  })
  const identityLabel = `@${user.username}`
  const identitySubtitle = identities?.x
    ? 'Connected'
    : identities?.email
      ? 'Signed in with email'
      : null

  async function handleSignOut(e: ReactMouseEvent) {
    e.stopPropagation()
    setOpen(false)
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } finally {
      window.location.href = '/'
    }
  }

  return (
    <div
      ref={containerRef}
      className={cn('relative', className)}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        data-theater-action="menu"
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-10 flex-none items-center justify-center overflow-hidden rounded-full border border-white/25 bg-white/10 text-[13px] font-semibold text-white backdrop-blur-md transition-colors hover:bg-white/20"
      >
        <img
          src={avatarSrc}
          alt=""
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
          onError={() => setAvatarBroken(true)}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-2xl border shadow-2xl"
          style={{ backgroundColor: PANEL, borderColor: BORDER }}
        >
          <div
            className="flex items-center gap-3 border-b px-4 py-3"
            style={{ borderColor: BORDER }}
          >
            <div
              className="flex h-9 w-9 flex-none items-center justify-center overflow-hidden rounded-full text-[13px] font-semibold text-white"
              style={{ backgroundColor: BORDER }}
            >
              <img
                src={avatarSrc}
                alt=""
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
                onError={() => setAvatarBroken(true)}
              />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[13.5px] font-semibold" style={{ color: INK }}>
                {identityLabel}
              </p>
              {identitySubtitle && (
                <p className="text-[11.5px]" style={{ color: MUTED }}>
                  {identitySubtitle}
                </p>
              )}
            </div>
          </div>

          {/* Nav group — Theater first (the two tabs, or the single Theater
              entry), then Library, then Tags / Leaderboard / Settings. Matches
              the authed Header avatar menu so signed-in visitors aren't
              stranded on a preview page. */}
          {theaterTabs ? (
            <TheaterTabsGroup
              tab={theaterTabs.tab}
              onTabChange={theaterTabs.onTabChange}
              onClose={close}
              isHome={isHome}
            />
          ) : (
            <TheaterMenuEntry isHome={isHome} onClose={close} />
          )}
          <MenuLink href="/library" onClick={close}>
            <Bookmark size={15} />
            {/* "Library" (the grid over your saves — repo terminology) rather
                than "Your collection", which became ambiguous the moment the
                Theater group gained a "Saved" tab: two rows reading
                as the same destination, going to different screens. */}
            <span>Library</span>
          </MenuLink>
          <MenuLink href="/tags" onClick={close} current={isTags}>
            <Tag size={15} />
            <span>Tags</span>
          </MenuLink>
          <MenuLink href="/leaderboard" onClick={close} current={isLeaderboard}>
            <Trophy size={15} />
            <span>Leaderboard</span>
          </MenuLink>
          <MenuLink href="/settings" onClick={close} current={isSettings}>
            <Settings size={15} />
            <span>Settings</span>
          </MenuLink>
          <div className="my-1 h-px" style={{ backgroundColor: BORDER }} />
          <button
            type="button"
            role="menuitem"
            onClick={handleSignOut}
            className={`${MENU_ROW} w-full text-left`}
            style={{ color: SUBTLE }}
          >
            <LogOut size={15} />
            <span>Sign out</span>
          </button>
        </div>
      )}
    </div>
  )
}
