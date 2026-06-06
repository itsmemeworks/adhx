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
  AlertTriangle,
  Eraser,
  UserX,
  BookOpen,
  Type,
  Smartphone,
  Monitor,
  Moon,
  Sun,
  ExternalLink,
  Copy,
  Check,
} from 'lucide-react'
import { SyncProgress } from '@/components/sync/SyncProgress'
import { usePreferences, FONT_OPTIONS, type BodyFont } from '@/lib/preferences-context'
import { KeyboardShortcutsModal } from '@/components/KeyboardShortcutsModal'
import { getPlatformType, type PlatformType } from '@/lib/platform'
import { useTheme } from '@/lib/theme/context'
import { PlatformGlyph } from '@/components/matter'
import { cn } from '@/lib/utils'

const SHORTCUT_URL = 'https://www.icloud.com/shortcuts/0d187480099b4d34a745ec8750a4587b'
const BOOKMARKLET_CODE = `javascript:void(location.href=location.href.replace(/(?:x|twitter|instagram|tiktok|youtube)\\.com/,'adhx.com'))`

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

// X (formerly Twitter) logo component
function XLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

/* ── Matter card shell ─────────────────────────────────────────── */
function SCard({
  icon: IconCmp,
  title,
  sub,
  right,
  danger,
  children,
  bodyPadded = true,
}: {
  icon?: React.ComponentType<{ className?: string }>
  title?: string
  sub?: string
  right?: React.ReactNode
  danger?: boolean
  children?: React.ReactNode
  bodyPadded?: boolean
}) {
  return (
    <div
      className={cn(
        'bg-surface rounded-card border shadow-m-sm overflow-hidden',
        danger ? 'border-red-500/30' : 'border-hairline',
      )}
    >
      {(title || IconCmp || right) && (
        <div className={cn('flex items-center gap-3 px-5 pt-[18px]', children ? 'pb-0' : 'pb-[18px]')}>
          {IconCmp && (
            <div
              className={cn(
                'w-[38px] h-[38px] rounded-[11px] flex-none flex items-center justify-center',
                danger ? 'bg-red-500/10' : 'bg-clay/10',
              )}
            >
              <IconCmp className={cn('h-[19px] w-[19px]', danger ? 'text-red-600' : 'text-clay')} />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className={cn('font-serif font-semibold text-base', danger ? 'text-red-600' : 'text-ink')}>
              {title}
            </div>
            {sub && <div className="text-[13px] text-ink-3 mt-0.5">{sub}</div>}
          </div>
          {right}
        </div>
      )}
      {children && <div className={bodyPadded ? 'px-5 pt-4 pb-5' : ''}>{children}</div>}
    </div>
  )
}

export function SettingsClient() {
  return (
    <Suspense fallback={<SettingsLoadingSkeleton />}>
      <SettingsPage />
    </Suspense>
  )
}

function SettingsLoadingSkeleton() {
  return (
    <div className="min-h-screen bg-paper">
      <div className="max-w-[760px] mx-auto px-4 sm:px-8 py-8">
        <div className="mb-8">
          <div className="h-9 bg-inset rounded-full w-1/4 mb-3 animate-pulse" />
          <div className="h-4 bg-inset rounded-full w-1/2 animate-pulse" />
        </div>
        <div className="flex flex-col gap-5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-surface border border-hairline rounded-card p-6 animate-pulse">
              <div className="h-6 bg-inset rounded w-1/3 mb-4" />
              <div className="h-20 bg-inset rounded-card" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function ShortcutCard() {
  const [platform, setPlatform] = useState<PlatformType>('desktop')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setPlatform(getPlatformType())
  }, [])

  const handleCopy = () => {
    navigator.clipboard.writeText(BOOKMARKLET_CODE)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (platform === 'ios') {
    return (
      <SCard icon={Smartphone} title="iOS Shortcut" sub="Share posts without the X tax">
        <p className="text-[13.5px] text-ink-2 leading-relaxed mb-3">
          Share posts without forcing people to log in. Hit share on any post → get a clean preview with full media. No
          login walls, no &quot;sign up to see more&quot; nonsense.
        </p>
        <a
          href={SHORTCUT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-[18px] py-[11px] min-h-[44px] rounded-[11px] bg-clay-grad text-white shadow-glow font-semibold text-sm transition-all hover:opacity-90"
        >
          <ExternalLink className="w-4 h-4" />
          Get the Shortcut
        </a>
        <div className="mt-4">
          <p className="text-[12.5px] font-bold tracking-wide uppercase text-ink-3 mb-2">How it works</p>
          <ol className="list-decimal list-inside text-[13px] text-ink-3 space-y-1.5 ml-1">
            <li>See a post you want to share? Tap the share button</li>
            <li>Select &quot;ADHX Preview&quot; from your shortcuts</li>
            <li>Get a clean link with the full post + media. Send it anywhere!</li>
          </ol>
        </div>
      </SCard>
    )
  }

  return (
    <SCard icon={Monitor} title="Bookmarklet" sub="Save posts with one click">
      <p className="text-[13.5px] text-ink-2 leading-relaxed mb-[13px]">
        Drag this to your bookmarks bar, or copy it. Click it on any X, Instagram, TikTok or YouTube page to open it in
        ADHX.
      </p>
      <div className="px-[15px] py-[13px] bg-inset rounded-[11px] font-mono text-xs text-ink-2 leading-relaxed break-all select-all mb-[13px]">
        {BOOKMARKLET_CODE}
      </div>
      <button
        onClick={handleCopy}
        className="inline-flex items-center gap-2 px-[18px] py-[11px] min-h-[44px] rounded-[11px] bg-clay-grad text-white shadow-glow font-semibold text-sm transition-all hover:opacity-90"
      >
        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        {copied ? 'Copied!' : 'Copy bookmarklet'}
      </button>

      {platform === 'android' && (
        <div className="mt-4 px-[15px] py-3 bg-inset rounded-[11px]">
          <p className="text-[13px] text-ink-2">
            You can also install ADHX as a PWA from your browser menu for share sheet access.
          </p>
        </div>
      )}
    </SCard>
  )
}

function SettingsPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { theme, setTheme } = useTheme()
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

  const themeOptions: { value: 'light' | 'dark' | 'system'; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'system', label: 'System', icon: Monitor },
  ]

  const Stat = ({ n, l, c }: { n: number; l: string; c: string }) => (
    <div className="text-center flex-1">
      <p className={cn('font-bold text-[22px] sm:text-[26px]', c)}>{n}</p>
      <p className="text-[12.5px] text-ink-3 mt-0.5">{l}</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-paper">
      <div className="max-w-[760px] mx-auto px-4 sm:px-8 py-8 sm:py-10 flex flex-col gap-5">
        {/* Header */}
        <div>
          <h1 className="font-serif text-[30px] sm:text-[38px] font-semibold tracking-tight text-ink mb-1">Settings</h1>
          <p className="text-[15px] text-ink-2">Manage your connection, reading and sync preferences.</p>
        </div>

        {/* Message Toast */}
        {message && (
          <div
            className={cn(
              'p-4 rounded-card border flex items-center gap-3',
              message.type === 'success'
                ? 'bg-green-500/10 border-green-500/30 text-green-700'
                : 'bg-red-500/10 border-red-500/30 text-red-700',
            )}
          >
            {message.type === 'success' ? (
              <CheckCircle className="h-5 w-5 flex-shrink-0" />
            ) : (
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
            )}
            <span className="font-medium">{message.text}</span>
            <button
              onClick={() => setMessage(null)}
              className="ml-auto p-1 hover:bg-black/10 rounded-full"
            >
              <XCircle className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Connection Card */}
        <SCard>
          {loading ? (
            <div className="flex items-center gap-3 text-ink-3 px-5 py-[18px]">
              <RefreshCw className="h-5 w-5 animate-spin" />
              <span>Checking connection...</span>
            </div>
          ) : authStatus?.authenticated ? (
            <div className="px-5 py-[18px]">
              <div className="flex items-center gap-[13px] flex-wrap">
                <div className="relative">
                  {authStatus.user?.profileImageUrl ? (
                    <img
                      src={authStatus.user.profileImageUrl}
                      alt={authStatus.user.username}
                      className="w-[46px] h-[46px] rounded-full flex-shrink-0"
                    />
                  ) : (
                    <div className="w-[46px] h-[46px] rounded-full bg-inset flex items-center justify-center text-ink font-semibold flex-shrink-0">
                      {authStatus.user?.username[0].toUpperCase()}
                    </div>
                  )}
                  {/* X badge */}
                  <div className="absolute -bottom-[3px] -right-[3px] w-5 h-5 rounded-full bg-black flex items-center justify-center ring-2 ring-surface">
                    <PlatformGlyph platform="twitter" size={10} className="text-white" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-mono font-bold text-base text-ink">@{authStatus.user?.username}</p>
                  <p className="text-[13px] font-semibold text-green-700 flex items-center gap-1.5 mt-0.5">
                    <CheckCircle className="h-3.5 w-3.5" /> Connected
                  </p>
                </div>
                <button
                  onClick={handleDisconnect}
                  disabled={actionLoading}
                  className="inline-flex items-center gap-2 px-3.5 py-2 min-h-[44px] rounded-[10px] text-red-600 font-semibold text-sm hover:bg-red-500/10 transition-colors"
                >
                  <LogOut className="h-[15px] w-[15px]" />
                  Disconnect
                </button>
              </div>
              {/* Stats display */}
              <div className="flex mt-[18px] pt-[18px] border-t border-hairline">
                <Stat n={stats.total - stats.manual} l="Synced" c="text-ink" />
                <Stat n={stats.manual} l="Manual" c="text-clay-2" />
                <Stat n={stats.total - stats.unread} l="Read" c="text-green-700" />
                <Stat n={stats.unread} l="Unread" c="text-clay" />
              </div>
              {/* Also save from */}
              <div className="flex items-center gap-2 mt-4 text-[13px] text-ink-3 flex-wrap">
                <span className="font-semibold text-ink-2 font-mono">Also save from</span>
                {(['instagram', 'tiktok', 'youtube'] as const).map((p) => (
                  <span
                    key={p}
                    className="w-[26px] h-[26px] rounded-lg bg-inset inline-flex items-center justify-center text-ink-2"
                  >
                    <PlatformGlyph platform={p} size={14} />
                  </span>
                ))}
                <span>by pasting a link — no extra account.</span>
              </div>
            </div>
          ) : (
            <div className="px-5 py-[18px] space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-[46px] h-[46px] rounded-full bg-inset flex items-center justify-center">
                  <XLogo className="h-6 w-6 text-ink" />
                </div>
                <div>
                  <h2 className="font-serif text-base font-semibold text-ink">X Connection</h2>
                  <p className="text-[13px] text-ink-3">Connect to sync your bookmarks</p>
                </div>
              </div>
              <button
                onClick={handleConnect}
                className="w-full py-3.5 min-h-[44px] bg-clay-grad text-white shadow-glow rounded-[12px] font-semibold hover:opacity-90 transition-all flex items-center justify-center gap-2"
              >
                <XLogo className="h-5 w-5" />
                Connect X
              </button>
            </div>
          )}
        </SCard>

        {/* Appearance Card */}
        <SCard
          icon={theme === 'dark' ? Moon : Sun}
          title="Appearance"
          sub="Light, or warm dark mode"
          right={
            <div className="inline-flex gap-[3px] p-[3px] bg-inset rounded-[10px]">
              {themeOptions.map(({ value, label, icon: OptIcon }) => {
                const active = theme === value
                return (
                  <button
                    key={value}
                    onClick={() => setTheme(value)}
                    aria-pressed={active}
                    title={label}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-lg text-[13px] font-semibold transition-all',
                      active ? 'bg-surface text-clay shadow-m-sm' : 'text-ink-3 hover:text-ink-2',
                    )}
                  >
                    <OptIcon className="h-4 w-4" />
                    <span className="hidden sm:inline">{label}</span>
                  </button>
                )
              })}
            </div>
          }
        />

        {/* Sync Bookmarks Card */}
        {authStatus?.authenticated && (
          <SCard icon={RefreshCw} title="Sync Bookmarks" sub="Pull your most recent bookmarks from X">
            <button
              onClick={() => cooldown.canSync && setShowSyncModal(true)}
              disabled={!cooldown.canSync}
              className={cn(
                'w-full flex items-center justify-center gap-2.5 py-[15px] min-h-[44px] rounded-[12px] font-bold text-[15.5px] transition-all',
                cooldown.canSync
                  ? 'bg-clay-grad text-white shadow-glow hover:opacity-90'
                  : 'bg-clay-grad text-white/70 opacity-60 cursor-not-allowed',
              )}
            >
              <RefreshCw className="h-[18px] w-[18px]" />
              {cooldown.canSync ? 'Sync Bookmarks' : `Available in ${formatCooldown(displayedCooldown)}`}
            </button>

            {!cooldown.canSync && (
              <p className="text-xs text-clay text-center mt-3">
                To protect your X account, syncing is limited to once every 15 minutes.
              </p>
            )}

            <p className="text-[13px] text-ink-3 text-center mt-3">
              Each sync pulls up to 50 of your most recent X bookmarks.
            </p>
          </SCard>
        )}

        {/* Sync History Card */}
        {authStatus?.authenticated && (
          <SCard
            icon={History}
            title="Sync History"
            sub="Recent sync operations"
            right={
              latestLog ? (
                <div className="text-right">
                  <div className="font-mono font-bold text-[13.5px] text-ink">{getTimeSince(latestLog.startedAt)}</div>
                  <div className="text-xs text-ink-3">Last sync</div>
                </div>
              ) : undefined
            }
          >
            {syncLogsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-12 bg-inset rounded-[11px] animate-pulse" />
                ))}
              </div>
            ) : syncLogs.length === 0 ? (
              <div className="text-center py-8 text-ink-3">
                <History className="h-10 w-10 mx-auto mb-2 opacity-50" />
                <p>No sync history yet</p>
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-2">
                  {(showAllLogs ? syncLogs : syncLogs.slice(0, 5)).map((log) => (
                    <div
                      key={log.id}
                      className="flex items-start sm:items-center gap-3 px-[14px] py-3 bg-inset rounded-[11px]"
                    >
                      {log.status === 'completed' ? (
                        <CheckCircle className="h-[17px] w-[17px] text-green-700 flex-shrink-0 mt-0.5 sm:mt-0" />
                      ) : log.status === 'failed' ? (
                        <XCircle className="h-[17px] w-[17px] text-red-600 flex-shrink-0 mt-0.5 sm:mt-0" />
                      ) : (
                        <RefreshCw className="h-[17px] w-[17px] text-clay animate-spin flex-shrink-0 mt-0.5 sm:mt-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-mono font-bold text-[13.5px] text-ink truncate">
                          {formatDate(log.startedAt)}
                        </div>
                        <div className="text-xs text-ink-3">
                          {log.triggerType === 'scheduled' ? 'Auto' : 'Manual'} · {formatDuration(log.startedAt, log.completedAt)}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        {log.newBookmarks > 0 ? (
                          <div className="font-mono font-bold text-[13.5px] text-green-700">+{log.newBookmarks}</div>
                        ) : (
                          <div className="font-mono text-[13.5px] text-ink-3">0 new</div>
                        )}
                        {log.duplicatesSkipped > 0 && (
                          <div className="text-xs text-ink-3">{log.duplicatesSkipped} skipped</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {syncLogs.length > 5 && (
                  <button
                    onClick={() => setShowAllLogs(!showAllLogs)}
                    className="w-full mt-3 py-2 text-sm font-medium text-ink-3 hover:text-ink flex items-center justify-center gap-1"
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
          </SCard>
        )}

        {/* Reading Preferences Card */}
        <SCard icon={BookOpen} title="Reading Preferences" sub="Customize your reading experience">
          {/* Bionic Reading Toggle */}
          <div className="flex items-center gap-[13px] px-[15px] py-[14px] bg-inset rounded-[12px] mb-[14px]">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="font-bold text-[14.5px] text-ink">Bionic Reading</span>
                <span className="text-[10.5px] font-bold tracking-[0.05em] uppercase text-clay bg-clay/[0.14] px-[7px] py-0.5 rounded-full">
                  ADHD mode
                </span>
              </div>
              <p className="text-[12.5px] text-ink-3">
                <strong className="font-bold text-ink-2">Bo</strong>lds the{' '}
                <strong className="font-bold text-ink-2">fi</strong>rst{' '}
                <strong className="font-bold text-ink-2">pa</strong>rt of{' '}
                <strong className="font-bold text-ink-2">ea</strong>ch{' '}
                <strong className="font-bold text-ink-2">wo</strong>rd to{' '}
                <strong className="font-bold text-ink-2">gui</strong>de your{' '}
                <strong className="font-bold text-ink-2">ey</strong>es.
              </p>
            </div>
            <button
              onClick={() => updatePreference('bionicReading', !preferences.bionicReading)}
              className={cn(
                'relative inline-flex h-6 w-[42px] flex-shrink-0 cursor-pointer rounded-full p-[3px] transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2',
                preferences.bionicReading ? 'bg-clay-grad justify-end' : 'bg-surface border border-hairline justify-start',
              )}
              role="switch"
              aria-checked={preferences.bionicReading}
            >
              <span className="pointer-events-none inline-block h-[18px] w-[18px] rounded-full bg-white shadow" />
            </button>
          </div>

          {/* Font Selection */}
          <div className="flex items-center gap-1.5 text-[12.5px] font-bold tracking-[0.04em] uppercase text-ink-3 mb-2.5">
            <Type className="w-3.5 h-3.5" />
            Body Font
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {(Object.entries(FONT_OPTIONS) as [BodyFont, { name: string; description: string }][]).map(([key, { name, description }]) => {
              const fontVar = `var(--font-${key})`
              const selected = preferences.bodyFont === key
              return (
                <button
                  key={key}
                  onClick={() => updatePreference('bodyFont', key)}
                  className={cn(
                    'px-[15px] py-[13px] min-h-[44px] rounded-[12px] text-left border-[1.5px] transition-all',
                    selected ? 'border-clay bg-clay/[0.07]' : 'border-hairline bg-surface hover:border-ink-3',
                  )}
                >
                  <p className="font-bold text-[14.5px] text-ink" style={{ fontFamily: fontVar }}>
                    {name}
                  </p>
                  <p className="text-xs text-ink-3 mt-0.5" style={{ fontFamily: fontVar }}>
                    {description}
                  </p>
                </button>
              )
            })}
          </div>
        </SCard>

        {/* Bookmarklet / Quick Save Tools Card */}
        <ShortcutCard />

        {/* Danger Zone */}
        {authStatus?.authenticated && (
          <SCard icon={AlertTriangle} title="Danger Zone" sub="Irreversible actions" danger>
            {/* Clear Data */}
            <div className="flex items-center gap-[13px] px-[15px] py-[13px] bg-inset rounded-[11px]">
              <div className="flex-1 min-w-0">
                <div className="font-bold text-[14.5px] text-ink flex items-center gap-2">
                  <Eraser className="h-[15px] w-[15px] text-ink-3 flex-shrink-0" />
                  Clear all data
                </div>
                <div className="text-[12.5px] text-ink-3 mt-0.5">
                  Delete all bookmarks and sync history. Keeps X connected.
                </div>
              </div>
              <button
                onClick={() => setShowClearDataModal(true)}
                className="px-[15px] py-[9px] min-h-[44px] rounded-[10px] border border-red-500/40 text-red-600 font-semibold text-[13.5px] whitespace-nowrap hover:bg-red-500/10 transition-colors"
              >
                Clear data
              </button>
            </div>

            {/* Delete Account */}
            <div className="flex items-center gap-[13px] px-[15px] py-[13px] bg-inset rounded-[11px] mt-2.5">
              <div className="flex-1 min-w-0">
                <div className="font-bold text-[14.5px] text-ink flex items-center gap-2">
                  <UserX className="h-[15px] w-[15px] text-ink-3 flex-shrink-0" />
                  Delete account
                </div>
                <div className="text-[12.5px] text-ink-3 mt-0.5">
                  Permanently delete everything, including your X connection.
                </div>
              </div>
              <button
                onClick={() => setShowDeleteAccountModal(true)}
                className="px-[15px] py-[9px] min-h-[44px] rounded-[10px] bg-red-600 text-white font-semibold text-[13.5px] whitespace-nowrap hover:bg-red-700 transition-colors"
              >
                Delete account
              </button>
            </div>
          </SCard>
        )}

        {/* Setup Instructions (when not connected) */}
        {!authStatus?.authenticated && !loading && (
          <SCard>
            <div className="px-5 py-[18px]">
              <h2 className="font-serif text-base font-semibold text-ink mb-4">Setup Instructions</h2>
              <ol className="list-decimal list-inside space-y-3 text-sm text-ink-2">
                <li>
                  Go to{' '}
                  <a href="https://developer.x.com/en/portal/dashboard" target="_blank" rel="noopener noreferrer" className="text-clay hover:underline">
                    X Developer Portal
                  </a>
                </li>
                <li>Create a new Project and App</li>
                <li>Enable &quot;OAuth 2.0&quot; under User Authentication Settings</li>
                <li>
                  Set callback URL to:{' '}
                  <code className="bg-inset px-2 py-0.5 rounded text-xs font-mono">
                    http://localhost:3000/api/auth/twitter/callback
                  </code>
                </li>
                <li>Copy Client ID and Client Secret</li>
                <li>
                  Add to <code className="bg-inset px-2 py-0.5 rounded text-xs font-mono">.env.local</code>:
                  <pre className="mt-2 bg-inset p-3 rounded-card text-xs overflow-x-auto font-mono text-ink-2">
{`TWITTER_CLIENT_ID=your_client_id
TWITTER_CLIENT_SECRET=your_client_secret`}
                  </pre>
                </li>
                <li>Restart the server and connect</li>
              </ol>
            </div>
          </SCard>
        )}

        {/* Version Footer */}
        <div className="text-center pt-4">
          <p className="text-xs text-ink-3 font-mono">
            ADHX v{process.env.NEXT_PUBLIC_APP_VERSION || '0.0.0'}
          </p>
        </div>
      </div>

      {/* Sync Progress Modal */}
      <SyncProgress
        isOpen={showSyncModal}
        onClose={() => setShowSyncModal(false)}
        onComplete={handleSyncComplete}
      />

      {/* Clear Data Confirmation Modal */}
      {showClearDataModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => { setShowClearDataModal(false); setConfirmText('') }}
          />
          <div className="relative bg-surface border border-hairline rounded-card p-6 max-w-md w-full shadow-m-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-clay/10 flex items-center justify-center">
                <Eraser className="h-5 w-5 text-clay" />
              </div>
              <h3 className="font-serif text-lg font-semibold text-ink">Clear All Data</h3>
            </div>
            <div className="space-y-4 mb-6">
              <p className="text-ink-2">This will permanently delete:</p>
              <ul className="list-disc list-inside text-sm text-ink-2 space-y-1 ml-2">
                <li>All synced bookmarks</li>
                <li>Read/unread status</li>
                <li>Sync history</li>
                <li>Collections and preferences</li>
              </ul>
              <p className="text-sm text-green-700">✓ Your X connection will be preserved</p>
              <div>
                <label className="block text-sm font-medium text-ink-2 mb-2">
                  Type <span className="font-mono bg-inset px-1.5 py-0.5 rounded">CLEAR</span> to confirm:
                </label>
                <input
                  ref={clearDataInputRef}
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="CLEAR"
                  className="w-full px-4 py-2.5 text-base sm:text-sm rounded-[11px] border border-hairline bg-inset text-ink focus:outline-none focus:ring-2 focus:ring-clay"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setShowClearDataModal(false); setConfirmText('') }}
                disabled={dangerActionLoading}
                className="flex-1 px-4 py-2.5 min-h-[44px] rounded-[11px] font-medium text-ink-2 bg-inset hover:bg-hairline transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleClearData}
                disabled={confirmText !== 'CLEAR' || dangerActionLoading}
                className="flex-1 px-4 py-2.5 min-h-[44px] rounded-[11px] font-medium text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
          <div className="relative bg-surface rounded-card p-6 max-w-md w-full shadow-m-sm border border-red-500/40">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
                <UserX className="h-5 w-5 text-red-600" />
              </div>
              <h3 className="font-serif text-lg font-semibold text-red-600">Delete Account</h3>
            </div>
            <div className="space-y-4 mb-6">
              <div className="p-3 bg-red-500/10 rounded-[11px] border border-red-500/30">
                <p className="text-sm text-red-700 font-medium flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  This action is permanent and cannot be undone!
                </p>
              </div>
              <p className="text-ink-2">This will permanently delete:</p>
              <ul className="list-disc list-inside text-sm text-ink-2 space-y-1 ml-2">
                <li>All synced bookmarks and data</li>
                <li>Your X connection</li>
                <li>All account settings</li>
              </ul>
              <div>
                <label className="block text-sm font-medium text-ink-2 mb-2">
                  Type <span className="font-mono bg-inset px-1.5 py-0.5 rounded">DELETE</span> to confirm:
                </label>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="DELETE"
                  className="w-full px-4 py-2.5 text-base sm:text-sm rounded-[11px] border border-red-500/40 bg-inset text-ink focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setShowDeleteAccountModal(false); setConfirmText('') }}
                disabled={dangerActionLoading}
                className="flex-1 px-4 py-2.5 min-h-[44px] rounded-[11px] font-medium text-ink-2 bg-inset hover:bg-hairline transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={confirmText !== 'DELETE' || dangerActionLoading}
                className="flex-1 px-4 py-2.5 min-h-[44px] rounded-[11px] font-medium text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
