'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import {
  Search,
  Settings,
  Sun,
  Moon,
  X,
  RefreshCw,
  Bookmark,
  Radio,
  LogOut,
  Tag,
  Trophy,
} from 'lucide-react'
import { useTheme } from '@/lib/theme/context'
import { cn } from '@/lib/utils'
import { resolveAccountAvatarSrc } from '@/lib/avatar/generated-avatar'
import { usePreferences } from '@/lib/preferences-context'
import { MatterLogo } from '@/components/matter'
import { SyncProgress } from './sync/SyncProgress'
import {
  readLastVisibleAt,
  shouldResumeSync,
  stampLastVisibleAt,
  claimResumeSync,
} from '@/lib/sync/resume'

interface AuthStatus {
  authenticated: boolean
  user?: {
    id: string
    username: string
    profileImageUrl?: string | null
  }
}

// From /api/auth/me — lets the menu tell an X-connected identity apart from
// an email-only one (which has no @handle to show).
interface Identities {
  x: { username: string; avatarUrl?: string | null } | null
  email: { email: string } | null
}

interface Stats {
  total: number
  /** Posts NOT archived — what the collection actively holds. */
  active: number
}

interface CooldownStatus {
  canSync: boolean
  cooldownRemaining: number
  lastSyncAt: string | null
  fetchedAt: number // timestamp when cooldown was fetched
}

