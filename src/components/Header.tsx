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
  Zap,
  Flame,
  Bookmark,
  Radio,
  LogOut,
  Tag,
} from 'lucide-react'
import { useTheme } from '@/lib/theme/context'
import { cn } from '@/lib/utils'
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
  x: { username: string } | null
  email: { email: string } | null
}

interface Stats {
  total: number
  unread: number
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
  const [searchValue, setSearchValue] = useState(searchParams.get('search') || '')
  const [showSync, setShowSync] = useState(false)
  const [silentSync, setSilentSync] = useState(false)
  const [cooldownReady, setCooldownReady] = useState(false)
  const resumeAttemptedRef = useRef(false)
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null)
  const [identities, setIdentities] = useState<Identities | null>(null)
  // Whether this account has a live X connection — email-only accounts have
  // no bookmarks to sync, so sync affordances are hidden entirely for them.
  const [xConnected, setXConnected] = useState(false)
  const [stats, setStats] = useState<Stats>({ total: 0, unread: 0 })
  const [streak, setStreak] = useState(0)
  const [cooldown, setCooldown] = useState<CooldownStatus>({
    canSync: true,
    cooldownRemaining: 0,
    lastSyncAt: null,
    fetchedAt: Date.now(),
  })
  const [displayedCooldown, setDisplayedCooldown] = useState(0)

  // Ref for keyboard shortcut focus
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // Only fetch auth status on mount - stats/cooldown are fetched after auth is confirmed
    fetchAuthStatus()

    // Listen for stats updates from other components (only fires when authenticated)
    const handleStatsUpdate = () => {
      if (authStatus?.authenticated) {
        fetchStats()
        fetchStreak()
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

    // Keyboard shortcut events
    const handleFocusSearch = () => searchInputRef.current?.focus()

    window.addEventListener('focus-search', handleFocusSearch)

    return () => {
      window.removeEventListener('stats-updated', handleStatsUpdate)
      window.removeEventListener('sync-complete', handleSyncComplete)
      window.removeEventListener('focus-search', handleFocusSearch)
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
      fetchStreak()

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

  // Update search from URL params
  useEffect(() => {
    setSearchValue(searchParams.get('search') || '')
  }, [searchParams])

  // Real-time search with debounce. Deliberately does NOT depend on `searchParams`:
  // this component is the sole owner of writing `search` into the URL, and page.tsx
  // (src/app/page.tsx) issues its own router.replace calls for its own filters
  // (filter/platform/sort/etc). If `searchParams` were a dependency here, every one
  // of those unrelated navigations would reset this debounce timer mid-keystroke,
  // delaying or dropping the search push. `window.location.search` is read fresh
  // inside the timeout callback, so the comparison still reflects the current URL.
  useEffect(() => {
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
        router.push(queryString ? `/?${queryString}` : '/', { scroll: false })
      }
    }, 300) // 300ms debounce

    return () => clearTimeout(debounceTimer)
  }, [searchValue, router])

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
      setStats({ total: data.total || 0, unread: data.unread || 0 })
    } catch (error) {
      console.error('Failed to fetch stats:', error)
    }
  }

  async function fetchStreak() {
    try {
      const response = await fetch('/api/triage/streak')
      const data = await response.json()
      setStreak(data.current || 0)
    } catch (error) {
      console.error('Failed to fetch streak:', error)
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

  const clearSearch = () => {
    setSearchValue('')
  }

  const handleSyncComplete = () => {
    fetchStats()
    fetchCooldown()
    router.refresh()
  }

  const openTriage = () => {
    // The feed page owns triage. If we're already there, open it directly;
    // otherwise navigate to the feed with ?triage=1 so it opens once loaded.
    if (pathname === '/') {
      // `open-theater` is the standardized event (unified theater nav); a
      // parallel migration listens for it. `open-triage` is the legacy event
      // some listeners still expect — dispatch both until that integration
      // lands, then drop the legacy one.
      window.dispatchEvent(new CustomEvent('open-theater', { detail: { tab: 'triage' } }))
      window.dispatchEvent(new CustomEvent('open-triage'))
    } else {
      router.push('/?triage=1')
    }
  }

  const openLive = () => {
    // Mirrors openTriage: the theater lives on the feed page (`/`), so only
    // dispatch the open-theater event when we're already there. From any
    // other route (e.g. /tags), navigate to the feed with ?live=1 so it
    // opens the theater on the Live tab once loaded.
    if (pathname === '/') {
      window.dispatchEvent(new CustomEvent('open-theater', { detail: { tab: 'live' } }))
    } else {
      router.push('/?live=1')
    }
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

  const userInitial = authStatus?.user?.username?.[0]?.toUpperCase() || 'U'
  const profileImage = authStatus?.user?.profileImageUrl

  // Signed-out: the only signed-out page is the marketing landing, which has
  // its own nav — so the app top bar renders nothing (avoids a double header).
  if (authStatus !== null && !authStatus.authenticated) return null

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

            {/* Primary nav — Collection stays a link; Live opens the theater
                overlay on the community pulse instead of navigating.
                Only when authenticated, hidden on mobile (mobile uses the menu). */}
            {authStatus?.authenticated && (
              <nav className="hidden lg:flex items-center gap-1 text-[13.5px]">
                <Link
                  href="/"
                  className={cn(
                    'rounded-full px-3 py-1.5 font-semibold transition-colors',
                    pathname === '/' ? 'bg-clay/[0.12] text-clay' : 'text-ink-2 hover:text-ink',
                  )}
                >
                  Collection
                </Link>
                <button
                  type="button"
                  onClick={openLive}
                  className="rounded-full px-3 py-1.5 font-semibold text-ink-2 hover:text-ink transition-colors"
                >
                  Live
                </button>
                <Link
                  href="/tags"
                  className={cn(
                    'rounded-full px-3 py-1.5 font-semibold transition-colors',
                    pathname === '/tags' ? 'bg-clay/[0.12] text-clay' : 'text-ink-2 hover:text-ink',
                  )}
                >
                  Tags
                </Link>
              </nav>
            )}
          </div>

          {/* Center section - Search (desktop only, only show when authenticated) */}
          {authStatus?.authenticated && (
            <div className="hidden md:block flex-1 max-w-[540px] mx-auto">
              <div className="relative flex items-center">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-[17px] h-[17px] text-ink-3 pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  placeholder="Search your collection…"
                  aria-label="Search bookmarks"
                  className="w-full h-11 pl-11 pr-10 bg-inset rounded-full text-[13.5px] text-ink placeholder-ink-3 focus:outline-none focus:ring-2 focus:ring-clay/40"
                />
                {searchValue && (
                  <button
                    onClick={clearSearch}
                    className="absolute right-3 inset-y-0 my-auto h-6 w-6 flex items-center justify-center hover:bg-hairline rounded-full transition-colors"
                  >
                    <X className="w-4 h-4 text-ink-3" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Spacer to maintain layout on mobile */}
          <div className="flex-1 md:hidden" />

          {/* Right section - Actions (only show when authenticated) */}
          {authStatus?.authenticated && (
            <div className="flex items-center gap-1.5 sm:gap-3 flex-shrink-0">
              {/* Mobile search — collapses to an icon (expands the row below) */}
              <button
                onClick={() => setMobileSearchOpen((v) => !v)}
                aria-label="Search"
                className="md:hidden w-9 h-9 flex items-center justify-center rounded-full text-ink-2 hover:bg-inset transition-colors"
              >
                <Search className="w-[18px] h-[18px]" />
              </button>
              {/* Triage pill */}
              <button
                onClick={openTriage}
                className="inline-flex items-center gap-1.5 bg-clay-grad text-white shadow-glow rounded-full font-semibold text-[13.5px] h-9 px-3 sm:px-3.5 whitespace-nowrap"
                title="Triage your unread"
              >
                <Zap className="w-[15px] h-[15px]" fill="currentColor" />
                <span className="hidden sm:inline">Triage</span>
                <span className="bg-white/[0.28] rounded-md px-1.5 py-px text-xs leading-none">
                  {stats.unread}
                </span>
                {streak > 0 && (
                  <span className="hidden sm:inline-flex items-center gap-1 ml-1 pl-2.5 border-l border-white/30">
                    <Flame className="w-3.5 h-3.5 text-flame" fill="currentColor" />
                    <span className="text-xs leading-none">{streak}</span>
                  </span>
                )}
              </button>

              {/* Theme toggle + Sync are secondary actions — they live in the
                  avatar menu (all viewports), not the main nav bar. Adding by
                  URL is paste-first now (PasteToPreview) — no Add button. */}

              {/* User Menu */}
              <div className="relative">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="w-[33px] h-[33px] rounded-full overflow-hidden hover:ring-2 hover:ring-clay/40 transition-all flex items-center justify-center"
                >
                  {profileImage ? (
                    <img
                      src={profileImage}
                      alt={authStatus?.user?.username || 'User'}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-clay-grad flex items-center justify-center text-white text-sm font-semibold">
                      {userInitial}
                    </div>
                  )}
                </button>

                {showUserMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
                    <div className="absolute right-0 top-full mt-2 w-64 bg-surface rounded-card shadow-m-lg border border-hairline py-2 z-50">
                      {/* User info at top. Email-only accounts have no @handle
                          from X, so lead with the email instead; accounts
                          with both show the handle plus a small email line. */}
                      {authStatus?.authenticated && authStatus.user && (
                        <div className="px-4 py-3 border-b border-hairline">
                          <div className="flex items-center gap-3 min-w-0">
                            {profileImage ? (
                              <img
                                src={profileImage}
                                alt={authStatus.user.username}
                                className="w-10 h-10 rounded-full flex-shrink-0"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-clay-grad flex items-center justify-center text-white font-semibold flex-shrink-0">
                                {userInitial}
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="font-semibold text-ink font-mono truncate">
                                {identities?.x
                                  ? `@${identities.x.username}`
                                  : identities?.email?.email || `@${authStatus.user.username}`}
                              </p>
                              <p className="text-xs text-ink-3">
                                {identities?.x ? 'Connected' : 'Signed in with email'}
                              </p>
                              {identities?.x && identities?.email && (
                                <p className="text-[11px] text-ink-3 truncate">
                                  {identities.email.email}
                                </p>
                              )}
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
                            <b className="font-bold text-clay">{stats.unread}</b> unread
                          </span>
                        </div>
                      </div>

                      {/* Nav + Settings links */}
                      <div className="py-1">
                        <Link
                          href="/"
                          onClick={() => setShowUserMenu(false)}
                          className={cn(
                            'flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-inset transition-colors',
                            pathname === '/'
                              ? 'font-semibold text-clay'
                              : 'text-ink-2 hover:text-ink',
                          )}
                        >
                          <Bookmark className="w-4 h-4" />
                          Collection
                        </Link>
                        <button
                          type="button"
                          onClick={() => {
                            setShowUserMenu(false)
                            openLive()
                          }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-inset text-ink-2 hover:text-ink transition-colors"
                        >
                          <Radio className="w-4 h-4" />
                          Live
                        </button>
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

        {/* Mobile Search Row — collapses to a header icon; expands on tap. */}
        {authStatus?.authenticated && mobileSearchOpen && (
          <div className="md:hidden px-4 pb-3">
            <div className="relative flex items-center">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-3 pointer-events-none" />
              <input
                type="text"
                autoFocus
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                placeholder="Search your collection…"
                aria-label="Search bookmarks"
                className="w-full h-10 pl-9 pr-9 bg-inset rounded-full text-base sm:text-sm text-ink placeholder-ink-3 focus:outline-none focus:ring-2 focus:ring-clay/40"
              />
              <button
                onClick={() => {
                  clearSearch()
                  setMobileSearchOpen(false)
                }}
                aria-label="Close search"
                className="absolute right-2 inset-y-0 my-auto h-6 w-6 flex items-center justify-center hover:bg-hairline rounded-full transition-colors"
              >
                <X className="w-4 h-4 text-ink-3" />
              </button>
            </div>
          </div>
        )}
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
