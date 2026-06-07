'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import {
  Search,
  Plus,
  Settings,
  Sun,
  Moon,
  X,
  RefreshCw,
  Zap,
  Flame,
  Bookmark,
  Compass,
} from 'lucide-react'
import { useTheme } from '@/lib/theme/context'
import { cn } from '@/lib/utils'
import { MatterLogo } from '@/components/matter'
import { AddTweetModal, AddTweetResult } from './AddTweetModal'
import { SyncProgress } from './sync/SyncProgress'
import { Tooltip } from './Tooltip'

interface AuthStatus {
  authenticated: boolean
  user?: {
    id: string
    username: string
    profileImageUrl?: string | null
  }
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
  const [showAddTweet, setShowAddTweet] = useState(false)
  const [addTweetResult, setAddTweetResult] = useState<AddTweetResult | null>(null)
  const [showSync, setShowSync] = useState(false)
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null)
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
    const handleOpenAddTweet = () => setShowAddTweet(true)
    const handleCloseAddTweet = () => setShowAddTweet(false)

    window.addEventListener('focus-search', handleFocusSearch)
    window.addEventListener('open-add-tweet', handleOpenAddTweet)
    window.addEventListener('close-add-tweet', handleCloseAddTweet)

    return () => {
      window.removeEventListener('stats-updated', handleStatsUpdate)
      window.removeEventListener('sync-complete', handleSyncComplete)
      window.removeEventListener('focus-search', handleFocusSearch)
      window.removeEventListener('open-add-tweet', handleOpenAddTweet)
      window.removeEventListener('close-add-tweet', handleCloseAddTweet)
    }
  }, [authStatus?.authenticated])

  // Separate effect for sync shortcut to track cooldown state
  useEffect(() => {
    const handleOpenSync = () => {
      if (cooldown.canSync) {
        setShowSync(true)
      }
    }
    window.addEventListener('open-sync', handleOpenSync)
    return () => window.removeEventListener('open-sync', handleOpenSync)
  }, [cooldown.canSync])

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

  // Update search from URL params
  useEffect(() => {
    setSearchValue(searchParams.get('search') || '')
  }, [searchParams])

  // Handle ?added= URL params from URL prefix feature
  useEffect(() => {
    const addedState = searchParams.get('added') as 'success' | 'duplicate' | 'error' | null
    if (!addedState) return

    // Tweet previews pass ?tweetId=&author=&text=; Instagram/TikTok previews
    // pass ?platform=&id= (no author/text). Accept either id param.
    const bookmarkId = searchParams.get('tweetId') || searchParams.get('id')

    const result: AddTweetResult = {
      state: addedState,
      platform:
        searchParams.get('platform') || (searchParams.get('tweetId') ? 'twitter' : undefined),
      bookmark: bookmarkId
        ? {
            id: bookmarkId,
            author: searchParams.get('author') || '',
            text: searchParams.get('text') || '',
          }
        : undefined,
      error: searchParams.get('error') || undefined,
    }

    setAddTweetResult(result)
    setShowAddTweet(true)

    // Clear the URL params
    const params = new URLSearchParams(window.location.search)
    params.delete('added')
    params.delete('tweetId')
    params.delete('id')
    params.delete('platform')
    params.delete('author')
    params.delete('text')
    params.delete('error')
    const queryString = params.toString()
    router.replace(queryString ? `/?${queryString}` : '/', { scroll: false })
  }, [searchParams, router])

  // Real-time search with debounce
  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      const currentSearch = searchParams.get('search') || ''
      const newSearch = searchValue.trim()

      // Only update if different from current URL
      if (newSearch !== currentSearch) {
        const params = new URLSearchParams(window.location.search)
        if (newSearch) {
          params.set('search', newSearch)
        } else {
          params.delete('search')
        }
        const queryString = params.toString()
        router.push(queryString ? `/?${queryString}` : '/', { scroll: false })
      }
    }, 300) // 300ms debounce

    return () => clearTimeout(debounceTimer)
  }, [searchValue, searchParams, router])

  async function fetchAuthStatus() {
    try {
      const response = await fetch('/api/auth/twitter/status')
      const data = await response.json()
      setAuthStatus(data)
    } catch (error) {
      console.error('Failed to fetch auth status:', error)
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
      window.dispatchEvent(new CustomEvent('open-triage'))
    } else {
      router.push('/?triage=1')
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

            {/* Primary nav — switch between the collection feed and Discover.
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
                <Link
                  href="/trending"
                  className={cn(
                    'rounded-full px-3 py-1.5 font-semibold transition-colors',
                    pathname.startsWith('/trending')
                      ? 'bg-clay/[0.12] text-clay'
                      : 'text-ink-2 hover:text-ink',
                  )}
                >
                  Trending
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

          {/* GitHub link - show when not authenticated */}
          {authStatus !== null && !authStatus.authenticated && (
            <a
              href="https://github.com/itsmemeworks/adhx"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 text-ink-3 hover:text-ink transition-colors"
              title="View on GitHub"
            >
              <svg
                className="w-5 h-5"
                viewBox="0 0 98 96"
                fill="currentColor"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z"
                />
              </svg>
            </a>
          )}

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

              {/* Theme toggle — hidden on phones (lives in the user menu there) */}
              <button
                onClick={toggleTheme}
                className="hidden sm:flex items-center justify-center p-2 rounded-full hover:bg-inset transition-colors text-ink-3 hover:text-ink"
                title={resolvedTheme === 'dark' ? 'Switch to light' : 'Switch to dark'}
                aria-label="Toggle theme"
              >
                {resolvedTheme === 'dark' ? (
                  <Sun className="w-[18px] h-[18px]" />
                ) : (
                  <Moon className="w-[18px] h-[18px]" />
                )}
              </button>

              {/* Sync Button — hidden on phones (lives in the user menu there) */}
              <div className="hidden sm:flex items-center">
                <Tooltip
                  content={
                    cooldown.canSync
                      ? 'Sync bookmarks'
                      : `Available in ${formatCooldown(displayedCooldown)}`
                  }
                  placement="left"
                >
                  <button
                    onClick={() => cooldown.canSync && setShowSync(true)}
                    className={cn(
                      'inline-flex items-center justify-center p-2 rounded-full transition-colors',
                      cooldown.canSync
                        ? 'hover:bg-inset text-ink-3 hover:text-ink'
                        : 'text-ink-3/50 cursor-not-allowed',
                    )}
                  >
                    <RefreshCw className="w-[18px] h-[18px]" />
                  </button>
                </Tooltip>
              </div>

              {/* Add Button */}
              <button
                onClick={() => setShowAddTweet(true)}
                className="w-[33px] h-[33px] flex items-center justify-center rounded-card bg-clay-grad text-white shadow-glow transition-transform hover:scale-105"
                title="Add link"
                aria-label="Add link"
              >
                <Plus className="w-[18px] h-[18px]" />
              </button>

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
                      {/* User info at top */}
                      {authStatus?.authenticated && authStatus.user && (
                        <div className="px-4 py-3 border-b border-hairline">
                          <div className="flex items-center gap-3">
                            {profileImage ? (
                              <img
                                src={profileImage}
                                alt={authStatus.user.username}
                                className="w-10 h-10 rounded-full"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-clay-grad flex items-center justify-center text-white font-semibold">
                                {userInitial}
                              </div>
                            )}
                            <div>
                              <p className="font-semibold text-ink font-mono">
                                @{authStatus.user.username}
                              </p>
                              <p className="text-xs text-ink-3">Connected</p>
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
                        <Link
                          href="/trending"
                          onClick={() => setShowUserMenu(false)}
                          className={cn(
                            'flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-inset transition-colors',
                            pathname.startsWith('/trending')
                              ? 'font-semibold text-clay'
                              : 'text-ink-2 hover:text-ink',
                          )}
                        >
                          <Compass className="w-4 h-4" />
                          Trending
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

                      {/* Theme + Sync — phones only; on larger screens these sit
                          in the top bar, so showing them here too would duplicate. */}
                      <div className="sm:hidden border-t border-hairline py-1">
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
                              ? 'hover:bg-inset text-ink-2 hover:text-ink'
                              : 'text-ink-3/50 cursor-not-allowed',
                          )}
                        >
                          <RefreshCw className="w-4 h-4" />
                          {cooldown.canSync
                            ? 'Sync bookmarks'
                            : `Sync in ${formatCooldown(displayedCooldown)}`}
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

      {/* Add Tweet Modal */}
      <AddTweetModal
        isOpen={showAddTweet}
        onClose={() => {
          setShowAddTweet(false)
          setAddTweetResult(null)
        }}
        onSuccess={() => {
          fetchStats()
          window.dispatchEvent(new CustomEvent('tweet-added'))
        }}
        onOpenTweet={(tweetId) => {
          // Navigate to home page with open param to trigger lightbox
          router.push(`/?open=${tweetId}`)
        }}
        initialResult={addTweetResult}
      />

      {/* Sync Progress Modal */}
      <SyncProgress
        isOpen={showSync}
        onClose={() => setShowSync(false)}
        onComplete={handleSyncComplete}
      />
    </>
  )
}