export function Header() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const { resolvedTheme, setTheme } = useTheme()
  const { preferences } = usePreferences()
  // Search lives only on /library (collection) and /tags. On /tags it filters
  // the tag list via the same cross-component custom-event pattern documented
  // in CLAUDE.md ("Cross-Component Keyboard Feedback") — TagsClient owns the
  // filtering; Header re-broadcasts every keystroke and never writes `search`
  // into the URL. Everywhere else the control is hidden so the bar stays
  // logo-left / avatar-right without a center field throwing it off.
  const onLibraryPage = pathname === '/library'
  const onTagsPage = pathname === '/tags'
  const showSearch = onLibraryPage || onTagsPage
  const searchLabel = onTagsPage ? 'Tags' : 'Search'
  const [searchValue, setSearchValue] = useState(searchParams.get('search') || '')
  const [searchOpen, setSearchOpen] = useState(
    () => onLibraryPage && Boolean(searchParams.get('search')),
  )
  const [showSync, setShowSync] = useState(false)
  const [silentSync, setSilentSync] = useState(false)
  const [cooldownReady, setCooldownReady] = useState(false)
  const resumeAttemptedRef = useRef(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null)
  const [identities, setIdentities] = useState<Identities | null>(null)
  // Whether this account has a live X connection — email-only accounts have
  // no bookmarks to sync, so sync affordances are hidden entirely for them.
  const [xConnected, setXConnected] = useState(false)
  const [stats, setStats] = useState<Stats>({ total: 0, active: 0 })
  const [cooldown, setCooldown] = useState<CooldownStatus>({
    canSync: true,
    cooldownRemaining: 0,
    lastSyncAt: null,
    fetchedAt: Date.now(),
  })
  const [displayedCooldown, setDisplayedCooldown] = useState(0)

  useEffect(() => {
    // Only fetch auth status on mount - stats/cooldown are fetched after auth is confirmed
    fetchAuthStatus()

    // Listen for stats updates from other components (only fires when authenticated)
    const handleStatsUpdate = () => {
      if (authStatus?.authenticated) {
        fetchStats()
      }
    }
    window.addEventListener('stats-updated', handleStatsUpdate)

    // Listen for sync complete to refresh stats and cooldown (only fires when authenticated)
    const handleSyncComplete = () => {
      if (authStatus?.authenticated) {
        fetchStats()
        fetchCooldown()
      }
    }
    window.addEventListener('sync-complete', handleSyncComplete)

    return () => {
      window.removeEventListener('stats-updated', handleStatsUpdate)
      window.removeEventListener('sync-complete', handleSyncComplete)
    }
  }, [authStatus?.authenticated])

  // Separate effect for sync shortcut to track cooldown state
  useEffect(() => {
    const handleOpenSync = () => {
      if (cooldown.canSync && xConnected) {
        setShowSync(true)
      }
    }
    window.addEventListener('open-sync', handleOpenSync)
    return () => window.removeEventListener('open-sync', handleOpenSync)
  }, [cooldown.canSync, xConnected])

  // Refresh stats and cooldown when auth status changes to authenticated
  useEffect(() => {
    if (authStatus?.authenticated) {
      fetchStats()
      fetchCooldown()

      // Update cooldown timer every minute (only when authenticated)
      const cooldownInterval = setInterval(fetchCooldown, 60000)
      return () => clearInterval(cooldownInterval)
    }
  }, [authStatus?.authenticated])

  // After a day away, pull new bookmarks in the background. First-login sync
  // (the OAuth callback) owns that path, so skip it here.
  useEffect(() => {
    if (!authStatus?.authenticated || !cooldownReady || !xConnected) return
    if (resumeAttemptedRef.current) return
    if (searchParams.get('firstLogin') === 'true') {
      resumeAttemptedRef.current = true
      stampLastVisibleAt()
      return
    }

    const lastVisibleAt = readLastVisibleAt()
    const lastSyncAt = cooldown.lastSyncAt ? Date.parse(cooldown.lastSyncAt) : null
    const should = shouldResumeSync({
      lastVisibleAt,
      lastSyncAt,
      now: Date.now(),
    })
    stampLastVisibleAt()
    resumeAttemptedRef.current = true
    if (should && cooldown.canSync && claimResumeSync()) setSilentSync(true)
  }, [
    authStatus?.authenticated,
    cooldownReady,
    cooldown.canSync,
    cooldown.lastSyncAt,
    searchParams,
    xConnected,
  ])

  useEffect(() => {
    if (!authStatus?.authenticated || !xConnected) return

    const onVis = () => {
      if (document.visibilityState !== 'visible') return
      const lastVisibleAt = readLastVisibleAt()
      stampLastVisibleAt()
      if (searchParams.get('firstLogin') === 'true') return
      if (!cooldown.canSync) return
      if (showSync || silentSync) return
      if (
        shouldResumeSync({
          lastVisibleAt,
          lastSyncAt: null,
          now: Date.now(),
        }) &&
        claimResumeSync()
      ) {
        setSilentSync(true)
      }
    }

    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [authStatus?.authenticated, cooldown.canSync, searchParams, showSync, silentSync, xConnected])

  // Update search from the library URL. Depend on the `search` string, not the
  // searchParams object: a new object identity on every render would reset
  // in-progress typing back to the still-empty URL and cancel the debounce.
  // On /tags the query never lives in the URL, so we must not clobber typing.
  const urlSearch = onLibraryPage ? searchParams.get('search') || '' : ''
  useEffect(() => {
    if (!onLibraryPage) return
    setSearchValue(urlSearch)
    if (urlSearch) setSearchOpen(true)
  }, [urlSearch, onLibraryPage])

  // Collapse / reset when leaving a search surface (Header stays mounted).
  useEffect(() => {
    if (onTagsPage) {
      setSearchValue('')
      setSearchOpen(false)
      return
    }
    if (!onLibraryPage) setSearchOpen(false)
  }, [pathname, onTagsPage, onLibraryPage])

  // Real-time search with debounce. Deliberately does NOT depend on `searchParams`:
  // this component is the sole owner of writing `search` into the URL, and
  // AuthedHome issues its own router.replace calls for its own filters
  // (filter/platform/sort/etc). If `searchParams` were a dependency here, every one
  // of those unrelated navigations would reset this debounce timer mid-keystroke,
  // delaying or dropping the search push. `window.location.search` is read fresh
  // inside the timeout callback, so the comparison still reflects the current URL.
  //
  // Only /library writes the URL (stay on /library, never bounce to `/`). On
  // /tags, search is routed to TagsClient via `tags-search` and this effect
  // is skipped.
  useEffect(() => {
    if (!onLibraryPage) return
    const debounceTimer = setTimeout(() => {
      const currentParams = new URLSearchParams(window.location.search)
      const currentSearch = currentParams.get('search') || ''
      const newSearch = searchValue.trim()

      // Only update if different from current URL
      if (newSearch !== currentSearch) {
        if (newSearch) {
          currentParams.set('search', newSearch)
        } else {
          currentParams.delete('search')
        }
        const queryString = currentParams.toString()
        router.push(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false })
      }
    }, 300) // 300ms debounce

    return () => clearTimeout(debounceTimer)
  }, [searchValue, router, onLibraryPage, pathname])

  async function fetchAuthStatus() {
    try {
      // /api/auth/me (not the X-only /api/auth/twitter/status) so email-only
      // accounts render the authed header too, and so we get `identities`
      // for the avatar menu's identity line.
      const response = await fetch('/api/auth/me')
      const data = await response.json()
      setAuthStatus({
        authenticated: data.authenticated,
        user: data.user
          ? {
              id: data.user.id,
              username: data.user.username,
              profileImageUrl: data.user.avatarUrl,
            }
          : undefined,
      })
      setIdentities(data.identities ?? null)
      setXConnected(Boolean(data.xConnected))
    } catch (error) {
      console.error('Failed to fetch auth status:', error)
    }
  }

  async function handleSignOut() {
    setShowUserMenu(false)
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } finally {
      window.location.href = '/'
    }
  }

  async function fetchStats() {
    try {
      const response = await fetch('/api/stats')
      const data = await response.json()
      setStats({ total: data.total || 0, active: data.active || 0 })
    } catch (error) {
      console.error('Failed to fetch stats:', error)
    }
  }

  async function fetchCooldown() {
    try {
      const response = await fetch('/api/sync/cooldown')
      const data = await response.json()
      setCooldown({ ...data, fetchedAt: Date.now() })
      setCooldownReady(true)
    } catch (error) {
      console.error('Failed to fetch cooldown:', error)
    }
  }

  // Live countdown timer - updates every second
  useEffect(() => {
    if (cooldown.canSync) {
      setDisplayedCooldown(0)
      return
    }

    // Calculate initial displayed value
    const elapsed = Date.now() - cooldown.fetchedAt
    const remaining = Math.max(0, cooldown.cooldownRemaining - elapsed)
    setDisplayedCooldown(remaining)

    // Update every second
    const interval = setInterval(() => {
      const elapsed = Date.now() - cooldown.fetchedAt
      const remaining = Math.max(0, cooldown.cooldownRemaining - elapsed)
      setDisplayedCooldown(remaining)

      // Clear interval when countdown reaches zero
      if (remaining <= 0) {
        clearInterval(interval)
        fetchCooldown() // Refresh to confirm sync is available
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [cooldown.canSync, cooldown.cooldownRemaining, cooldown.fetchedAt])

  const handleSearchChange = (value: string) => {
    setSearchValue(value)
    if (onTagsPage) {
      window.dispatchEvent(new CustomEvent('tags-search', { detail: value }))
    }
  }

  const clearSearch = () => {
    handleSearchChange('')
  }

  const handleSyncComplete = () => {
    fetchStats()
    fetchCooldown()
    router.refresh()
  }

  const toggleTheme = () => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
  }

  // Format remaining cooldown time with seconds for live countdown
  const formatCooldown = (ms: number) => {
    const totalSeconds = Math.ceil(ms / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    if (minutes >= 60) {
      return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds}s`
    }
    return `${seconds}s`
  }

  // Settings "X photo vs generated" — same helper as the theater menu.
  const [avatarBroken, setAvatarBroken] = useState(false)
  const avatarSrc = resolveAccountAvatarSrc({
    avatarSource: preferences.avatarSource,
    xAvatarUrl: identities?.x?.avatarUrl,
    username: authStatus?.user?.username || 'adhx',
    broken: avatarBroken,
  })

  // Signed-out: the only signed-out page is the marketing landing, which has
  // its own nav — so the app top bar renders nothing (avoids a double header).
  if (authStatus !== null && !authStatus.authenticated) return null

  // The leaderboard (and its old /collections URL) renders its own dark
  // header for signed-out visitors (CollectionsBoard). Auth starts out
  // unresolved (`authStatus === null`) on every page load, and until it
  // resolves the check above can't yet bail out — so without this guard,
  // this component's light header briefly stacks above the board's dark one
  // and then vanishes once the fetch confirms the visitor is signed out.
  // Scoped to just these routes: making the WHOLE header wait for auth would
  // flash-hide it on every authed page instead.
  if (
    authStatus === null &&
    (pathname.startsWith('/leaderboard') || pathname.startsWith('/collections'))
  )
    return null

  return (
    <>
      <header className="sticky top-0 z-50 bg-surface border-b border-hairline">
        <div className="px-4 sm:px-6 h-16 flex items-center justify-between gap-2 sm:gap-4">
          {/* Left section - Logo and Stats */}
          <div className="flex items-center gap-4 flex-shrink-0">
            {/* Logo */}
            <Link href="/" className="flex items-center" aria-label="ADHX home">
              <MatterLogo size={20} />
            </Link>

            {/* Primary nav — every entry is a real route now that the theater
                has its own: signed-in `/` (and this Theater link) lands on
                `/collection` (next unread); `/live` is Live; the grid is
                `/library`. "Theater" names the surface rather than one tab.
                Only when authenticated, hidden on mobile (mobile uses the menu). */}
            {authStatus?.authenticated && (
              <nav className="hidden lg:flex items-center gap-1 text-[13.5px]">
                <Link
                  href="/library"
                  className={cn(
                    'rounded-full px-3 py-1.5 font-semibold transition-colors',
                    pathname === '/library'
                      ? 'bg-clay/[0.12] text-clay'
                      : 'text-ink-2 hover:text-ink',
                  )}
                >
                  Library
                </Link>
                <Link
                  href="/"
                  className={cn(
                    'rounded-full px-3 py-1.5 font-semibold transition-colors',
                    pathname === '/' || pathname === '/live' || pathname === '/collection'
                      ? 'bg-clay/[0.12] text-clay'
                      : 'text-ink-2 hover:text-ink',
                  )}
                >
                  Theater
                </Link>
                <Link
                  href="/tags"
                  className={cn(
                    'rounded-full px-3 py-1.5 font-semibold transition-colors',
                    pathname === '/tags' ? 'bg-clay/[0.12] text-clay' : 'text-ink-2 hover:text-ink',
                  )}
                >
                  Tags
                </Link>
                <Link
                  href="/leaderboard"
                  className={cn(
                    'rounded-full px-3 py-1.5 font-semibold transition-colors',
                    pathname === '/leaderboard'
                      ? 'bg-clay/[0.12] text-clay'
                      : 'text-ink-2 hover:text-ink',
                  )}
                >
                  Leaderboard
                </Link>
              </nav>
            )}
          </div>

          {/* Right section - Search (library + tags) then avatar */}
          {authStatus?.authenticated && (
            <div
              className={cn(
                'flex items-center gap-1.5 sm:gap-2 min-w-0',
                showSearch && searchOpen ? 'flex-1 justify-end' : 'flex-shrink-0',
              )}
            >
              {showSearch &&
                (searchOpen ? (
                  <div className="relative min-w-0 flex-1 max-w-[20rem]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-3 pointer-events-none" />
                    <input
                      type="text"
                      autoFocus
                      value={searchValue}
                      onChange={(e) => handleSearchChange(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          e.currentTarget.blur()
                          setSearchOpen(false)
                        }
                      }}
                      placeholder={searchLabel}
                      aria-label={searchLabel}
                      className="w-full h-9 pl-9 pr-9 bg-inset rounded-full text-base sm:text-[13.5px] text-ink placeholder-ink-3 focus:outline-none focus:ring-2 focus:ring-clay/40"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        clearSearch()
                        setSearchOpen(false)
                      }}
                      aria-label="Close search"
                      className="absolute right-2 inset-y-0 my-auto h-6 w-6 flex items-center justify-center hover:bg-hairline rounded-full transition-colors"
                    >
                      <X className="w-4 h-4 text-ink-3" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setSearchOpen(true)}
                    aria-label={searchLabel}
                    aria-expanded={false}
                    className={cn(
                      'w-9 h-9 flex items-center justify-center rounded-full hover:bg-inset transition-colors',
                      searchValue ? 'text-clay' : 'text-ink-2',
                    )}
                  >
                    <Search className="w-[18px] h-[18px]" />
                  </button>
                ))}
              {/* Theme toggle + Sync are secondary actions — they live in the
                  avatar menu (all viewports), not the main nav bar. Adding by
                  URL is paste-first now (PasteToPreview) — no Add button. */}

              {/* User Menu */}
              <div className="relative">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="w-[33px] h-[33px] rounded-full overflow-hidden hover:ring-2 hover:ring-clay/40 transition-all flex items-center justify-center"
                >
                  <img
                    src={avatarSrc}
                    alt={authStatus?.user?.username || 'User'}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                    onError={() => setAvatarBroken(true)}
                  />
                </button>

                {showUserMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
                    <div className="absolute right-0 top-full mt-2 w-64 bg-surface rounded-card shadow-m-lg border border-hairline py-2 z-50">
                      {/* User info at top. Always the ADHX username — email
                          is a sign-in method, not the account name. */}
                      {authStatus?.authenticated && authStatus.user && (
                        <div className="px-4 py-3 border-b border-hairline">
                          <div className="flex items-center gap-3 min-w-0">
                            <img
                              src={avatarSrc}
                              alt={authStatus.user.username}
                              referrerPolicy="no-referrer"
                              className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                              onError={() => setAvatarBroken(true)}
                            />
                            <div className="min-w-0">
                              <p className="font-semibold text-ink font-mono truncate">
                                @{authStatus.user.username}
                              </p>
                              <p className="text-xs text-ink-3">
                                {identities?.x ? 'Connected' : 'Signed in with email'}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Mobile stats - shown when header stats are hidden */}
                      <div className="lg:hidden px-4 py-3 border-b border-hairline">
                        <div className="flex items-center gap-4 text-sm text-ink-2">
                          <span>
                            <b className="font-bold text-ink">{stats.total}</b> saved
                          </span>
                          <span>
                            <b className="font-bold text-clay">{stats.active}</b> unread
                          </span>
                        </div>
                      </div>

                      {/* Nav + Settings links — Theater then Library, matching
                          the theater avatar menu. */}
                      <div className="py-1">
                        <Link
                          href="/"
                          onClick={() => setShowUserMenu(false)}
                          className={cn(
                            'flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-inset transition-colors',
                            pathname === '/' || pathname === '/live' || pathname === '/collection'
                              ? 'font-semibold text-clay'
                              : 'text-ink-2 hover:text-ink',
                          )}
                        >
                          <Radio className="w-4 h-4" />
                          Theater
                        </Link>
                        <Link
                          href="/library"
                          onClick={() => setShowUserMenu(false)}
                          className={cn(
                            'flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-inset transition-colors',
                            pathname === '/library'
                              ? 'font-semibold text-clay'
                              : 'text-ink-2 hover:text-ink',
                          )}
                        >
                          <Bookmark className="w-4 h-4" />
                          Library
                        </Link>
                        <Link
                          href="/tags"
                          onClick={() => setShowUserMenu(false)}
                          className={cn(
                            'flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-inset transition-colors',
                            pathname === '/tags'
                              ? 'font-semibold text-clay'
                              : 'text-ink-2 hover:text-ink',
                          )}
                        >
                          <Tag className="w-4 h-4" />
                          Tags
                        </Link>
                        <Link
                          href="/leaderboard"
                          onClick={() => setShowUserMenu(false)}
                          className={cn(
                            'flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-inset transition-colors',
                            pathname === '/leaderboard'
                              ? 'font-semibold text-clay'
                              : 'text-ink-2 hover:text-ink',
                          )}
                        >
                          <Trophy className="w-4 h-4" />
                          Leaderboard
                        </Link>
                        <Link
                          href="/settings"
                          onClick={() => setShowUserMenu(false)}
                          className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-inset text-ink-2 hover:text-ink transition-colors"
                        >
                          <Settings className="w-4 h-4" />
                          Settings
                        </Link>
                      </div>

                      {/* Theme + Sync — secondary actions, in the menu on all
                          viewports (no longer in the main nav bar). */}
                      <div className="border-t border-hairline py-1">
                        <button
                          onClick={toggleTheme}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-inset text-ink-2 hover:text-ink transition-colors"
                        >
                          {resolvedTheme === 'dark' ? (
                            <Sun className="w-4 h-4" />
                          ) : (
                            <Moon className="w-4 h-4" />
                          )}
                          {resolvedTheme === 'dark' ? 'Light mode' : 'Dark mode'}
                        </button>
                        {/* Email-only accounts have no X connection, so
                            there's nothing to sync — hide the item rather
                            than showing an action that can never succeed. */}
                        {xConnected && (
                          <button
                            onClick={() => {
                              if (cooldown.canSync) {
                                setShowSync(true)
                                setShowUserMenu(false)
                              }
                            }}
                            disabled={!cooldown.canSync}
                            className={cn(
                              'w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors',
                              cooldown.canSync
                                ? 'hover:bg-inset text-ink hover:text-ink'
                                : 'text-ink-3 opacity-40 cursor-not-allowed',
                            )}
                          >
                            <RefreshCw className="w-4 h-4" />
                            {cooldown.canSync
                              ? 'Sync bookmarks'
                              : `Sync in ${formatCooldown(displayedCooldown)}`}
                          </button>
                        )}
                      </div>

                      {/* Sign out */}
                      <div className="border-t border-hairline py-1">
                        <button
                          onClick={handleSignOut}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-inset text-ink-2 hover:text-ink transition-colors"
                        >
                          <LogOut className="w-4 h-4" />
                          Sign out
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Sync Progress Modal */}
      <SyncProgress
        isOpen={showSync || silentSync}
        silent={silentSync && !showSync}
        onClose={() => {
          setShowSync(false)
          setSilentSync(false)
        }}
        onComplete={handleSyncComplete}
      />
    </>
  )
}
