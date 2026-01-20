'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Search,
  Users,
  Flame,
  Trophy,
  Clock,
  ArrowLeft,
  RefreshCw,
  ChevronDown,
} from 'lucide-react'

interface DiscoverProfile {
  userId: string
  username: string
  displayName: string
  profileImageUrl: string | null
  bio: string | null
  level: number
  currentStreak: number
  followers: number
}

type SortOption = 'recent' | 'followers' | 'level' | 'streak'

const SORT_OPTIONS: { value: SortOption; label: string; icon: React.ReactNode }[] = [
  { value: 'recent', label: 'Recently Joined', icon: <Clock className="w-4 h-4" /> },
  { value: 'followers', label: 'Most Followed', icon: <Users className="w-4 h-4" /> },
  { value: 'level', label: 'Highest Level', icon: <Trophy className="w-4 h-4" /> },
  { value: 'streak', label: 'Longest Streak', icon: <Flame className="w-4 h-4" /> },
]

export default function DiscoverPage() {
  const [profiles, setProfiles] = useState<DiscoverProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortOption>('recent')
  const [showSortDropdown, setShowSortDropdown] = useState(false)
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  useEffect(() => {
    fetchProfiles(true)
  }, [sort])

  useEffect(() => {
    const debounce = setTimeout(() => {
      fetchProfiles(true)
    }, 300)
    return () => clearTimeout(debounce)
  }, [search])

  async function fetchProfiles(reset = false) {
    if (reset) {
      setLoading(true)
    } else {
      setLoadingMore(true)
    }

    try {
      const offset = reset ? 0 : profiles.length
      const params = new URLSearchParams({
        sort,
        limit: '20',
        offset: offset.toString(),
      })
      if (search) {
        params.set('search', search)
      }

      const response = await fetch(`/api/discover?${params}`)
      if (!response.ok) throw new Error('Failed to fetch profiles')

      const data = await response.json()

      if (reset) {
        setProfiles(data.profiles)
      } else {
        setProfiles((prev) => [...prev, ...data.profiles])
      }
      setTotal(data.total)
      setHasMore(data.hasMore)
    } catch (error) {
      console.error('Failed to fetch profiles:', error)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  const currentSortOption = SORT_OPTIONS.find((o) => o.value === sort)

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Back link */}
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-900 dark:hover:text-white mb-6 text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Feed
        </Link>

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-3">
            <Users className="w-8 h-8 text-purple-500" />
            Discover
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Find and follow other ADHX users
          </p>
        </div>

        {/* Search and Sort */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by username..."
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          {/* Sort dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowSortDropdown(!showSortDropdown)}
              className="flex items-center gap-2 px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors min-w-[180px] justify-between"
            >
              <span className="flex items-center gap-2">
                {currentSortOption?.icon}
                {currentSortOption?.label}
              </span>
              <ChevronDown className={`w-4 h-4 transition-transform ${showSortDropdown ? 'rotate-180' : ''}`} />
            </button>

            {showSortDropdown && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowSortDropdown(false)}
                />
                <div className="absolute right-0 mt-2 w-full bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden z-20">
                  {SORT_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => {
                        setSort(option.value)
                        setShowSortDropdown(false)
                      }}
                      className={`w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${
                        sort === option.value
                          ? 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20'
                          : 'text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {option.icon}
                      {option.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Results count */}
        {!loading && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            {total} public profile{total !== 1 ? 's' : ''} found
          </p>
        )}

        {/* Loading state */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="bg-white dark:bg-gray-900 rounded-2xl p-4 animate-pulse">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 bg-gray-200 dark:bg-gray-800 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <div className="h-5 bg-gray-200 dark:bg-gray-800 rounded w-1/3" />
                    <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-1/4" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : profiles.length === 0 ? (
          <div className="text-center py-16">
            <Users className="w-16 h-16 text-gray-300 dark:text-gray-700 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              No profiles found
            </h2>
            <p className="text-gray-500 dark:text-gray-400">
              {search ? 'Try a different search term' : 'Be the first to make your profile public!'}
            </p>
          </div>
        ) : (
          <>
            {/* Profile list */}
            <div className="space-y-4">
              {profiles.map((profile) => (
                <Link
                  key={profile.userId}
                  href={`/u/${profile.username}`}
                  className="block bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all hover:scale-[1.01] group"
                >
                  <div className="flex items-start gap-4">
                    {/* Avatar */}
                    {profile.profileImageUrl ? (
                      <img
                        src={profile.profileImageUrl}
                        alt={profile.displayName}
                        className="w-16 h-16 rounded-full flex-shrink-0"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center text-white text-2xl font-bold flex-shrink-0">
                        {profile.displayName[0]?.toUpperCase()}
                      </div>
                    )}

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900 dark:text-white group-hover:text-purple-500 transition-colors truncate">
                          {profile.displayName}
                        </h3>
                        <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 text-xs font-medium rounded-full">
                          Lv. {profile.level}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        @{profile.username}
                      </p>
                      {profile.bio && (
                        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300 line-clamp-2">
                          {profile.bio}
                        </p>
                      )}

                      {/* Stats */}
                      <div className="mt-2 flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {profile.followers} followers
                        </span>
                        {profile.currentStreak > 0 && (
                          <span className="flex items-center gap-1">
                            <Flame className="w-3 h-3 text-orange-500" />
                            {profile.currentStreak} day streak
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {/* Load more */}
            {hasMore && (
              <div className="text-center mt-8">
                <button
                  onClick={() => fetchProfiles(false)}
                  disabled={loadingMore}
                  className="px-6 py-3 bg-purple-500 text-white rounded-full font-medium hover:bg-purple-600 transition-colors disabled:opacity-50 flex items-center gap-2 mx-auto"
                >
                  {loadingMore ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    'Load More'
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
