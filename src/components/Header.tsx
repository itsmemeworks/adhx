'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Search,
  Plus,
  Settings,
  Sun,
  Moon,
  Menu,
  X,
  RefreshCw,
} from 'lucide-react'
import { useTheme } from '@/lib/theme/context'
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
  const { theme, setTheme } = useTheme()
  const [searchValue, setSearchValue] = useState(searchParams.get('search') || '')
  const [showAddTweet, setShowAddTweet] = useState(false)
  const [addTweetResult, setAddTweetResult] = useState<AddTweetResult | null>(null)
  const [showSync, setShowSync] = useState(false)
  const [showMobileMenu, setShowMobileMenu] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null)
  const [stats, setStats] = useState<Stats>({ total: 0, unread: 0 })
  const [cooldown, setCooldown] = useState<CooldownStatus>({ canSync: true, cooldownRemaining: 0, lastSyncAt: null, fetchedAt: Date.now() })
  const [displayedCooldown, setDisplayedCooldown] = useState(0)

  // Ref for keyboard shortcut focus
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // Only fetch auth status on mount - stats/cooldown are fetched after auth is confirmed
    fetchAuthStatus()

    // Listen for stats updates from other components (only fires when authenticated)
    const handleStatsUpdate = () => {
      if (authStatus?.authenticated) fetchStats()
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

    // Build the result from URL params
    const result: AddTweetResult = {
      state: addedState,
      bookmark: searchParams.get('tweetId') ? {
        id: searchParams.get('tweetId')!,
        author: searchParams.get('author') || 'unknown',
        text: searchParams.get('text') || '',
      } : undefined,
      error: searchParams.get('error') || undefined,
    }

    setAddTweetResult(result)
    setShowAddTweet(true)

    // Clear the URL params
    const params = new URLSearchParams(window.location.search)
    params.delete('added')
    params.delete('tweetId')
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

  return (
    <>
      <header className="sticky top-0 z-50 bg-white dark:bg-gray-950 shadow-sm">
        <div className="px-4 h-16 flex items-center justify-between gap-3">
          {/* Left section - Logo and Stats */}
          <div className="flex items-center gap-4 flex-shrink-0">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2">
              <img
                src="/logo.png"
                alt="ADHX Logo"
                className="w-10 h-10 object-contain"
              />
              <span className="text-xl sm:text-2xl font-indie-flower text-gray-900 dark:text-white">ADHX</span>
            </Link>

            {/* Stats - only show when authenticated, hidden on mobile */}
            {authStatus?.authenticated && (
              <div className="hidden lg:flex items-center gap-3 text-sm">
                <span className="text-gray-500 dark:text-gray-400">
                  <span className="font-semibold text-gray-900 dark:text-white">{stats.total}</span> saved
                </span>
                <span className="text-gray-300 dark:text-gray-600">•</span>
                <span className="text-gray-500 dark:text-gray-400">
                  <span className="font-semibold text-blue-500">{stats.unread}</span> unread
                </span>
              </div>
            )}
          </div>

          {/* Center section - Search (desktop only, only show when authenticated) */}
          {authStatus?.authenticated && (
            <div className="hidden md:block flex-1 max-w-xl mx-4">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  placeholder="Search"
                  aria-label="Search bookmarks"
                  className="w-full h-11 pl-11 pr-10 bg-gray-100 dark:bg-gray-800 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600 text-gray-900 dark:text-white placeholder-gray-500"
                />
                {searchValue && (
                  <button
                    onClick={clearSearch}
                    className="absolute right-3 inset-y-0 my-auto h-6 w-6 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors"
                  >
                    <X className="w-4 h-4 text-gray-500" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Spacer to maintain layout on mobile */}
          <div className="flex-1 md:hidden" />

          {/* Right section - Actions (only show when authenticated) */}
          {authStatus?.authenticated && (
            <div className="flex items-center gap-1 flex-shrink-0">
              {/* Sync Button */}
              <Tooltip content={cooldown.canSync ? 'Sync bookmarks' : `Available in ${formatCooldown(displayedCooldown)}`} placement="left">
                <button
                  onClick={() => cooldown.canSync && setShowSync(true)}
                  className={`p-2.5 rounded-full transition-colors ${
                    cooldown.canSync
                      ? 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
                      : 'text-gray-400 dark:text-gray-600 cursor-not-allowed'
                  }`}
                >
                  <RefreshCw className="w-5 h-5" />
                </button>
              </Tooltip>

              {/* Add Button */}
              <button
                onClick={() => setShowAddTweet(true)}
                className="p-2.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors text-gray-700 dark:text-gray-300"
                title="Add tweet"
              >
                <Plus className="w-5 h-5" />
              </button>

              {/* User Menu */}
              <div className="relative ml-1">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="w-9 h-9 rounded-full overflow-hidden hover:ring-2 hover:ring-gray-300 dark:hover:ring-gray-600 transition-all flex items-center justify-center"
                >
                  {profileImage ? (
                    <img
                      src={profileImage}
                      alt={authStatus?.user?.username || 'User'}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-gray-400 to-gray-600 flex items-center justify-center text-white text-sm font-semibold">
                      {userInitial}
                    </div>
                  )}
                </button>

                {showUserMenu && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setShowUserMenu(false)}
                    />
                    <div className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 py-2 z-50">
                      {/* User info at top */}
                      {authStatus?.authenticated && authStatus.user && (
                        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                          <div className="flex items-center gap-3">
                            {profileImage ? (
                              <img
                                src={profileImage}
                                alt={authStatus.user.username}
                                className="w-10 h-10 rounded-full"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-400 to-gray-600 flex items-center justify-center text-white font-semibold">
                                {userInitial}
                              </div>
                            )}
                            <div>
                              <p className="font-semibold text-gray-900 dark:text-white">@{authStatus.user.username}</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">Connected</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Mobile stats - shown when header stats are hidden */}
                      <div className="lg:hidden px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                        <div className="flex items-center gap-4 text-sm">
                          <span className="text-gray-500 dark:text-gray-400">
                            <span className="font-semibold text-gray-900 dark:text-white">{stats.total}</span> saved
                          </span>
                          <span className="text-gray-500 dark:text-gray-400">
                            <span className="font-semibold text-blue-500">{stats.unread}</span> unread
                          </span>
                        </div>
                      </div>

                      {/* Settings link */}
                      <div className="py-1">
                        <Link
                          href="/settings"
                          onClick={() => setShowUserMenu(false)}
                          className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
                        >
                          <Settings className="w-4 h-4" />
                          Settings
                        </Link>
                      </div>

                      <div className="border-t border-gray-100 dark:border-gray-800 my-1" />

                      {/* Theme toggle */}
                      <div className="px-4 py-3">
                        <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
                          <button
                            onClick={() => setTheme('light')}
                            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                              theme === 'light'
                                ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-white'
                                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                            }`}
                          >
                            <Sun className="w-4 h-4" />
                            Light
                          </button>
                          <button
                            onClick={() => setTheme('dark')}
                            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                              theme === 'dark'
                                ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-white'
                                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                            }`}
                          >
                            <Moon className="w-4 h-4" />
                            Dark
                          </button>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Mobile Menu Toggle */}
              <button
                onClick={() => setShowMobileMenu(!showMobileMenu)}
                className="p-2.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors md:hidden text-gray-700 dark:text-gray-300"
              >
                {showMobileMenu ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          )}
        </div>

        {/* Mobile Search Row (only show when authenticated) */}
        {authStatus?.authenticated && (
          <div className="md:hidden px-4 pb-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                placeholder="Search"
                aria-label="Search bookmarks"
                className="w-full h-10 pl-9 pr-9 bg-gray-100 dark:bg-gray-800 rounded-full text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600 text-gray-900 dark:text-white placeholder-gray-500"
              />
              {searchValue && (
                <button
                  onClick={clearSearch}
                  className="absolute right-2 inset-y-0 my-auto h-6 w-6 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors"
                >
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Mobile Navigation */}
        {showMobileMenu && (
          <div className="md:hidden border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 py-2">
            <Link
              href="/settings"
              onClick={() => setShowMobileMenu(false)}
              className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
            >
              <Settings className="w-5 h-5" />
              Settings
            </Link>
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
