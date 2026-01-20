'use client'

import { useEffect, useState, Suspense, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import {
  CheckCircle,
  XCircle,
  LogOut,
  RefreshCw,
  AlertCircle,
  History,
  ChevronDown,
  ChevronUp,
  Tag,
  Trash2,
  AlertTriangle,
  Eraser,
  UserX,
  BookOpen,
  Type,
  Trophy,
  User,
} from 'lucide-react'

// X (formerly Twitter) logo component
function XLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}
import { SyncProgress } from '@/components/sync/SyncProgress'
import { ADHX_PURPLE } from '@/lib/gestalt/theme'
import { usePreferences, FONT_OPTIONS, type BodyFont } from '@/lib/preferences-context'
import { KeyboardShortcutsModal } from '@/components/KeyboardShortcutsModal'
import { GamificationDashboard } from '@/components/gamification'
import { ProfileSettings } from '@/components/settings/ProfileSettings'

interface AuthStatus {
  authenticated: boolean
  user?: {
    id: string
    username: string
    profileImageUrl?: string | null
  }
  tokenExpired?: boolean
}

interface Stats {
  total: number
  unread: number
  manual: number
}

interface CooldownStatus {
  canSync: boolean
  cooldownRemaining: number
  lastSyncAt: string | null
  fetchedAt: number // timestamp when cooldown was fetched
}

interface SyncLog {
  id: string
  startedAt: string
  completedAt: string | null
  status: string
  totalFetched: number
  newBookmarks: number
  duplicatesSkipped: number
  categorized: number
  errorMessage: string | null
  triggerType: string | null
}

export default function SettingsPageWrapper() {
  return (
    <Suspense fallback={<SettingsLoadingSkeleton />}>
      <SettingsPage />
    </Suspense>
  )
}

function SettingsLoadingSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-8">
          <div className="h-8 bg-gray-200 dark:bg-gray-800 rounded-full w-1/4 mb-3 animate-pulse" />
          <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded-full w-1/2 animate-pulse" />
        </div>
        <div className="grid gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white dark:bg-gray-900 rounded-2xl p-6 animate-pulse">
              <div className="h-6 bg-gray-200 dark:bg-gray-800 rounded w-1/3 mb-4" />
              <div className="h-20 bg-gray-200 dark:bg-gray-800 rounded-xl" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function SettingsPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [showSyncModal, setShowSyncModal] = useState(false)
  const [stats, setStats] = useState<Stats>({ total: 0, unread: 0, manual: 0 })
  const [cooldown, setCooldown] = useState<CooldownStatus>({ canSync: true, cooldownRemaining: 0, lastSyncAt: null, fetchedAt: Date.now() })
  const [displayedCooldown, setDisplayedCooldown] = useState(0)

  // Sync log state
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([])
  const [syncLogsLoading, setSyncLogsLoading] = useState(true)
  const [showAllLogs, setShowAllLogs] = useState(false)
  const [latestLog, setLatestLog] = useState<SyncLog | null>(null)

  // Tag management state
  const [tags, setTags] = useState<Array<{ tag: string; count: number }>>([])
  const [tagsLoading, setTagsLoading] = useState(true)
  const [deletingTag, setDeletingTag] = useState<string | null>(null)
  const [tagToDelete, setTagToDelete] = useState<string | null>(null)

  // Danger zone state
  const [showClearDataModal, setShowClearDataModal] = useState(false)
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false)
  const [dangerActionLoading, setDangerActionLoading] = useState(false)
  const [confirmText, setConfirmText] = useState('')

  // Keyboard shortcuts modal
  const [showShortcutsModal, setShowShortcutsModal] = useState(false)

  // Reading preferences
  const { preferences, updatePreference } = usePreferences()

  // Clear data modal ref
  const clearDataInputRef = useRef<HTMLInputElement>(null)

  // Auto-focus clear data input when modal opens
  useEffect(() => {
    if (showClearDataModal) {
      // Small delay to ensure modal is rendered
      setTimeout(() => clearDataInputRef.current?.focus(), 50)
    }
  }, [showClearDataModal])

  // Global keyboard shortcuts for settings page
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return
      }

      // Don't trigger if any modal is open
      if (showClearDataModal || showDeleteAccountModal || showSyncModal || showShortcutsModal) {
        return
      }

      switch (e.key) {
        case 'g':
          e.preventDefault()
          router.push('/')
          break
        case '?':
          e.preventDefault()
          setShowShortcutsModal(true)
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [router, showClearDataModal, showDeleteAccountModal, showSyncModal, showShortcutsModal])

  useEffect(() => {
    const success = searchParams.get('success')
    const error = searchParams.get('error')
    if (success) setMessage({ type: 'success', text: success })
    else if (error) setMessage({ type: 'error', text: error })
  }, [searchParams])

  useEffect(() => {
    fetchAuthStatus()
  }, [])

  useEffect(() => {
    if (authStatus?.authenticated) {
      fetchSyncLogs()
      fetchTags()
      fetchStats()
      fetchCooldown()

      // Update cooldown timer every 30 seconds for more accurate countdown
      const cooldownInterval = setInterval(fetchCooldown, 30000)
      return () => clearInterval(cooldownInterval)
    }
  }, [authStatus?.authenticated])

  async function fetchStats() {
    try {
      const response = await fetch('/api/stats')
      const data = await response.json()
      setStats({ total: data.total || 0, unread: data.unread || 0, manual: data.manual || 0 })
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

  // Format remaining cooldown time
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

  async function fetchTags() {
    setTagsLoading(true)
    try {
      const response = await fetch('/api/tags')
      const data = await response.json()
      setTags(data.tags || [])
    } catch (error) {
      console.error('Failed to fetch tags:', error)
    } finally {
      setTagsLoading(false)
    }
  }

  async function confirmDeleteTag() {
    if (!tagToDelete) return

    const tag = tagToDelete
    setTagToDelete(null)
    setDeletingTag(tag)

    try {
      const response = await fetch('/api/tags', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag }),
      })
      if (response.ok) {
        setTags((prev) => prev.filter((t) => t.tag !== tag))
        setMessage({ type: 'success', text: `Tag "${tag}" deleted from all bookmarks` })
      } else {
        throw new Error('Failed to delete tag')
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to delete tag' })
    } finally {
      setDeletingTag(null)
    }
  }

  async function fetchSyncLogs() {
    setSyncLogsLoading(true)
    try {
      const [logsRes, latestRes] = await Promise.all([
        fetch('/api/sync/logs?page=1&limit=10'),
        fetch('/api/sync/logs?latest=true'),
      ])
      const logsData = await logsRes.json()
      const latestData = await latestRes.json()
      setSyncLogs(logsData.logs || [])
      setLatestLog(latestData.log)
    } catch (error) {
      console.error('Failed to fetch sync logs:', error)
    } finally {
      setSyncLogsLoading(false)
    }
  }

  function handleSyncComplete() {
    setShowSyncModal(false)
    fetchSyncLogs()
    fetchStats()
    fetchCooldown()
    setMessage({ type: 'success', text: 'Bookmarks synced successfully!' })
    // Notify Header to refresh stats and cooldown
    window.dispatchEvent(new CustomEvent('stats-updated'))
    window.dispatchEvent(new CustomEvent('sync-complete'))
  }

  async function fetchAuthStatus() {
    try {
      const response = await fetch('/api/auth/twitter/status')
      const data = await response.json()
      setAuthStatus(data)
    } catch (error) {
      console.error('Failed to fetch auth status:', error)
      setAuthStatus({ authenticated: false })
    } finally {
      setLoading(false)
    }
  }

  async function handleConnect() {
    window.location.href = '/api/auth/twitter'
  }

  async function handleDisconnect() {
    setActionLoading(true)
    try {
      await fetch('/api/auth/twitter', { method: 'DELETE' })
      // Redirect to landing page after disconnect
      window.location.href = '/'
    } catch {
      setMessage({ type: 'error', text: 'Failed to disconnect' })
      setActionLoading(false)
    }
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  function formatDuration(startedAt: string, completedAt: string | null) {
    if (!completedAt) return '-'
    const durationMs = new Date(completedAt).getTime() - new Date(startedAt).getTime()
    const seconds = Math.floor(durationMs / 1000)
    if (seconds < 60) return `${seconds}s`
    return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  }

  function getTimeSince(dateStr: string) {
    const diffMs = Date.now() - new Date(dateStr).getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)
    if (diffDays > 0) return `${diffDays}d ago`
    if (diffHours > 0) return `${diffHours}h ago`
    if (diffMins > 0) return `${diffMins}m ago`
    return 'Just now'
  }

  async function handleClearData() {
    setDangerActionLoading(true)
    try {
      const response = await fetch('/api/account/clear', { method: 'POST' })
      if (response.ok) {
        setMessage({ type: 'success', text: 'All data cleared. Your Twitter connection is preserved.' })
        setShowClearDataModal(false)
        setConfirmText('')
        // Refresh local data
        setSyncLogs([])
        setLatestLog(null)
        setTags([])
        // Notify Header to refresh stats
        window.dispatchEvent(new CustomEvent('stats-updated'))
      } else {
        throw new Error('Failed to clear data')
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to clear data. Please try again.' })
    } finally {
      setDangerActionLoading(false)
    }
  }

  async function handleDeleteAccount() {
    setDangerActionLoading(true)
    try {
      const response = await fetch('/api/account', { method: 'DELETE' })
      if (response.ok) {
        // Redirect to home page after account deletion
        window.location.href = '/?deleted=true'
      } else {
        throw new Error('Failed to delete account')
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to delete account. Please try again.' })
      setDangerActionLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Settings</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Manage your X connection and sync preferences
          </p>
        </div>

        {/* Message Toast */}
        {message && (
          <div
            className={`mb-6 p-4 rounded-2xl flex items-center gap-3 ${
              message.type === 'success'
                ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
            }`}
          >
            {message.type === 'success' ? (
              <CheckCircle className="h-5 w-5 flex-shrink-0" />
            ) : (
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
            )}
            <span className="font-medium">{message.text}</span>
            <button
              onClick={() => setMessage(null)}
              className="ml-auto p-1 hover:bg-black/10 dark:hover:bg-white/10 rounded-full"
            >
              <XCircle className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="space-y-6">
          {/* X Connection Card */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm">
            {loading ? (
              <div className="flex items-center gap-3 text-gray-500">
                <RefreshCw className="h-5 w-5 animate-spin" />
                <span>Checking connection...</span>
              </div>
            ) : authStatus?.authenticated ? (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      {authStatus.user?.profileImageUrl ? (
                        <img
                          src={authStatus.user.profileImageUrl}
                          alt={authStatus.user.username}
                          className="w-12 h-12 rounded-full flex-shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-gray-600 to-gray-800 flex items-center justify-center text-white font-semibold flex-shrink-0">
                          {authStatus.user?.username[0].toUpperCase()}
                        </div>
                      )}
                      {/* X badge */}
                      <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-black dark:bg-white flex items-center justify-center ring-2 ring-white dark:ring-gray-900">
                        <XLogo className="h-3 w-3 text-white dark:text-black" />
                      </div>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">@{authStatus.user?.username}</p>
                      <p className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1">
                        <CheckCircle className="h-3 w-3" /> Connected
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleDisconnect}
                    disabled={actionLoading}
                    className="w-full sm:w-auto px-4 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full font-medium transition-colors text-center"
                  >
                    <LogOut className="h-4 w-4 inline mr-2" />
                    Disconnect
                  </button>
                </div>
                {/* Stats display */}
                <div className="grid grid-cols-4 gap-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total - stats.manual}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Synced</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{stats.manual}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Manual</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.total - stats.unread}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Read</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.unread}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Unread</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-black/10 dark:bg-white/10 flex items-center justify-center">
                    <XLogo className="h-6 w-6 text-black dark:text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">X Connection</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Connect to sync your bookmarks</p>
                  </div>
                </div>
                <button
                  onClick={handleConnect}
                  className="w-full py-3 bg-black dark:bg-white text-white dark:text-black rounded-full font-semibold hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
                >
                  <XLogo className="h-5 w-5" />
                  Connect X
                </button>
              </div>
            )}
          </div>

          {/* Sync Bookmarks Card */}
          {authStatus?.authenticated && (
            <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: `${ADHX_PURPLE}15` }}>
                  <RefreshCw className="h-5 w-5" style={{ color: ADHX_PURPLE }} />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Sync Bookmarks</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Pull bookmarks from X</p>
                </div>
              </div>

              <div className="mb-4">
                <button
                  onClick={() => cooldown.canSync && setShowSyncModal(true)}
                  disabled={!cooldown.canSync}
                  className={`w-full py-3 rounded-full font-semibold transition-colors flex items-center justify-center gap-2 ${
                    cooldown.canSync
                      ? 'text-white hover:opacity-90'
                      : 'text-white/60 cursor-not-allowed'
                  }`}
                  style={{ backgroundColor: cooldown.canSync ? ADHX_PURPLE : `${ADHX_PURPLE}80` }}
                >
                  <RefreshCw className="h-4 w-4" />
                  {cooldown.canSync ? 'Sync Bookmarks' : `Available in ${formatCooldown(displayedCooldown)}`}
                </button>
              </div>

              {!cooldown.canSync && (
                <p className="text-xs text-amber-600 dark:text-amber-400 text-center mb-3">
                  To protect your X account, syncing is limited to once every 15 minutes.
                </p>
              )}

              <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                Each sync pulls up to 50 of your most recent X bookmarks
              </p>
            </div>
          )}

          {/* Sync History Card */}
          {authStatus?.authenticated && (
            <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                    <History className="h-5 w-5 text-blue-500" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Sync History</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Recent sync operations</p>
                  </div>
                </div>
                {latestLog && (
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{getTimeSince(latestLog.startedAt)}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Last sync</p>
                  </div>
                )}
              </div>

              {syncLogsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-12 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
                  ))}
                </div>
              ) : syncLogs.length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  <History className="h-10 w-10 mx-auto mb-2 opacity-50" />
                  <p>No sync history yet</p>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    {(showAllLogs ? syncLogs : syncLogs.slice(0, 5)).map((log) => (
                      <div
                        key={log.id}
                        className="flex items-start sm:items-center justify-between gap-2 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl"
                      >
                        <div className="flex items-start sm:items-center gap-2 sm:gap-3 min-w-0">
                          {log.status === 'completed' ? (
                            <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5 sm:mt-0" />
                          ) : log.status === 'failed' ? (
                            <XCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5 sm:mt-0" />
                          ) : (
                            <RefreshCw className="h-4 w-4 text-blue-500 animate-spin flex-shrink-0 mt-0.5 sm:mt-0" />
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                              {formatDate(log.startedAt)}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {log.triggerType === 'scheduled' ? 'Auto' : 'Manual'} · {formatDuration(log.startedAt, log.completedAt)}
                            </p>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          {log.newBookmarks > 0 ? (
                            <span className="text-sm font-medium text-green-600 dark:text-green-400">+{log.newBookmarks}</span>
                          ) : (
                            <span className="text-sm text-gray-500 dark:text-gray-400">0 new</span>
                          )}
                          {log.duplicatesSkipped > 0 && (
                            <p className="text-xs text-gray-400">{log.duplicatesSkipped} skipped</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  {syncLogs.length > 5 && (
                    <button
                      onClick={() => setShowAllLogs(!showAllLogs)}
                      className="w-full mt-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white flex items-center justify-center gap-1"
                    >
                      {showAllLogs ? (
                        <>Show Less <ChevronUp className="h-4 w-4" /></>
                      ) : (
                        <>Show More <ChevronDown className="h-4 w-4" /></>
                      )}
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {/* Tag Management Card */}
          {authStatus?.authenticated && (
            <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                  <Tag className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Tag Management</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {tags.length} tag{tags.length !== 1 ? 's' : ''} total
                  </p>
                </div>
              </div>

              {tagsLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-10 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
                  ))}
                </div>
              ) : tags.length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  <Tag className="h-10 w-10 mx-auto mb-2 opacity-50" />
                  <p>No tags created yet</p>
                  <p className="text-xs mt-1">Add tags to bookmarks in focus mode</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {tags.map(({ tag, count }) => (
                    <div
                      key={tag}
                      className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl group"
                    >
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded text-sm font-medium">
                          {tag}
                        </span>
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          {count} bookmark{count !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <button
                        onClick={() => setTagToDelete(tag)}
                        disabled={deletingTag === tag}
                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50"
                        title="Delete tag from all bookmarks"
                      >
                        {deletingTag === tag ? (
                          <RefreshCw className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Reading Preferences Card */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center">
                <BookOpen className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Reading Preferences</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">Customize your reading experience</p>
              </div>
            </div>

            {/* Bionic Reading Toggle */}
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-gray-900 dark:text-white">Bionic Reading</p>
                  <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 text-xs font-medium rounded-full">
                    ADHD Mode
                  </span>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  <strong className="font-bold">Bo</strong>lds the <strong className="font-bold">fi</strong>rst <strong className="font-bold">pa</strong>rt of <strong className="font-bold">ea</strong>ch <strong className="font-bold">wo</strong>rd to <strong className="font-bold">gui</strong>de your <strong className="font-bold">ey</strong>es
                </p>
              </div>
              <button
                onClick={() => updatePreference('bionicReading', !preferences.bionicReading)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 ${
                  preferences.bionicReading ? 'bg-purple-500' : 'bg-gray-300 dark:bg-gray-600'
                }`}
                role="switch"
                aria-checked={preferences.bionicReading}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    preferences.bionicReading ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Font Selection */}
            <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
              <div className="flex items-center gap-2 mb-3">
                <Type className="w-4 h-4 text-gray-500" />
                <p className="font-medium text-gray-900 dark:text-white">Body Font</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {(Object.entries(FONT_OPTIONS) as [BodyFont, { name: string; description: string }][]).map(([key, { name, description }]) => {
                  const fontVar = `var(--font-${key})`
                  return (
                    <button
                      key={key}
                      onClick={() => updatePreference('bodyFont', key)}
                      className={`p-3 rounded-lg text-left transition-all ${
                        preferences.bodyFont === key
                          ? 'bg-purple-100 dark:bg-purple-900/30 border-2 border-purple-500'
                          : 'bg-white dark:bg-gray-800 border-2 border-transparent hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                    >
                      <p
                        className="font-medium text-gray-900 dark:text-white"
                        style={{ fontFamily: fontVar }}
                      >
                        {name}
                      </p>
                      <p
                        className="text-xs text-gray-500 dark:text-gray-400 mt-0.5"
                        style={{ fontFamily: fontVar }}
                      >
                        {description}
                      </p>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Gamification Dashboard */}
          {authStatus?.authenticated && (
            <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                  <Trophy className="h-5 w-5 text-amber-500" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Your Progress</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Level up by reading bookmarks</p>
                </div>
              </div>

              <GamificationDashboard />
            </div>
          )}

          {/* Public Profile Settings */}
          {authStatus?.authenticated && (
            <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <User className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Public Profile</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Share your achievements with others</p>
                </div>
              </div>

              <ProfileSettings />
            </div>
          )}

          {/* Danger Zone */}
          {authStatus?.authenticated && (
            <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm border-2 border-red-200 dark:border-red-900/50">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-red-600 dark:text-red-400">Danger Zone</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Irreversible actions</p>
                </div>
              </div>

              <div className="space-y-4">
                {/* Clear Data */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
                  <div className="flex items-start sm:items-center gap-3">
                    <Eraser className="h-5 w-5 text-gray-500 flex-shrink-0 mt-0.5 sm:mt-0" />
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">Clear All Data</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Delete all bookmarks, tags, and sync history. Keeps X connected.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowClearDataModal(true)}
                    className="w-full sm:w-auto px-4 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg font-medium transition-colors text-center"
                  >
                    Clear Data
                  </button>
                </div>

                {/* Delete Account */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
                  <div className="flex items-start sm:items-center gap-3">
                    <UserX className="h-5 w-5 text-gray-500 flex-shrink-0 mt-0.5 sm:mt-0" />
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">Delete Account</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Permanently delete everything including X connection.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowDeleteAccountModal(true)}
                    className="w-full sm:w-auto px-4 py-2 bg-red-500 text-white hover:bg-red-600 rounded-lg font-medium transition-colors text-center"
                  >
                    Delete Account
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Setup Instructions (when not connected) */}
          {!authStatus?.authenticated && !loading && (
            <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Setup Instructions</h2>
              <ol className="list-decimal list-inside space-y-3 text-sm text-gray-600 dark:text-gray-400">
                <li>
                  Go to{' '}
                  <a href="https://developer.x.com/en/portal/dashboard" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                    X Developer Portal
                  </a>
                </li>
                <li>Create a new Project and App</li>
                <li>Enable "OAuth 2.0" under User Authentication Settings</li>
                <li>
                  Set callback URL to:{' '}
                  <code className="bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded text-xs">
                    http://localhost:3000/api/auth/twitter/callback
                  </code>
                </li>
                <li>Copy Client ID and Client Secret</li>
                <li>
                  Add to <code className="bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded text-xs">.env.local</code>:
                  <pre className="mt-2 bg-gray-100 dark:bg-gray-800 p-3 rounded-xl text-xs overflow-x-auto">
{`TWITTER_CLIENT_ID=your_client_id
TWITTER_CLIENT_SECRET=your_client_secret`}
                  </pre>
                </li>
                <li>Restart the server and connect</li>
              </ol>
            </div>
          )}

          {/* Version Footer */}
          <div className="text-center pt-4">
            <p className="text-xs text-gray-400 dark:text-gray-500">
              ADHX v{process.env.NEXT_PUBLIC_APP_VERSION || '0.0.0'}
            </p>
          </div>
        </div>
      </div>

      {/* Sync Progress Modal */}
      <SyncProgress
        isOpen={showSyncModal}
        onClose={() => setShowSyncModal(false)}
        onComplete={handleSyncComplete}
      />

      {/* Delete Tag Confirmation Modal */}
      {tagToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setTagToDelete(null)}
          />
          <div className="relative bg-white dark:bg-gray-900 rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <Trash2 className="h-5 w-5 text-red-500" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Delete Tag</h3>
            </div>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Delete tag <span className="font-medium text-gray-900 dark:text-white">"{tagToDelete}"</span> from all bookmarks? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setTagToDelete(null)}
                className="flex-1 px-4 py-2.5 rounded-xl font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteTag}
                className="flex-1 px-4 py-2.5 rounded-xl font-medium text-white bg-red-500 hover:bg-red-600 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear Data Confirmation Modal */}
      {showClearDataModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => { setShowClearDataModal(false); setConfirmText('') }}
          />
          <div className="relative bg-white dark:bg-gray-900 rounded-2xl p-6 max-w-md w-full shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                <Eraser className="h-5 w-5 text-orange-500" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Clear All Data</h3>
            </div>
            <div className="space-y-4 mb-6">
              <p className="text-gray-600 dark:text-gray-400">
                This will permanently delete:
              </p>
              <ul className="list-disc list-inside text-sm text-gray-600 dark:text-gray-400 space-y-1 ml-2">
                <li>All synced bookmarks</li>
                <li>All tags and categories</li>
                <li>Read/unread status</li>
                <li>Sync history</li>
                <li>Collections and preferences</li>
              </ul>
              <p className="text-sm text-green-600 dark:text-green-400">
                ✓ Your X connection will be preserved
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Type <span className="font-mono bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">CLEAR</span> to confirm:
                </label>
                <input
                  ref={clearDataInputRef}
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="CLEAR"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setShowClearDataModal(false); setConfirmText('') }}
                disabled={dangerActionLoading}
                className="flex-1 px-4 py-2.5 rounded-xl font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleClearData}
                disabled={confirmText !== 'CLEAR' || dangerActionLoading}
                className="flex-1 px-4 py-2.5 rounded-xl font-medium text-white bg-orange-500 hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {dangerActionLoading ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Eraser className="h-4 w-4" />
                )}
                Clear Data
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Account Confirmation Modal */}
      {showDeleteAccountModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => { setShowDeleteAccountModal(false); setConfirmText('') }}
          />
          <div className="relative bg-white dark:bg-gray-900 rounded-2xl p-6 max-w-md w-full shadow-xl border-2 border-red-300 dark:border-red-800">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <UserX className="h-5 w-5 text-red-500" />
              </div>
              <h3 className="text-lg font-semibold text-red-600 dark:text-red-400">Delete Account</h3>
            </div>
            <div className="space-y-4 mb-6">
              <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800">
                <p className="text-sm text-red-700 dark:text-red-300 font-medium flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  This action is permanent and cannot be undone!
                </p>
              </div>
              <p className="text-gray-600 dark:text-gray-400">
                This will permanently delete:
              </p>
              <ul className="list-disc list-inside text-sm text-gray-600 dark:text-gray-400 space-y-1 ml-2">
                <li>All synced bookmarks and data</li>
                <li>Your X connection</li>
                <li>All account settings</li>
              </ul>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Type <span className="font-mono bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">DELETE</span> to confirm:
                </label>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="DELETE"
                  className="w-full px-4 py-2.5 rounded-xl border border-red-300 dark:border-red-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setShowDeleteAccountModal(false); setConfirmText('') }}
                disabled={dangerActionLoading}
                className="flex-1 px-4 py-2.5 rounded-xl font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={confirmText !== 'DELETE' || dangerActionLoading}
                className="flex-1 px-4 py-2.5 rounded-xl font-medium text-white bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {dangerActionLoading ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <UserX className="h-4 w-4" />
                )}
                Delete Account
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Keyboard Shortcuts Modal */}
      <KeyboardShortcutsModal
        isOpen={showShortcutsModal}
        onClose={() => setShowShortcutsModal(false)}
      />
    </div>
  )
}
