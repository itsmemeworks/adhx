'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  Flame,
  Calendar,
  BookOpen,
  Bookmark,
  Trophy,
  ArrowLeft,
  Lock,
  FolderOpen,
  ExternalLink,
  UserPlus,
  UserMinus,
  RefreshCw,
} from 'lucide-react'
import * as LucideIcons from 'lucide-react'
import { getLevelTitle } from '@/lib/gamification/xp'

interface PublicProfile {
  userId: string
  username: string
  profileImageUrl: string | null
  displayName: string
  bio: string
  stats?: {
    level: number
    totalXp: number
    currentStreak: number
    longestStreak: number
    lifetimeRead: number
    lifetimeBookmarked: number
    totalBookmarks: number
    readBookmarks: number
  }
  achievements?: {
    unlocked: Array<{
      id: string
      name: string
      description: string
      icon: string
      category: string
    }>
    unlockedCount: number
    totalAchievements: number
  }
  publicCollections: Array<{
    id: string
    name: string
    description: string | null
    color: string | null
    icon: string | null
  }>
}

// Get icon component from lucide-react by name
function getIcon(iconName: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const IconComponent = (LucideIcons as any)[iconName]
  return IconComponent || LucideIcons.Award
}

export default function PublicProfilePage() {
  const params = useParams()
  const username = params.username as string

  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Follow state
  const [isFollowing, setIsFollowing] = useState(false)
  const [followers, setFollowers] = useState(0)
  const [following, setFollowing] = useState(0)
  const [followLoading, setFollowLoading] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isOwnProfile, setIsOwnProfile] = useState(false)

  // Fetch follow status when profile loads
  useEffect(() => {
    async function checkFollowStatus() {
      if (!profile?.userId) return

      try {
        // Check auth status
        const authResponse = await fetch('/api/auth/twitter/status')
        const authData = await authResponse.json()
        setIsAuthenticated(authData.authenticated)
        setIsOwnProfile(authData.user?.id === profile.userId)

        // Get follow status (only if authenticated)
        if (authData.authenticated) {
          const followResponse = await fetch(`/api/follow?userId=${profile.userId}`)
          if (followResponse.ok) {
            const followData = await followResponse.json()
            setIsFollowing(followData.isFollowing)
            setFollowers(followData.followers)
            setFollowing(followData.following)
          }
        } else {
          // Get public follow counts
          const followResponse = await fetch(`/api/follow?userId=${profile.userId}`)
          if (followResponse.ok) {
            const followData = await followResponse.json()
            setFollowers(followData.followers)
            setFollowing(followData.following)
          }
        }
      } catch (error) {
        console.error('Failed to check follow status:', error)
      }
    }

    checkFollowStatus()
  }, [profile?.userId])

  async function handleFollow() {
    if (!profile?.userId || followLoading) return

    setFollowLoading(true)
    try {
      const response = await fetch('/api/follow', {
        method: isFollowing ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: profile.userId }),
      })

      if (response.ok) {
        const data = await response.json()
        setIsFollowing(!isFollowing)
        setFollowers(data.followers)
      }
    } catch (error) {
      console.error('Failed to follow/unfollow:', error)
    } finally {
      setFollowLoading(false)
    }
  }

  useEffect(() => {
    async function fetchProfile() {
      try {
        const response = await fetch(`/api/profile/${username}`)
        if (response.status === 404) {
          setError('User not found')
          return
        }
        if (response.status === 403) {
          setError('This profile is private')
          return
        }
        if (!response.ok) {
          throw new Error('Failed to fetch profile')
        }
        const data = await response.json()
        setProfile(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong')
      } finally {
        setLoading(false)
      }
    }

    fetchProfile()
  }, [username])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="animate-pulse space-y-4 w-full max-w-md">
          <div className="flex items-center gap-4">
            <div className="w-24 h-24 bg-gray-200 dark:bg-gray-800 rounded-full" />
            <div className="flex-1 space-y-2">
              <div className="h-6 bg-gray-200 dark:bg-gray-800 rounded w-3/4" />
              <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-1/2" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="text-center p-8">
          {error === 'This profile is private' ? (
            <>
              <Lock className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Private Profile</h1>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                @{username} hasn't made their profile public yet.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Profile Not Found</h1>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                We couldn't find a user with that username.
              </p>
            </>
          )}
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-full hover:bg-purple-600 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>
        </div>
      </div>
    )
  }

  if (!profile) return null

  const levelTitle = profile.stats ? getLevelTitle(profile.stats.level) : null

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Back link */}
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-900 dark:hover:text-white mb-6 text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </Link>

        {/* Profile Header */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm mb-6">
          <div className="flex items-start gap-4">
            {profile.profileImageUrl ? (
              <img
                src={profile.profileImageUrl}
                alt={profile.displayName}
                className="w-24 h-24 rounded-full"
              />
            ) : (
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center text-white text-3xl font-bold">
                {profile.displayName[0]?.toUpperCase()}
              </div>
            )}

            <div className="flex-1">
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                    {profile.displayName}
                  </h1>
                  <p className="text-gray-500 dark:text-gray-400">@{profile.username}</p>
                </div>

                {/* Follow button */}
                {isAuthenticated && !isOwnProfile && (
                  <button
                    onClick={handleFollow}
                    disabled={followLoading}
                    className={`flex items-center gap-2 px-4 py-2 rounded-full font-medium transition-colors ${
                      isFollowing
                        ? 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400'
                        : 'bg-purple-500 text-white hover:bg-purple-600'
                    } disabled:opacity-50`}
                  >
                    {followLoading ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : isFollowing ? (
                      <>
                        <UserMinus className="w-4 h-4" />
                        Unfollow
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-4 h-4" />
                        Follow
                      </>
                    )}
                  </button>
                )}

                {isOwnProfile && (
                  <Link
                    href="/settings"
                    className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                  >
                    Edit Profile
                  </Link>
                )}
              </div>

              {profile.bio && (
                <p className="mt-2 text-gray-700 dark:text-gray-300">{profile.bio}</p>
              )}

              {/* Follower counts */}
              <div className="mt-3 flex items-center gap-4 text-sm">
                <span className="text-gray-600 dark:text-gray-400">
                  <strong className="text-gray-900 dark:text-white">{followers}</strong>{' '}
                  {followers === 1 ? 'follower' : 'followers'}
                </span>
                <span className="text-gray-600 dark:text-gray-400">
                  <strong className="text-gray-900 dark:text-white">{following}</strong>{' '}
                  following
                </span>
              </div>

              {/* Level badge */}
              {profile.stats && (
                <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 bg-purple-100 dark:bg-purple-900/30 rounded-full">
                  <span className="text-sm font-bold text-purple-600 dark:text-purple-400">
                    Level {profile.stats.level}
                  </span>
                  <span className="text-xs text-purple-500 dark:text-purple-400">
                    {levelTitle}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Stats */}
        {profile.stats && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm mb-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-500" />
              Stats
            </h2>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {/* Streak */}
              <div className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-xl text-center">
                <Flame className="w-6 h-6 text-orange-500 mx-auto mb-1" />
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {profile.stats.currentStreak}
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-400">Day Streak</p>
              </div>

              {/* Best Streak */}
              <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl text-center">
                <Calendar className="w-6 h-6 text-amber-500 mx-auto mb-1" />
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {profile.stats.longestStreak}
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-400">Best Streak</p>
              </div>

              {/* Read */}
              <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-xl text-center">
                <BookOpen className="w-6 h-6 text-green-500 mx-auto mb-1" />
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {profile.stats.lifetimeRead}
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-400">Read</p>
              </div>

              {/* Bookmarked */}
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl text-center">
                <Bookmark className="w-6 h-6 text-blue-500 mx-auto mb-1" />
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {profile.stats.lifetimeBookmarked}
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-400">Saved</p>
              </div>
            </div>

            {/* XP Progress */}
            <div className="mt-4 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-xl">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-purple-600 dark:text-purple-400 font-medium">
                  {profile.stats.totalXp.toLocaleString()} XP
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Achievements */}
        {profile.achievements && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-500" />
                Achievements
              </h2>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {profile.achievements.unlockedCount} / {profile.achievements.totalAchievements}
              </span>
            </div>

            {profile.achievements.unlocked.length === 0 ? (
              <p className="text-center text-gray-500 dark:text-gray-400 py-4">
                No achievements unlocked yet
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {profile.achievements.unlocked.map((achievement) => {
                  const Icon = getIcon(achievement.icon)
                  return (
                    <div
                      key={achievement.id}
                      className="p-3 bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20 rounded-xl border border-amber-200 dark:border-amber-800"
                      title={achievement.description}
                    >
                      <Icon className="w-6 h-6 text-amber-500 mx-auto mb-2" />
                      <p className="text-sm font-medium text-gray-900 dark:text-white text-center truncate">
                        {achievement.name}
                      </p>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Public Collections */}
        {profile.publicCollections.length > 0 && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <FolderOpen className="w-5 h-5 text-purple-500" />
              Public Collections
            </h2>

            <div className="space-y-3">
              {profile.publicCollections.map((collection) => (
                <Link
                  key={collection.id}
                  href={`/c/${collection.id}`}
                  className="block p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors group"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white group-hover:text-purple-500">
                        {collection.name}
                      </p>
                      {collection.description && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                          {collection.description}
                        </p>
                      )}
                    </div>
                    <ExternalLink className="w-4 h-4 text-gray-400 group-hover:text-purple-500" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* View on X link */}
        <div className="mt-6 text-center">
          <a
            href={`https://x.com/${profile.username}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white"
          >
            View @{profile.username} on X →
          </a>
        </div>
      </div>
    </div>
  )
}
