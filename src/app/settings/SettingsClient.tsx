'use client'

import { useEffect, useState, Suspense, useRef, type FormEvent } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import {
  CheckCircle,
  XCircle,
  LogOut,
  RefreshCw,
  AlertCircle,
  History,
  AlertTriangle,
  Eraser,
  UserX,
  BookOpen,
  Type,
  Monitor,
  Moon,
  Sun,
  Check,
  Flame,
  Mail,
  Lock,
  AtSign,
} from 'lucide-react'
import { SyncProgress } from '@/components/sync/SyncProgress'
import { usePreferences, FONT_OPTIONS, type BodyFont } from '@/lib/preferences-context'
import { KeyboardShortcutsModal } from '@/components/KeyboardShortcutsModal'
import { useTheme } from '@/lib/theme/context'
import { PlatformGlyph, ConnectWithX } from '@/components/matter'
import { UsernameChooser, type UsernameClaimSuccess } from '@/components/auth/UsernameChooser'
import { MAX_USERNAME_CHANGES } from '@/lib/auth/username-rules'
import { cn } from '@/lib/utils'

const CONNECT_X_URL = '/api/auth/twitter?returnUrl=%2Fsettings'

interface AuthMe {
  authenticated: boolean
  user: {
    id: string
    username: string
    displayName: string
    avatarUrl: string
    usernameChosen: boolean
    usernameChangeCount: number
  } | null
  identities: {
    x: { username: string } | null
    email: { email: string } | null
  }
  xConnected: boolean
}

interface CooldownStatus {
  canSync: boolean
  cooldownRemaining: number
  lastSyncAt: string | null
  fetchedAt: number // timestamp when cooldown was fetched
}

interface SyncHistoryEntry {
  id: string
  startedAt: string
  completedAt: string | null
  status: string
  newBookmarks: number
  totalFetched: number
}

