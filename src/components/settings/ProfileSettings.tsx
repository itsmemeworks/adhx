'use client'

import { useState, useEffect } from 'react'
import { User, Globe, Eye, EyeOff, Trophy, BarChart3, Link2, RefreshCw, ExternalLink } from 'lucide-react'

interface ProfileData {
  userId: string
  username: string
  profileImageUrl?: string
  displayName: string
  bio: string
  isPublic: boolean
  showStats: boolean
  showAchievements: boolean
  featuredCollectionId: string | null
}

interface Collection {
  id: string
  name: string
  description: string | null
  color: string | null
  icon: string | null
  isPublic: boolean
}

export function ProfileSettings() {
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [collections, setCollections] = useState<Collection[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Form state
  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [isPublic, setIsPublic] = useState(false)
  const [showStats, setShowStats] = useState(true)
  const [showAchievements, setShowAchievements] = useState(true)
  const [featuredCollectionId, setFeaturedCollectionId] = useState<string | null>(null)

  useEffect(() => {
    fetchProfile()
    fetchCollections()
  }, [])

  async function fetchProfile() {
    try {
      const response = await fetch('/api/profile')
      if (!response.ok) throw new Error('Failed to fetch profile')
      const data = await response.json()
      setProfile(data)
      setDisplayName(data.displayName || '')
      setBio(data.bio || '')
      setIsPublic(data.isPublic)
      setShowStats(data.showStats)
      setShowAchievements(data.showAchievements)
      setFeaturedCollectionId(data.featuredCollectionId)
    } catch (error) {
      console.error('Failed to fetch profile:', error)
    } finally {
      setLoading(false)
    }
  }

  async function fetchCollections() {
    try {
      const response = await fetch('/api/collections')
      if (!response.ok) throw new Error('Failed to fetch collections')
      const data = await response.json()
      setCollections(data.collections || [])
    } catch (error) {
      console.error('Failed to fetch collections:', error)
    }
  }

  async function handleSave() {
    setSaving(true)
    setMessage(null)

    try {
      const response = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName,
          bio,
          isPublic,
          showStats,
          showAchievements,
          featuredCollectionId,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to save profile')
      }

      setMessage({ type: 'success', text: 'Profile saved!' })
      // Update local profile state
      setProfile((prev) => prev ? { ...prev, isPublic, displayName, bio, showStats, showAchievements, featuredCollectionId } : null)
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to save profile' })
    } finally {
      setSaving(false)
    }
  }

  // Check if form has changes
  const hasChanges = profile && (
    displayName !== (profile.displayName || '') ||
    bio !== (profile.bio || '') ||
    isPublic !== profile.isPublic ||
    showStats !== profile.showStats ||
    showAchievements !== profile.showAchievements ||
    featuredCollectionId !== profile.featuredCollectionId
  )

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-12 bg-gray-200 dark:bg-gray-800 rounded-xl" />
        <div className="h-24 bg-gray-200 dark:bg-gray-800 rounded-xl" />
        <div className="h-12 bg-gray-200 dark:bg-gray-800 rounded-xl" />
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        <p>Failed to load profile settings</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Public Profile Toggle */}
      <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
            <Globe className="h-5 w-5 text-green-500" />
          </div>
          <div>
            <p className="font-medium text-gray-900 dark:text-white">Public Profile</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Allow others to view your profile at{' '}
              <span className="font-mono text-xs">/u/{profile.username}</span>
            </p>
          </div>
        </div>
        <button
          onClick={() => setIsPublic(!isPublic)}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 ${
            isPublic ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
          }`}
          role="switch"
          aria-checked={isPublic}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
              isPublic ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {/* Profile Preview Link */}
      {isPublic && (
        <a
          href={`/u/${profile.username}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-xl hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
        >
          <ExternalLink className="h-4 w-4" />
          <span className="font-medium">View your public profile</span>
        </a>
      )}

      {/* Display Name */}
      <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
        <div className="flex items-center gap-2 mb-3">
          <User className="h-4 w-4 text-gray-500" />
          <label className="font-medium text-gray-900 dark:text-white">Display Name</label>
        </div>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder={profile.username}
          className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
          Leave blank to use your X username
        </p>
      </div>

      {/* Bio */}
      <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-gray-500" />
            <label className="font-medium text-gray-900 dark:text-white">Bio</label>
          </div>
          <span className={`text-xs ${bio.length > 160 ? 'text-red-500' : 'text-gray-500 dark:text-gray-400'}`}>
            {bio.length}/160
          </span>
        </div>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="Tell others a bit about yourself..."
          maxLength={160}
          rows={3}
          className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
        />
      </div>

      {/* Privacy Settings */}
      <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl space-y-4">
        <div className="flex items-center gap-2 mb-2">
          {isPublic ? <Eye className="h-4 w-4 text-gray-500" /> : <EyeOff className="h-4 w-4 text-gray-500" />}
          <span className="font-medium text-gray-900 dark:text-white">Privacy Settings</span>
        </div>

        {/* Show Stats */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BarChart3 className="h-4 w-4 text-gray-500" />
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">Show Stats</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Display bookmarks saved, read count, etc.
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowStats(!showStats)}
            disabled={!isPublic}
            className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${
              showStats ? 'bg-purple-500' : 'bg-gray-300 dark:bg-gray-600'
            }`}
            role="switch"
            aria-checked={showStats}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                showStats ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Show Achievements */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Trophy className="h-4 w-4 text-gray-500" />
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">Show Achievements</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Display your unlocked achievements
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowAchievements(!showAchievements)}
            disabled={!isPublic}
            className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${
              showAchievements ? 'bg-purple-500' : 'bg-gray-300 dark:bg-gray-600'
            }`}
            role="switch"
            aria-checked={showAchievements}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                showAchievements ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {!isPublic && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
            Enable public profile to configure privacy settings
          </p>
        )}
      </div>

      {/* Featured Collection */}
      {collections.length > 0 && (
        <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
          <div className="flex items-center gap-2 mb-3">
            <Link2 className="h-4 w-4 text-gray-500" />
            <label className="font-medium text-gray-900 dark:text-white">Featured Collection</label>
          </div>
          <select
            value={featuredCollectionId || ''}
            onChange={(e) => setFeaturedCollectionId(e.target.value || null)}
            disabled={!isPublic}
            className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option value="">None</option>
            {collections.filter(c => c.isPublic).map((collection) => (
              <option key={collection.id} value={collection.id}>
                {collection.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Only public collections can be featured
          </p>
        </div>
      )}

      {/* Save Button */}
      <div className="flex items-center justify-between">
        {message && (
          <p className={`text-sm ${message.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
            {message.text}
          </p>
        )}
        <div className="flex-1" />
        <button
          onClick={handleSave}
          disabled={!hasChanges || saving}
          className="px-6 py-2.5 bg-purple-500 text-white rounded-xl font-medium hover:bg-purple-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {saving ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            'Save Changes'
          )}
        </button>
      </div>
    </div>
  )
}
