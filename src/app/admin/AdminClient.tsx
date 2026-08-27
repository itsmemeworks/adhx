'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  Ban,
  EyeOff,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Search,
  Shield,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AnalyticsWindow } from '@/lib/analytics/query'
import type { AdminOverview, InspectedPost, InspectedUser } from '@/lib/admin/query'

const WINDOWS: { id: AnalyticsWindow; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'all', label: 'All' },
]

const EVENT_LABELS: Record<string, string> = {
  'post.view': 'Views',
  'post.save': 'Saves',
  'post.share': 'Shares',
  'post.send': 'Sends',
  'post.copy': 'Copies',
  'post.open': 'Opens',
  'post.tag': 'Tags',
  'post.archive': 'Archives',
  'theater.open': 'Theater opens',
  'auth.complete': 'Sign-ins',
  'auth.fail': 'Auth fails',
  'sync.complete': 'Syncs',
  'playlist.view': 'Playlist views',
  'playlist.clone': 'Clones',
  'shortcut.install': 'Shortcut taps',
}

function labelEvent(name: string): string {
  return EVENT_LABELS[name] || name
}

function banBlockReason(user: InspectedUser): string | null {
  if (user.isSelf) return 'You cannot ban your own account.'
  if (user.isAdmin) return 'You cannot ban an admin.'
  return null
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '—'
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return iso
  const diff = Date.now() - t
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function AdminClient() {
  const [window, setWindow] = useState<AnalyticsWindow>('week')
  const [overview, setOverview] = useState<AdminOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [paused, setPaused] = useState(false)

  const [postQuery, setPostQuery] = useState('')
  const [post, setPost] = useState<InspectedPost | null>(null)
  const [postLoading, setPostLoading] = useState(false)
  const [postError, setPostError] = useState<string | null>(null)
  const [hideReason, setHideReason] = useState('')
  const [postBusy, setPostBusy] = useState(false)

  const [userQuery, setUserQuery] = useState('')
  const [user, setUser] = useState<InspectedUser | null>(null)
  const [userLoading, setUserLoading] = useState(false)
  const [userError, setUserError] = useState<string | null>(null)
  const [banReason, setBanReason] = useState('')
  const [banConfirm, setBanConfirm] = useState('')
  const [userBusy, setUserBusy] = useState(false)

  const [playlistUser, setPlaylistUser] = useState('')
  const [playlistTag, setPlaylistTag] = useState('')
  const [playlistBusy, setPlaylistBusy] = useState(false)
  const [playlistMsg, setPlaylistMsg] = useState<string | null>(null)

  const loadOverview = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/overview?window=${window}`)
      if (res.status === 401 || res.status === 403) {
        setError('Not allowed')
        return
      }
      if (!res.ok) throw new Error('Failed to load')
      setOverview(await res.json())
      setError(null)
    } catch {
      setError('Failed to load admin overview')
    } finally {
      setLoading(false)
    }
  }, [window])

  useEffect(() => {
    setLoading(true)
    void loadOverview()
  }, [loadOverview])

  useEffect(() => {
    if (paused) return
    const id = setInterval(() => {
      void loadOverview()
    }, 30_000)
    return () => clearInterval(id)
  }, [loadOverview, paused])

  async function loadPost(raw: string) {
    const q = raw.trim()
    if (!q) return
    setPostLoading(true)
    setPostError(null)
    try {
      const res = await fetch(`/api/admin/posts?url=${encodeURIComponent(q)}&window=${window}`)
      const data = await res.json()
      if (!res.ok) {
        setPost(null)
        setPostError(data.error || 'Could not load that post')
        return
      }
      setPost(data)
    } catch {
      setPostError('Could not load that post')
    } finally {
      setPostLoading(false)
    }
  }

  async function togglePostHidden(hidden: boolean) {
    if (!post) return
    setPostBusy(true)
    try {
      const res = await fetch('/api/admin/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: post.platform,
          id: post.bookmarkId,
          hidden,
          reason: hideReason || undefined,
        }),
      })
      if (!res.ok) throw new Error('failed')
      await loadPost(`${post.platform}:${post.bookmarkId}`)
      await loadOverview()
    } catch {
      setPostError('Could not update visibility')
    } finally {
      setPostBusy(false)
    }
  }

  async function loadUser(raw: string) {
    const username = raw.trim().replace(/^@/, '')
    if (!username) return
    setUserLoading(true)
    setUserError(null)
    try {
      const res = await fetch(`/api/admin/users?username=${encodeURIComponent(username)}`)
      const data = await res.json()
      if (!res.ok) {
        setUser(null)
        setUserError(data.error || 'User not found')
        return
      }
      setUser(data)
      setBanConfirm('')
    } catch {
      setUserError('Could not load that user')
    } finally {
      setUserLoading(false)
    }
  }

  async function toggleBan(banned: boolean) {
    if (!user) return
    if (banned && banConfirm.trim().toLowerCase() !== user.username.toLowerCase()) {
      setUserError(`Type ${user.username} to confirm the ban`)
      return
    }
    setUserBusy(true)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: user.username,
          banned,
          reason: banReason || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setUserError(data.error || 'Could not update ban')
        return
      }
      await loadUser(user.username)
      await loadOverview()
    } catch {
      setUserError('Could not update ban')
    } finally {
      setUserBusy(false)
    }
  }

  async function hidePlaylist(hidden: boolean) {
    const username = playlistUser.trim().replace(/^@/, '')
    const tag = playlistTag.trim()
    if (!username || !tag) {
      setPlaylistMsg('Username and tag are required')
      return
    }
    setPlaylistBusy(true)
    try {
      const res = await fetch('/api/admin/collections/hide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, tag, hidden }),
      })
      const data = await res.json()
      if (!res.ok) {
        setPlaylistMsg(data.error || 'Could not update playlist')
        return
      }
      setPlaylistMsg(
        hidden
          ? `Hidden /t/${username}/${tag} from leaderboards (${data.updated} events)`
          : `Restored /t/${username}/${tag} (${data.updated} events)`,
      )
      await loadOverview()
    } catch {
      setPlaylistMsg('Could not update playlist')
    } finally {
      setPlaylistBusy(false)
    }
  }

  const totals = overview?.analytics.totals ?? {}
  const topTotals = [
    ['post.view', 'Views'],
    ['post.save', 'Saves'],
    ['post.share', 'Shares'],
    ['auth.complete', 'Sign-ins'],
    ['theater.open', 'Theater'],
    ['sync.complete', 'Syncs'],
  ] as const

  return (
    <div className="min-h-screen bg-paper">
      <div className="mx-auto max-w-[960px] px-4 sm:px-8 py-8 sm:py-10 flex flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-3 mb-1">
              <Link href="/settings" className="hover:text-ink">
                Settings
              </Link>
              <span> / Admin</span>
            </p>
            <h1 className="font-serif text-[30px] sm:text-[38px] font-semibold tracking-tight text-ink">
              Admin
            </h1>
            <p className="text-[15px] text-ink-2">
              Analytics, hide risky posts, ban accounts. Private — never shown on public surfaces.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-[10px] border border-hairline bg-surface text-[13px] font-semibold text-ink-2"
            >
              {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
              {paused ? 'Resume' : 'Auto 30s'}
            </button>
            <button
              type="button"
              onClick={() => void loadOverview()}
              className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-[10px] bg-clay/10 text-clay text-[13px] font-semibold"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
              Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-card border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <section className="bg-surface rounded-card border border-hairline shadow-m-sm p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="font-serif font-semibold text-base text-ink">Site</h2>
              <p className="text-[12.5px] text-ink-3">
                {overview ? `Updated ${formatWhen(overview.generatedAt)}` : 'Loading…'}
              </p>
            </div>
            <div className="inline-flex gap-[3px] p-[3px] bg-inset rounded-[10px]">
              {WINDOWS.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => setWindow(w.id)}
                  className={cn(
                    'px-3 py-1.5 min-h-[36px] rounded-lg text-[13px] font-semibold',
                    window === w.id ? 'bg-surface text-clay shadow-m-sm' : 'text-ink-3',
                  )}
                >
                  {w.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(
              [
                ['Users', overview?.stats.users],
                ['Bookmarks', overview?.stats.bookmarks],
                ['Pulse (live)', overview?.stats.activityVisible],
                ['Hidden pulse', overview?.stats.activityHidden],
                ['Public playlists', overview?.stats.publicPlaylists],
                ['Banned', overview?.stats.bannedUsers],
                ['Hidden posts', overview?.stats.moderatedPosts],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="rounded-[12px] bg-inset px-3 py-3">
                <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-3">
                  {label}
                </div>
                <div className="font-serif text-[22px] text-ink">
                  {value == null ? '—' : value.toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-surface rounded-card border border-hairline shadow-m-sm p-5">
          <h2 className="font-serif font-semibold text-base text-ink mb-1">Analytics</h2>
          <p className="text-[13px] text-ink-3 mb-4">
            Growth log for this window. No user ids. Refreshes every 30 seconds.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
            {topTotals.map(([key, label]) => (
              <div key={key} className="rounded-[12px] bg-inset px-3 py-3">
                <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-3">
                  {label}
                </div>
                <div className="font-serif text-[22px] text-ink">
                  {(totals[key] ?? 0).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
          {Object.keys(totals).length > 0 && (
            <div className="overflow-x-auto mb-5">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="text-ink-3 text-[11px] uppercase tracking-[0.06em]">
                    <th className="pb-2 font-semibold">Event</th>
                    <th className="pb-2 font-semibold text-right">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(totals)
                    .sort((a, b) => b[1] - a[1])
                    .map(([name, n]) => (
                      <tr key={name} className="border-t border-hairline">
                        <td className="py-1.5 text-ink">{labelEvent(name)}</td>
                        <td className="py-1.5 text-right tabular-nums text-ink-2">
                          {n.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
          {overview && Object.keys(overview.analytics.byPlatform).length > 0 && (
            <div className="mb-5">
              <h3 className="text-[12px] font-bold uppercase tracking-[0.06em] text-ink-3 mb-2">
                By platform
              </h3>
              <div className="flex flex-wrap gap-2">
                {Object.entries(overview.analytics.byPlatform).map(([platform, events]) => (
                  <div key={platform} className="rounded-[10px] border border-hairline px-3 py-2">
                    <div className="text-[13px] font-semibold text-ink capitalize">{platform}</div>
                    <div className="text-[12px] text-ink-3">
                      {(events['post.view'] ?? 0).toLocaleString()} views ·{' '}
                      {(events['post.save'] ?? 0).toLocaleString()} saves
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <h3 className="text-[12px] font-bold uppercase tracking-[0.06em] text-ink-3 mb-2">
            Top posts
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="text-ink-3 text-[11px] uppercase tracking-[0.06em]">
                  <th className="pb-2 font-semibold">Post</th>
                  <th className="pb-2 font-semibold text-right">Views</th>
                  <th className="pb-2 font-semibold text-right">Saves</th>
                  <th className="pb-2 font-semibold text-right">Shares</th>
                </tr>
              </thead>
              <tbody>
                {(overview?.analytics.topPosts ?? []).map((row) => (
                  <tr
                    key={`${row.platform}:${row.bookmarkId}`}
                    className="border-t border-hairline"
                  >
                    <td className="py-1.5">
                      <button
                        type="button"
                        className="text-clay font-semibold hover:underline"
                        onClick={() => {
                          const ref = `${row.platform}:${row.bookmarkId}`
                          setPostQuery(ref)
                          void loadPost(ref)
                        }}
                      >
                        {row.platform}:{row.bookmarkId}
                      </button>
                    </td>
                    <td className="py-1.5 text-right tabular-nums">{row.views}</td>
                    <td className="py-1.5 text-right tabular-nums">{row.saves}</td>
                    <td className="py-1.5 text-right tabular-nums">{row.shares}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {overview && overview.analytics.topPosts.length === 0 && (
              <p className="text-[13px] text-ink-3 py-3">No post events in this window yet.</p>
            )}
          </div>
        </section>

        <section className="bg-surface rounded-card border border-hairline shadow-m-sm p-5">
          <div className="flex items-center gap-3 mb-3">
            <Search className="h-[18px] w-[18px] text-clay" />
            <div>
              <h2 className="font-serif font-semibold text-base text-ink">Inspect a post</h2>
              <p className="text-[13px] text-ink-3">
                Paste an x.com / adhx.com URL or <code>platform:id</code>.
              </p>
            </div>
          </div>
          <form
            className="flex flex-col sm:flex-row gap-2 mb-4"
            onSubmit={(e) => {
              e.preventDefault()
              void loadPost(postQuery)
            }}
          >
            <input
              value={postQuery}
              onChange={(e) => setPostQuery(e.target.value)}
              placeholder="https://x.com/user/status/123 or twitter:123"
              className="flex-1 min-h-[44px] rounded-[12px] border border-hairline bg-inset px-3 text-base sm:text-sm text-ink"
            />
            <button
              type="submit"
              disabled={postLoading}
              className="min-h-[44px] px-4 rounded-[12px] bg-clay-grad text-white text-[13px] font-semibold"
            >
              {postLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Load'}
            </button>
          </form>
          {postError && <p className="text-sm text-red-600 mb-3">{postError}</p>}
          {post && (
            <div className="rounded-[12px] border border-hairline p-4 flex flex-col gap-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <Link
                    href={post.previewPath}
                    className="font-semibold text-ink hover:text-clay"
                    target="_blank"
                  >
                    {post.previewPath}
                  </Link>
                  <p className="text-[13px] text-ink-3">
                    {post.authorName || post.author || 'Unknown author'} · {post.platform} ·{' '}
                    {post.saverCount} saves · {post.pulseEvents} pulse events
                    {post.hidden ? ' · hidden from public' : ''}
                  </p>
                  {post.text && (
                    <p className="text-[14px] text-ink-2 mt-1 line-clamp-3">{post.text}</p>
                  )}
                </div>
                {post.hidden && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.06em] text-red-600 bg-red-500/10 px-2 py-1 rounded-full">
                    <EyeOff className="h-3 w-3" /> Hidden
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-2 text-[12px] text-ink-3">
                {Object.entries(post.analytics.totals).map(([name, n]) => (
                  <span key={name} className="rounded-full bg-inset px-2 py-1">
                    {labelEvent(name)} {n}
                  </span>
                ))}
                {Object.keys(post.analytics.totals).length === 0 && (
                  <span>No analytics events in this window.</span>
                )}
              </div>
              {post.publicPlaylists.length > 0 && (
                <p className="text-[13px] text-ink-2">
                  Public playlists:{' '}
                  {post.publicPlaylists.map((p) => `#${p.tag} (@${p.username})`).join(', ')}
                </p>
              )}
              <input
                value={hideReason}
                onChange={(e) => setHideReason(e.target.value)}
                placeholder="Reason (optional, stays private)"
                className="min-h-[44px] rounded-[12px] border border-hairline bg-inset px-3 text-base sm:text-sm"
              />
              <div className="flex flex-wrap gap-2">
                {post.hidden ? (
                  <button
                    type="button"
                    disabled={postBusy}
                    onClick={() => void togglePostHidden(false)}
                    className="min-h-[44px] px-4 rounded-[12px] border border-hairline text-[13px] font-semibold"
                  >
                    Restore to public
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={postBusy}
                    onClick={() => void togglePostHidden(true)}
                    className="min-h-[44px] px-4 rounded-[12px] bg-red-600 text-white text-[13px] font-semibold"
                  >
                    Hide from public
                  </button>
                )}
              </div>
              <p className="text-[12px] text-ink-3">
                Hide removes the post from trending, the theater pulse, the sitemap, and tombstones
                the preview page. User collections keep their own copy.
              </p>
            </div>
          )}
        </section>

        <section className="bg-surface rounded-card border border-hairline shadow-m-sm p-5">
          <div className="flex items-center gap-3 mb-3">
            <Ban className="h-[18px] w-[18px] text-clay" />
            <div>
              <h2 className="font-serif font-semibold text-base text-ink">Inspect a user</h2>
              <p className="text-[13px] text-ink-3">Look up by username. Ban signs them out.</p>
            </div>
          </div>
          <form
            className="flex flex-col sm:flex-row gap-2 mb-4"
            onSubmit={(e) => {
              e.preventDefault()
              void loadUser(userQuery)
            }}
          >
            <input
              value={userQuery}
              onChange={(e) => setUserQuery(e.target.value)}
              placeholder="username"
              className="flex-1 min-h-[44px] rounded-[12px] border border-hairline bg-inset px-3 text-base sm:text-sm text-ink"
            />
            <button
              type="submit"
              disabled={userLoading}
              className="min-h-[44px] px-4 rounded-[12px] bg-clay-grad text-white text-[13px] font-semibold"
            >
              {userLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Load'}
            </button>
          </form>
          {userError && <p className="text-sm text-red-600 mb-3">{userError}</p>}
          {user && (
            <div className="rounded-[12px] border border-hairline p-4 flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-ink">@{user.username}</p>
                <div className="flex flex-wrap gap-1.5">
                  {user.isAdmin && (
                    <span className="rounded-full bg-clay/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.06em] text-clay">
                      Admin
                    </span>
                  )}
                  {user.banned && (
                    <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.06em] text-red-600">
                      Banned
                    </span>
                  )}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[13px]">
                  <tbody>
                    {(
                      [
                        ['Display name', user.displayName || '—'],
                        ['Bookmarks', user.bookmarkCount.toLocaleString()],
                        ['Public playlists', user.publicPlaylistCount.toLocaleString()],
                        ['Joined', user.createdAt ? formatWhen(user.createdAt) : '—'],
                        ['Last sync', user.lastSyncAt ? formatWhen(user.lastSyncAt) : '—'],
                        ['X connected', user.identities.x ? 'Yes' : 'No'],
                        ['Email linked', user.identities.email ? 'Yes' : 'No'],
                        ['Role', user.isAdmin ? 'Admin' : 'User'],
                        ['Status', user.banned ? 'Banned' : 'Active'],
                        ...(user.banned
                          ? ([
                              ['Banned', user.bannedAt ? formatWhen(user.bannedAt) : '—'],
                              ['Ban reason', user.banReason || '—'],
                            ] as const)
                          : []),
                      ] as const
                    ).map(([label, value]) => (
                      <tr key={label} className="border-t border-hairline first:border-t-0">
                        <th className="w-[40%] py-2 pr-3 font-semibold text-ink-3 align-top">
                          {label}
                        </th>
                        <td className="py-2 text-ink tabular-nums">{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {user.banned ? (
                <button
                  type="button"
                  disabled={userBusy}
                  onClick={() => void toggleBan(false)}
                  className="self-start min-h-[44px] px-4 rounded-[12px] border border-hairline text-[13px] font-semibold"
                >
                  Unban
                </button>
              ) : (
                <div className="flex flex-col gap-2">
                  <input
                    value={banReason}
                    onChange={(e) => setBanReason(e.target.value)}
                    placeholder="Reason (optional, stays private)"
                    disabled={!!banBlockReason(user)}
                    className="min-h-[44px] rounded-[12px] border border-hairline bg-inset px-3 text-base sm:text-sm disabled:opacity-50"
                  />
                  <input
                    value={banConfirm}
                    onChange={(e) => setBanConfirm(e.target.value)}
                    placeholder={`Type ${user.username} to confirm`}
                    disabled={!!banBlockReason(user)}
                    className="min-h-[44px] rounded-[12px] border border-hairline bg-inset px-3 text-base sm:text-sm disabled:opacity-50"
                  />
                  <button
                    type="button"
                    disabled={userBusy || !!banBlockReason(user)}
                    onClick={() => void toggleBan(true)}
                    className="self-start min-h-[44px] px-4 rounded-[12px] bg-red-600 text-white text-[13px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Ban this account
                  </button>
                  {banBlockReason(user) && (
                    <p className="text-[12px] font-medium text-ink-2">{banBlockReason(user)}</p>
                  )}
                </div>
              )}
              <p className="text-[12px] text-ink-3">
                A ban keeps their data, signs them out, 404s their public profile and playlists, and
                drops them from the leaderboard.
              </p>
            </div>
          )}
        </section>

        <section className="bg-surface rounded-card border border-hairline shadow-m-sm p-5">
          <h2 className="font-serif font-semibold text-base text-ink mb-1">Hide a playlist</h2>
          <p className="text-[13px] text-ink-3 mb-3">
            Removes <code>/t/user/tag</code> from leaderboards. The curator&apos;s tag stays.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 mb-3">
            <input
              value={playlistUser}
              onChange={(e) => setPlaylistUser(e.target.value)}
              placeholder="username"
              className="flex-1 min-h-[44px] rounded-[12px] border border-hairline bg-inset px-3 text-base sm:text-sm"
            />
            <input
              value={playlistTag}
              onChange={(e) => setPlaylistTag(e.target.value)}
              placeholder="tag"
              className="flex-1 min-h-[44px] rounded-[12px] border border-hairline bg-inset px-3 text-base sm:text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={playlistBusy}
              onClick={() => void hidePlaylist(true)}
              className="min-h-[44px] px-4 rounded-[12px] bg-red-600 text-white text-[13px] font-semibold"
            >
              Hide from leaderboard
            </button>
            <button
              type="button"
              disabled={playlistBusy}
              onClick={() => void hidePlaylist(false)}
              className="min-h-[44px] px-4 rounded-[12px] border border-hairline text-[13px] font-semibold"
            >
              Restore
            </button>
          </div>
          {playlistMsg && <p className="text-[13px] text-ink-2 mt-3">{playlistMsg}</p>}
        </section>

        <section className="bg-surface rounded-card border border-hairline shadow-m-sm p-5">
          <h2 className="font-serif font-semibold text-base text-ink mb-3">Moderation lists</h2>
          <div className="grid sm:grid-cols-2 gap-5">
            <div>
              <h3 className="text-[12px] font-bold uppercase tracking-[0.06em] text-ink-3 mb-2">
                Hidden posts
              </h3>
              {(overview?.hiddenPosts ?? []).length === 0 ? (
                <p className="text-[13px] text-ink-3">None</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {overview!.hiddenPosts.map((row) => (
                    <li key={`${row.platform}:${row.bookmarkId}`}>
                      <button
                        type="button"
                        className="text-left text-[13px] text-clay font-semibold hover:underline"
                        onClick={() => {
                          const ref = `${row.platform}:${row.bookmarkId}`
                          setPostQuery(ref)
                          void loadPost(ref)
                        }}
                      >
                        {row.platform}:{row.bookmarkId}
                      </button>
                      <div className="text-[12px] text-ink-3">
                        {formatWhen(row.createdAt)}
                        {row.reason ? ` — ${row.reason}` : ''}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3 className="text-[12px] font-bold uppercase tracking-[0.06em] text-ink-3 mb-2">
                Banned users
              </h3>
              {(overview?.bannedUsers ?? []).length === 0 ? (
                <p className="text-[13px] text-ink-3">None</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {overview!.bannedUsers.map((row) => (
                    <li key={row.username}>
                      <button
                        type="button"
                        className="text-left text-[13px] text-clay font-semibold hover:underline"
                        onClick={() => {
                          setUserQuery(row.username)
                          void loadUser(row.username)
                        }}
                      >
                        @{row.username}
                      </button>
                      <div className="text-[12px] text-ink-3">
                        {formatWhen(row.createdAt)}
                        {row.reason ? ` — ${row.reason}` : ''}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <h3 className="text-[12px] font-bold uppercase tracking-[0.06em] text-ink-3 mt-5 mb-2">
            Recent admin actions
          </h3>
          {(overview?.recentAudit ?? []).length === 0 ? (
            <p className="text-[13px] text-ink-3">None yet</p>
          ) : (
            <ul className="flex flex-col gap-1.5 text-[13px] text-ink-2">
              {overview!.recentAudit.map((row, i) => (
                <li key={`${row.createdAt}-${i}`}>
                  <span className="font-semibold text-ink">{row.action}</span>
                  {row.target ? ` ${JSON.stringify(row.target)}` : ''}
                  <span className="text-ink-3">
                    {' '}
                    · {row.actorUsername || 'admin'} · {formatWhen(row.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="flex items-start gap-2 text-[12.5px] text-ink-3">
          <AlertTriangle className="h-4 w-4 flex-none mt-0.5" />
          <span>
            Hide and ban are reversible. They never delete a user&apos;s private collection. Access
            is limited to accounts with the persisted admin role.
          </span>
        </p>
        <p className="flex items-center gap-2 text-[12.5px] text-ink-3">
          <Shield className="h-3.5 w-3.5" />
          This page is not linked from public chrome. Only admins see it in Settings.
        </p>
      </div>
    </div>
  )
}