interface SyncHistoryData {
  syncs: SyncHistoryEntry[]
  lastSyncAt: string | null
  totalBookmarks: number
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
        <div
          className={cn('flex items-center gap-3 px-5 pt-[18px]', children ? 'pb-0' : 'pb-[18px]')}
        >
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
            <div
              className={cn(
                'font-serif font-semibold text-base',
                danger ? 'text-red-600' : 'text-ink',
              )}
            >
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
            <div
              key={i}
              className="bg-surface border border-hairline rounded-card p-6 animate-pulse"
            >
              <div className="h-6 bg-inset rounded w-1/3 mb-4" />
              <div className="h-20 bg-inset rounded-card" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ── Username row ──────────────────────────────────────────────── */
/**
 * Every account gets a first free username claim, plus `MAX_USERNAME_CHANGES`
 * (2) further changes — after that the row goes read-only. Every change past
 * the first records the old name as a redirect alias (see
 * `chooseUsername()` in `src/lib/auth/account.ts`), so public collection
 * links (`/t/{username}/...`) never dead-end after a rename.
 */
function UsernameRow({ me, refresh }: { me: AuthMe; refresh: () => void }) {
  const [editing, setEditing] = useState(false)
  if (!me.user) return null

  const { username, usernameChosen, usernameChangeCount } = me.user
  const changesRemaining = usernameChosen
    ? Math.max(0, MAX_USERNAME_CHANGES - usernameChangeCount)
    : MAX_USERNAME_CHANGES
  const canChange = !usernameChosen || changesRemaining > 0

  function handleSuccess(_result: UsernameClaimSuccess) {
    setEditing(false)
    refresh()
  }

  const hint = !usernameChosen
    ? `This becomes your public handle. You'll get ${MAX_USERNAME_CHANGES} more changes after this one, and old handles keep redirecting so shared links never break.`
    : changesRemaining > 0
      ? `${changesRemaining} change${changesRemaining === 1 ? '' : 's'} left. @${username} will keep redirecting here once you change it, so shared links never break.`
      : 'Username changes used up — this handle is permanent.'

  return (
    <div className="px-5 py-4">
      <div className="flex items-center gap-[13px]">
        <div className="w-10 h-10 rounded-full bg-inset flex items-center justify-center flex-shrink-0">
          <AtSign className="h-[18px] w-[18px] text-ink-2" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-mono font-bold text-[14.5px] text-ink truncate">@{username}</p>
          <p className="text-[12px] text-ink-3 mt-0.5">
            {usernameChosen
              ? changesRemaining > 0
                ? `${changesRemaining} change${changesRemaining === 1 ? '' : 's'} left`
                : 'Usernames are permanent once changes run out'
              : 'Your public handle on shared collections'}
          </p>
        </div>
        {canChange && !editing && (
          <button
            onClick={() => setEditing(true)}
            className="inline-flex items-center px-3.5 py-2 min-h-[44px] rounded-[10px] border border-hairline text-ink-2 font-semibold text-[13px] whitespace-nowrap hover:bg-inset transition-colors"
          >
            {usernameChosen ? 'Change' : 'Choose'}
          </button>
        )}
      </div>

      {editing && (
        <div className="mt-3">
          <p className="text-[12.5px] text-ink-3">{hint}</p>
          <UsernameChooser
            suggestedUsername={username}
            theme="matter"
            showKeepSuggestion={false}
            autoFocus
            onSuccess={handleSuccess}
          />
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="mt-2 text-[13px] text-ink-3 hover:text-ink transition-colors"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}

/* ── Sign-in & connection ──────────────────────────────────────── */
function SignInConnectionCard({ me, refresh }: { me: AuthMe; refresh: () => void }) {
  const [xActionLoading, setXActionLoading] = useState(false)
  const [xError, setXError] = useState<string | null>(null)

  const [emailEditing, setEmailEditing] = useState(false)
  const [emailValue, setEmailValue] = useState('')
  const [emailSubmitting, setEmailSubmitting] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [emailSuccess, setEmailSuccess] = useState<string | null>(null)

  const [addEmailValue, setAddEmailValue] = useState('')
  const [addEmailSubmitting, setAddEmailSubmitting] = useState(false)
  const [addEmailError, setAddEmailError] = useState<string | null>(null)
  const [addEmailSuccess, setAddEmailSuccess] = useState<string | null>(null)

  async function handleDisconnectX() {
    if (!window.confirm('Disconnect your X account? You can reconnect any time.')) return
    setXActionLoading(true)
    setXError(null)
    try {
      const res = await fetch('/api/auth/twitter/disconnect', { method: 'POST' })
      if (res.ok) {
        refresh()
      } else {
        const data = await res.json().catch(() => ({}))
        setXError(data.error || 'Failed to disconnect.')
      }
    } catch {
      setXError('Failed to disconnect. Please try again.')
    } finally {
      setXActionLoading(false)
    }
  }

  async function handleChangeEmail(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setEmailSubmitting(true)
    setEmailError(null)
    try {
      const res = await fetch('/api/auth/email/change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailValue }),
      })
      if (res.ok) {
        setEmailSuccess(`Check ${emailValue} — confirmation link sent.`)
        setEmailEditing(false)
      } else {
        const data = await res.json().catch(() => ({}))
        setEmailError(data.error || 'Failed to send confirmation link.')
      }
    } catch {
      setEmailError('Failed to send confirmation link.')
    } finally {
      setEmailSubmitting(false)
    }
  }

  async function handleAddEmail(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setAddEmailSubmitting(true)
    setAddEmailError(null)
    try {
      const res = await fetch('/api/auth/email/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: addEmailValue, returnTo: '/settings' }),
      })
      if (res.ok) {
        setAddEmailSuccess(`Check ${addEmailValue} for a sign-in link.`)
      } else {
        const data = await res.json().catch(() => ({}))
        setAddEmailError(data.error || 'Failed to send sign-in link.')
      }
    } catch {
      setAddEmailError('Failed to send sign-in link.')
    } finally {
      setAddEmailSubmitting(false)
    }
  }

  return (
    <SCard
      icon={Lock}
      title="Sign-in & connection"
      sub="Two ways in — one collection"
      bodyPadded={false}
    >
      <div className="divide-y divide-hairline">
        {/* X row */}
        <div className="px-5 py-4">
          <div className="flex items-center gap-[13px]">
            <div className="w-10 h-10 rounded-full bg-black flex items-center justify-center flex-shrink-0">
              <PlatformGlyph platform="twitter" size={18} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              {me.identities.x ? (
                <>
                  <p className="font-mono font-bold text-[14.5px] text-ink truncate">
                    @{me.identities.x.username}
                  </p>
                  <span className="inline-flex items-center text-[10px] font-bold tracking-[0.06em] uppercase text-green-700 bg-green-500/10 px-2 py-0.5 rounded-full mt-1">
                    Connected
                  </span>
                </>
              ) : (
                <p className="text-[13.5px] text-ink-3">Not connected</p>
              )}
            </div>
            {me.identities.x ? (
              <button
                onClick={handleDisconnectX}
                disabled={xActionLoading}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[44px] rounded-[10px] border border-hairline text-ink-2 font-semibold text-[13px] whitespace-nowrap hover:bg-inset transition-colors disabled:opacity-60"
              >
                {xActionLoading ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <LogOut className="h-3.5 w-3.5" />
                )}
                <span>Disconnect</span>
              </button>
            ) : (
              <a
                href={CONNECT_X_URL}
                className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-[10px] bg-clay-grad text-white shadow-glow font-semibold text-[13.5px] whitespace-nowrap hover:opacity-90 transition-all"
              >
                <ConnectWithX size={14} />
              </a>
            )}
          </div>
          {xError && <p className="text-xs text-red-600 mt-2">{xError}</p>}
        </div>

        {/* Email row */}
        <div className="px-5 py-4">
          <div className="flex items-center gap-[13px]">
            <div className="w-10 h-10 rounded-full bg-inset flex items-center justify-center flex-shrink-0">
              <Mail className="h-[18px] w-[18px] text-ink-2" />
            </div>
            <div className="flex-1 min-w-0">
              {me.identities.email ? (
                <>
                  <p className="font-mono font-bold text-[14.5px] text-ink truncate">
                    {me.identities.email.email}
                  </p>
                  <span className="inline-flex items-center text-[10px] font-bold tracking-[0.06em] uppercase text-clay bg-clay/[0.12] px-2 py-0.5 rounded-full mt-1">
                    Magic link
                  </span>
                </>
              ) : (
                <p className="text-[13.5px] text-ink-2">
                  Add an email so you can sign in without X.
                </p>
              )}
            </div>
            {me.identities.email && !emailEditing && (
              <button
                onClick={() => {
                  setEmailValue('')
                  setEmailError(null)
                  setEmailSuccess(null)
                  setEmailEditing(true)
                }}
                className="inline-flex items-center px-3.5 py-2 min-h-[44px] rounded-[10px] border border-hairline text-ink-2 font-semibold text-[13px] whitespace-nowrap hover:bg-inset transition-colors"
              >
                Change
              </button>
            )}
          </div>

          {me.identities.email && emailEditing && (
            <form onSubmit={handleChangeEmail} className="mt-3 flex flex-col sm:flex-row gap-2">
              <input
                type="email"
                required
                autoFocus
                value={emailValue}
                onChange={(e) => setEmailValue(e.target.value)}
                placeholder="new@email.com"
                className="flex-1 px-3.5 py-2.5 text-base sm:text-sm rounded-[10px] border border-hairline bg-inset text-ink focus:outline-none focus:ring-2 focus:ring-clay"
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={emailSubmitting}
                  className="flex-1 sm:flex-none px-4 py-2.5 min-h-[44px] rounded-[10px] bg-clay-grad text-white font-semibold text-sm whitespace-nowrap hover:opacity-90 transition-all disabled:opacity-60"
                >
                  {emailSubmitting ? 'Sending…' : 'Send confirmation link'}
                </button>
                <button
                  type="button"
                  onClick={() => setEmailEditing(false)}
                  className="px-3.5 py-2.5 min-h-[44px] rounded-[10px] text-ink-3 font-semibold text-sm hover:bg-inset transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {!me.identities.email && (
            <form onSubmit={handleAddEmail} className="mt-3 flex flex-col sm:flex-row gap-2">
              <input
                type="email"
                required
                value={addEmailValue}
                onChange={(e) => setAddEmailValue(e.target.value)}
                placeholder="you@email.com"
                className="flex-1 px-3.5 py-2.5 text-base sm:text-sm rounded-[10px] border border-hairline bg-inset text-ink focus:outline-none focus:ring-2 focus:ring-clay"
              />
              <button
                type="submit"
                disabled={addEmailSubmitting}
                className="px-4 py-2.5 min-h-[44px] rounded-[10px] bg-clay-grad text-white font-semibold text-sm whitespace-nowrap hover:opacity-90 transition-all disabled:opacity-60"
              >
                {addEmailSubmitting ? 'Sending…' : 'Add email'}
              </button>
            </form>
          )}

          {emailError && <p className="text-xs text-red-600 mt-2">{emailError}</p>}
          {emailSuccess && <p className="text-xs text-green-700 mt-2">{emailSuccess}</p>}
          {addEmailError && <p className="text-xs text-red-600 mt-2">{addEmailError}</p>}
          {addEmailSuccess && <p className="text-xs text-green-700 mt-2">{addEmailSuccess}</p>}
        </div>

        {/* Username row */}
        <UsernameRow me={me} refresh={refresh} />
      </div>
      <p className="px-5 py-3 text-[12px] text-ink-3 border-t border-hairline">
        Either method signs you into the same collection.
      </p>
    </SCard>
  )
}

/* ── Sync X bookmarks ──────────────────────────────────────────── */
function SyncBookmarksCard({
  xConnected,
  cooldown,
  displayedCooldown,
  formatCooldown,
  onSyncClick,
  lastSyncAt,
  totalBookmarks,
  getTimeSince,
}: {
  xConnected: boolean
  cooldown: CooldownStatus
  displayedCooldown: number
  formatCooldown: (ms: number) => string
  onSyncClick: () => void
  lastSyncAt: string | null
  totalBookmarks: number
  getTimeSince: (dateStr: string) => string
}) {
  if (!xConnected) {
    return (
      <SCard icon={RefreshCw} title="Sync X bookmarks" sub="Pull your latest posts on demand">
        <div className="text-center py-2">
          <p className="text-[13.5px] text-ink-2 mb-4">
            Connect your X account to sync your bookmarks.
          </p>
          <a
            href={CONNECT_X_URL}
            className="inline-flex items-center gap-2 px-5 py-3 min-h-[44px] rounded-[12px] bg-clay-grad text-white shadow-glow font-semibold text-sm hover:opacity-90 transition-all"
          >
            <ConnectWithX size={14} />
          </a>
        </div>
      </SCard>
    )
  }

  return (
    <SCard icon={RefreshCw} title="Sync X bookmarks" sub="Pull your latest posts on demand">
      <button
        onClick={() => cooldown.canSync && onSyncClick()}
        disabled={!cooldown.canSync}
        className={cn(
          'w-full flex items-center justify-center gap-2.5 py-[15px] min-h-[44px] rounded-[12px] font-bold text-[15.5px] transition-all',
          cooldown.canSync
            ? 'bg-clay-grad text-white shadow-glow hover:opacity-90'
            : 'bg-clay-grad text-white/70 opacity-60 cursor-not-allowed',
        )}
      >
        <RefreshCw className="h-[18px] w-[18px]" />
        <span>
          {cooldown.canSync ? 'Sync now' : `Available in ${formatCooldown(displayedCooldown)}`}
        </span>
      </button>
      <p className="text-[13px] text-ink-3 text-center mt-3">
        {lastSyncAt ? `Last sync ${getTimeSince(lastSyncAt)}` : 'No syncs yet'}
        {' · '}
        {totalBookmarks} {totalBookmarks === 1 ? 'bookmark' : 'bookmarks'} in your collection
      </p>
      <p className="text-xs text-ink-3 text-center mt-1.5">
        Syncs are rate-limited to once per 15 minutes.
      </p>
    </SCard>
  )
}

/* ── Sync history ──────────────────────────────────────────────── */
function formatSyncTimestamp(dateStr: string) {
  const d = new Date(dateStr)
  const month = d.toLocaleString('en-US', { month: 'short' })
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${month} ${d.getDate()}, ${hh}:${mm}`
}

function SyncHistoryCard({ syncs, loading }: { syncs: SyncHistoryEntry[]; loading: boolean }) {
  return (
    <SCard icon={History} title="Sync history" sub="Recent sync operations">
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-inset rounded-[11px] animate-pulse" />
          ))}
        </div>
      ) : syncs.length === 0 ? (
        <div className="text-center py-8 text-ink-3">
          <History className="h-10 w-10 mx-auto mb-2 opacity-50" />
          <p>No syncs yet.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {syncs.map((log) => {
            const pages = log.totalFetched > 0 ? Math.max(1, Math.ceil(log.totalFetched / 100)) : 0
            return (
              <div
                key={log.id}
                className="flex items-center gap-3 px-[14px] py-3 bg-inset rounded-[11px]"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-mono font-bold text-[13px] text-ink truncate">
                    {formatSyncTimestamp(log.startedAt)}
                  </div>
                </div>
                <div className="font-mono font-bold text-[13px] text-green-700 whitespace-nowrap">
                  +{log.newBookmarks} new
                </div>
                <div className="text-xs text-ink-3 whitespace-nowrap">
                  {pages} {pages === 1 ? 'page' : 'pages'}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </SCard>
  )
}

/** Local calendar day as YYYY-MM-DD. */
function localDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface StreakData {
  current: number
  longest: number
  lastActiveDate: string | null
  triagedTotal: number
  triagedThisWeek: number
}

/**
 * Gamification streak card: current streak, a Mon–Sun dot row
 * (done / today / upcoming), and stats — longest streak, posts triaged, this week.
 */
function StreakCard() {
  const [s, setS] = useState<StreakData | null>(null)

  useEffect(() => {
    let alive = true
    fetch(`/api/triage/streak?today=${localDay(new Date())}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => alive && d && setS(d))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  const current = s?.current ?? 0
  const today = localDay(new Date())

  // Active days = the `current` consecutive days ending at lastActiveDate.
  const activeDays = new Set<string>()
  if (s?.lastActiveDate && current > 0) {
    const [y, m, d] = s.lastActiveDate.split('-').map(Number)
    for (let k = 0; k < current; k++) {
      const dt = new Date(y, m - 1, d)
      dt.setDate(dt.getDate() - k)
      activeDays.add(localDay(dt))
    }
  }

  // Build the current calendar week, Monday → Sunday.
  const now = new Date()
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7))
  const labels = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
  const week = labels.map((label, i) => {
    const dt = new Date(monday)
    dt.setDate(monday.getDate() + i)
    const iso = localDay(dt)
    return { label, iso, done: activeDays.has(iso), isToday: iso === today, isFuture: iso > today }
  })

  const activeToday = activeDays.has(today)
  const subtitle = activeToday
    ? 'Nice — come back tomorrow to keep it going.'
    : current > 0
      ? `Triage at least one post today to reach ${current + 1} days.`
      : 'Triage a post today to start your streak.'

  const stats: [string, string][] = [
    [String(s?.longest ?? 0), 'Longest streak'],
    [String(s?.triagedTotal ?? 0), 'Posts triaged'],
    [String(s?.triagedThisWeek ?? 0), 'This week'],
  ]

  return (
    <div className="rounded-card border border-clay/25 bg-clay/[0.06] p-5 sm:px-6">
      <div className="flex flex-wrap items-center gap-3.5">
        <div className="w-[52px] h-[52px] flex-none rounded-[14px] bg-flame/[0.18] flex items-center justify-center">
          <Flame className="w-[26px] h-[26px] text-flame" fill="currentColor" />
        </div>
        <div className="flex-1 min-w-[140px]">
          <div className="font-serif font-bold text-[23px] leading-tight text-ink">
            {current > 0 ? `${current}-day streak` : 'Start a streak'}
          </div>
          <div className="text-[13.5px] text-ink-2 mt-0.5">{subtitle}</div>
        </div>
        <div className="flex gap-[7px]">
          {week.map((d, i) => (
            <div key={i} className="flex flex-col items-center gap-1.5">
              <div
                className={cn(
                  'w-[26px] h-[26px] rounded-full flex items-center justify-center',
                  d.done
                    ? 'bg-clay-grad text-white'
                    : d.isToday
                      ? 'border-2 border-dashed border-clay bg-inset'
                      : 'bg-inset',
                )}
              >
                {d.done && <Check className="w-3 h-3" strokeWidth={3} />}
              </div>
              <span className="text-[10.5px] font-semibold text-ink-3">{d.label}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="flex gap-7 mt-4 pt-4 border-t border-clay/20 font-mono">
        {stats.map(([n, l]) => (
          <div key={l}>
            <div className="font-extrabold text-[18px] text-ink">{n}</div>
            <div className="text-[12px] text-ink-3">{l}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function SettingsPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { theme, setTheme } = useTheme()

  const [me, setMe] = useState<AuthMe | null>(null)
  const [meLoading, setMeLoading] = useState(true)

  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [showSyncModal, setShowSyncModal] = useState(false)
  const [cooldown, setCooldown] = useState<CooldownStatus>({
    canSync: true,
    cooldownRemaining: 0,
    lastSyncAt: null,
    fetchedAt: Date.now(),
  })
  const [displayedCooldown, setDisplayedCooldown] = useState(0)

  // Sync history state
  const [syncHistory, setSyncHistory] = useState<SyncHistoryData>({
    syncs: [],
    lastSyncAt: null,
    totalBookmarks: 0,
  })
  const [syncHistoryLoading, setSyncHistoryLoading] = useState(true)

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
    const emailChanged = searchParams.get('email_changed')
    const authError = searchParams.get('auth_error')

    if (emailChanged) {
      setMessage({ type: 'success', text: 'Email updated.' })
    } else if (authError === 'email_in_use') {
      setMessage({ type: 'error', text: 'That email is already linked to another account.' })
    } else if (authError === 'x_already_linked') {
      setMessage({ type: 'error', text: 'That X account is already linked to another account.' })
    } else if (authError) {
      setMessage({ type: 'error', text: 'Something went wrong signing you in.' })
    } else if (success) {
      setMessage({ type: 'success', text: success })
    } else if (error) {
      setMessage({ type: 'error', text: error })
    }
  }, [searchParams])

  async function fetchMe() {
    setMeLoading(true)
    try {
      const response = await fetch('/api/auth/me')
      const data = await response.json()
      setMe(data)
    } catch (error) {
      console.error('Failed to fetch account identity:', error)
      setMe({
        authenticated: false,
        user: null,
        identities: { x: null, email: null },
        xConnected: false,
      })
    } finally {
      setMeLoading(false)
    }
  }

  async function fetchSyncHistory() {
    setSyncHistoryLoading(true)
    try {
      const response = await fetch('/api/sync/history')
      const data = await response.json()
      setSyncHistory({
        syncs: data.syncs || [],
        lastSyncAt: data.lastSyncAt ?? null,
        totalBookmarks: data.totalBookmarks ?? 0,
      })
    } catch (error) {
      console.error('Failed to fetch sync history:', error)
    } finally {
      setSyncHistoryLoading(false)
    }
  }

  useEffect(() => {
    fetchMe()
    fetchSyncHistory()
  }, [])

  async function fetchCooldown() {
    try {
      const response = await fetch('/api/sync/cooldown')
      const data = await response.json()
      setCooldown({ ...data, fetchedAt: Date.now() })
    } catch (error) {
      console.error('Failed to fetch cooldown:', error)
    }
  }

  useEffect(() => {
    if (me?.xConnected) {
      fetchCooldown()
      // Update cooldown timer every 30 seconds for more accurate countdown
      const cooldownInterval = setInterval(fetchCooldown, 30000)
      return () => clearInterval(cooldownInterval)
    }
  }, [me?.xConnected])

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

  function handleSyncComplete() {
    setShowSyncModal(false)
    fetchSyncHistory()
    fetchCooldown()
    setMessage({ type: 'success', text: 'Bookmarks synced successfully!' })
    // Notify Header to refresh stats and cooldown
    window.dispatchEvent(new CustomEvent('stats-updated'))
    window.dispatchEvent(new CustomEvent('sync-complete'))
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
        setMessage({
          type: 'success',
          text: 'All data cleared. Your sign-in connections are preserved.',
        })
        setShowClearDataModal(false)
        setConfirmText('')
        setSyncHistory({ syncs: [], lastSyncAt: null, totalBookmarks: 0 })
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

  const themeOptions: {
    value: 'light' | 'dark' | 'system'
    label: string
    icon: React.ComponentType<{ className?: string }>
  }[] = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'system', label: 'System', icon: Monitor },
  ]

  return (
    <div className="min-h-screen bg-paper">
      <div className="max-w-[760px] mx-auto px-4 sm:px-8 py-8 sm:py-10 flex flex-col gap-5">
        {/* Header */}
        <div>
          <h1 className="font-serif text-[30px] sm:text-[38px] font-semibold tracking-tight text-ink mb-1">
            Settings
          </h1>
          <p className="text-[15px] text-ink-2">Your account, sync, and reading setup</p>
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

        {/* Sign-in & connection */}
        {meLoading ? (
          <SCard>
            <div className="flex items-center gap-3 text-ink-3 px-5 py-[18px]">
              <RefreshCw className="h-5 w-5 animate-spin" />
              <span>Checking your account…</span>
            </div>
          </SCard>
        ) : (
          me && <SignInConnectionCard me={me} refresh={fetchMe} />
        )}

        {/* Sync X bookmarks */}
        {!meLoading && me && (
          <SyncBookmarksCard
            xConnected={me.xConnected}
            cooldown={cooldown}
            displayedCooldown={displayedCooldown}
            formatCooldown={formatCooldown}
            onSyncClick={() => setShowSyncModal(true)}
            lastSyncAt={syncHistory.lastSyncAt}
            totalBookmarks={syncHistory.totalBookmarks}
            getTimeSince={getTimeSince}
          />
        )}

        {/* Sync history */}
        <SyncHistoryCard syncs={syncHistory.syncs} loading={syncHistoryLoading} />

        {/* Streak / gamification */}
        <StreakCard />

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

        {/* Reading Preferences Card */}
        <SCard icon={BookOpen} title="Reading preferences" sub="Customize your reading experience">
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
                <strong className="font-bold text-ink-2">Bo</strong>
                <span>lds the </span>
                <strong className="font-bold text-ink-2">fi</strong>
                <span>rst </span>
                <strong className="font-bold text-ink-2">pa</strong>
                <span>rt of </span>
                <strong className="font-bold text-ink-2">ea</strong>
                <span>ch </span>
                <strong className="font-bold text-ink-2">wo</strong>
                <span>rd to </span>
                <strong className="font-bold text-ink-2">gui</strong>
                <span>de your </span>
                <strong className="font-bold text-ink-2">ey</strong>
                <span>es.</span>
              </p>
            </div>
            <button
              onClick={() => updatePreference('bionicReading', !preferences.bionicReading)}
              className={cn(
                'relative inline-flex h-6 w-[42px] flex-shrink-0 cursor-pointer rounded-full p-[3px] transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2',
                preferences.bionicReading
                  ? 'bg-clay-grad justify-end'
                  : 'bg-surface border border-hairline justify-start',
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
            <span>Body Font</span>
          </div>
          <div className="flex flex-col gap-2">
            {(
              Object.entries(FONT_OPTIONS) as [BodyFont, { name: string; description: string }][]
            ).map(([key, { name, description }]) => {
              const fontVar = `var(--font-${key})`
              const selected = preferences.bodyFont === key
              return (
                <button
                  key={key}
                  onClick={() => updatePreference('bodyFont', key)}
                  role="radio"
                  aria-checked={selected}
                  className={cn(
                    'flex items-center gap-3 px-[15px] py-[13px] min-h-[44px] rounded-[12px] text-left border-[1.5px] transition-all',
                    selected
                      ? 'border-clay bg-clay/[0.07]'
                      : 'border-hairline bg-surface hover:border-ink-3',
                  )}
                >
                  <span
                    className={cn(
                      'flex-none w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center',
                      selected ? 'border-clay' : 'border-ink-3',
                    )}
                  >
                    {selected && <span className="w-[9px] h-[9px] rounded-full bg-clay-grad" />}
                  </span>
                  <span>
                    <p className="font-bold text-[14.5px] text-ink" style={{ fontFamily: fontVar }}>
                      {name}
                    </p>
                    <p className="text-xs text-ink-3 mt-0.5" style={{ fontFamily: fontVar }}>
                      The quick brown fox — {description}
                    </p>
                  </span>
                </button>
              )
            })}
          </div>
        </SCard>

        {/* Danger Zone */}
        <SCard icon={AlertTriangle} title="Danger zone" sub="Irreversible actions" danger>
          {/* Clear Data */}
          <div className="flex items-center gap-[13px] px-[15px] py-[13px] bg-inset rounded-[11px]">
            <div className="flex-1 min-w-0">
              <div className="font-bold text-[14.5px] text-ink flex items-center gap-2">
                <Eraser className="h-[15px] w-[15px] text-ink-3 flex-shrink-0" />
                <span>Clear all data</span>
              </div>
              <div className="text-[12.5px] text-ink-3 mt-0.5">
                Delete all bookmarks and sync history. Keeps your sign-in connections.
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
                <span>Delete account</span>
              </div>
              <div className="text-[12.5px] text-ink-3 mt-0.5">
                Permanently delete everything, including your sign-in connections.
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
            onClick={() => {
              setShowClearDataModal(false)
              setConfirmText('')
            }}
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
              <p className="text-sm text-green-700 flex items-center gap-1.5">
                <Check className="h-4 w-4 flex-shrink-0" />
                Your sign-in connections will be preserved
              </p>
              <div>
                <label className="block text-sm font-medium text-ink-2 mb-2">
                  Type <span className="font-mono bg-inset px-1.5 py-0.5 rounded">CLEAR</span> to
                  confirm:
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
                onClick={() => {
                  setShowClearDataModal(false)
                  setConfirmText('')
                }}
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
            onClick={() => {
              setShowDeleteAccountModal(false)
              setConfirmText('')
            }}
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
                <li>Your X and email sign-in connections</li>
                <li>All account settings</li>
              </ul>
              <div>
                <label className="block text-sm font-medium text-ink-2 mb-2">
                  Type <span className="font-mono bg-inset px-1.5 py-0.5 rounded">DELETE</span> to
                  confirm:
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
                onClick={() => {
                  setShowDeleteAccountModal(false)
                  setConfirmText('')
                }}
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
