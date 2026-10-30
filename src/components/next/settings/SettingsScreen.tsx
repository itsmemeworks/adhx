'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  AlertCircle,
  BookOpen,
  Bookmark,
  CheckCircle,
  Server,
  Smartphone,
  TriangleAlert,
  User,
  Users,
  X,
} from 'lucide-react'
import { notifyStatsUpdated } from '@/lib/client-events'
import { IosShortcutSettingsCard } from '@/components/IosShortcutInstall'
import { AndroidSettingsCard } from '@/components/AndroidInstall'
import { cn } from '@/lib/utils'
import { NxHeader } from '../channels/ChannelParts'
import {
  LEARNING_IN_HEADER,
  LearningPill,
  LearningSheet,
  useLearningStatus,
} from '../onboarding/learning'
import { useXSync } from '../onboarding/useXSync'
import { AccountCard, type AuthMe } from './AccountCard'
import { DangerZone } from './DangerZone'
import { PreferencesCard } from './PreferencesCard'
import { SECONDARY, SettingsCard } from './parts'
import { AccessKeysCard } from './AccessKeysCard'
import { PhoneAppCard } from './PhoneAppCard'
import { NewInviteCard, PeopleCard, usePeople } from './PeopleCard'
import { useInvites } from './InviteCard'
import { SyncCard, SyncHistoryCard, type SyncCounts, type SyncHistoryEntry } from './SyncCard'

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || '0.0.0'
const GITHUB_RELEASE_URL = `https://github.com/itsmemeworks/adhx/releases/tag/v${APP_VERSION}`

interface Cooldown {
  loaded: boolean
  canSync: boolean
  cooldownRemaining: number
  /** When the cooldown was read, so the countdown can tick locally. */
  fetchedAt: number
}

type Notice = { type: 'success' | 'error'; text: string }

const NO_COUNTS: SyncCounts = { lastSyncAt: null, xSynced: 0, xOnAdhx: 0, totalBookmarks: 0 }

/** What the address says happened (email confirmed, X link refused, …). */
function noticeFromParams(params: URLSearchParams): Notice | null {
  const authError = params.get('auth_error')
  if (params.get('email_changed')) return { type: 'success', text: 'Email updated.' }
  if (authError === 'email_in_use')
    return { type: 'error', text: 'That email is already linked to another account.' }
  if (authError === 'x_already_linked')
    return { type: 'error', text: 'That X account is already linked to another account.' }
  if (authError === 'x_link_only')
    return { type: 'error', text: 'Sign in with email first, then connect X here.' }
  if (authError) return { type: 'error', text: 'Something went wrong signing you in.' }
  const success = params.get('success')
  if (success) return { type: 'success', text: success }
  const error = params.get('error')
  if (error) return { type: 'error', text: error }
  return null
}

/**
 * Settings in the redesign. `?sync=1` (the account menu's "Sync X
 * bookmarks", and coming back from connecting X) jumps to the X card and
 * starts a sync when one is allowed.
 */
export function SettingsScreen() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const [me, setMe] = useState<AuthMe | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [history, setHistory] = useState<SyncHistoryEntry[]>([])
  const [counts, setCounts] = useState<SyncCounts>(NO_COUNTS)
  const [historyLoading, setHistoryLoading] = useState(true)
  const [cooldown, setCooldown] = useState<Cooldown>({
    loaded: false,
    canSync: true,
    cooldownRemaining: 0,
    fetchedAt: 0,
  })
  const [waitMs, setWaitMs] = useState(0)
  const [learningOpen, setLearningOpen] = useState(false)
  const [active, setActive] = useState('#you')

  const sync = useXSync()
  const learning = useLearningStatus({ fast: learningOpen || sync.status === 'running' })

  const query = searchParams.toString()
  useEffect(() => {
    setNotice(noticeFromParams(new URLSearchParams(query)))
  }, [query])

  const fetchMe = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me')
      setMe((await res.json()) as AuthMe)
    } catch {
      setMe({
        authenticated: false,
        user: null,
        identities: { x: null, email: null },
        xConnected: false,
      })
    }
  }, [])

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const res = await fetch('/api/sync/history')
      const data = await res.json()
      setHistory(data.syncs || [])
      setCounts({
        lastSyncAt: data.lastSyncAt ?? null,
        xSynced: data.xSynced ?? 0,
        xOnAdhx: data.xOnAdhx ?? 0,
        totalBookmarks: data.totalBookmarks ?? 0,
      })
    } catch {
      // Keep what's shown.
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  const fetchCooldown = useCallback(async () => {
    try {
      const res = await fetch('/api/sync/cooldown')
      const data = await res.json()
      setCooldown({
        loaded: true,
        canSync: !!data.canSync,
        cooldownRemaining: data.cooldownRemaining ?? 0,
        fetchedAt: Date.now(),
      })
    } catch {
      setCooldown((c) => ({ ...c, loaded: true }))
    }
  }, [])

  useEffect(() => {
    void fetchMe()
    void fetchHistory()
  }, [fetchMe, fetchHistory])

  const xConnected = !!me?.xConnected
  useEffect(() => {
    if (!xConnected) return
    void fetchCooldown()
    const t = setInterval(() => void fetchCooldown(), 30_000)
    return () => clearInterval(t)
  }, [xConnected, fetchCooldown])

  // Tick the wait down every second, then re-check once it reaches zero.
  useEffect(() => {
    if (cooldown.canSync) {
      setWaitMs(0)
      return
    }
    const left = () => Math.max(0, cooldown.cooldownRemaining - (Date.now() - cooldown.fetchedAt))
    setWaitMs(left())
    const t = setInterval(() => {
      const remaining = left()
      setWaitMs(remaining)
      if (remaining <= 0) {
        clearInterval(t)
        void fetchCooldown()
      }
    }, 1000)
    return () => clearInterval(t)
  }, [cooldown.canSync, cooldown.cooldownRemaining, cooldown.fetchedAt, fetchCooldown])

  // A finished sync refreshes the counts, history and the hour's wait.
  useEffect(() => {
    if (sync.status !== 'done') return
    void fetchHistory()
    void fetchCooldown()
    notifyStatsUpdated()
  }, [sync.status, fetchHistory, fetchCooldown])

  // `?sync=1`: go to the X card and start, once we know whether we can.
  const wantSync = searchParams.get('sync') === '1'
  const handledSync = useRef(false)
  useEffect(() => {
    if (!wantSync) {
      handledSync.current = false
      return
    }
    if (handledSync.current || !me) return
    if (me.xConnected && !cooldown.loaded) return
    handledSync.current = true
    document.getElementById('sync')?.scrollIntoView?.({ block: 'start' })
    if (me.xConnected && cooldown.canSync && sync.status !== 'running') sync.start()
    router.replace('/settings', { scroll: false })
  }, [wantSync, me, cooldown.loaded, cooldown.canSync, sync, router])

  const people = usePeople()
  const invites = useInvites()
  const waiting = people.data?.requests?.length ?? 0
  const showSync = !!me && (me.xConnected || me.xAvailable !== false)
  const sections: {
    href: string
    label: string
    icon: typeof User
    badge?: number
    danger?: boolean
  }[] = [
    { href: '#you', label: 'You', icon: User },
    { href: '#people', label: 'Your people', icon: Users, badge: waiting },
    { href: '#phone-app', label: 'Phone app', icon: Smartphone },
    { href: '#preferences', label: 'Watching and reading', icon: BookOpen },
    ...(showSync ? [{ href: '#sync', label: 'Your X bookmarks', icon: Bookmark }] : []),
    { href: '#danger', label: 'Danger zone', icon: TriangleAlert, danger: true },
  ]

  return (
    <div className="min-h-dvh bg-nx-bg font-nx-sans text-nx-cream">
      <NxHeader>
        <LearningPill
          status={learning.status}
          onOpen={() => setLearningOpen(true)}
          className={LEARNING_IN_HEADER}
        />
      </NxHeader>

      <main className="mx-auto w-full max-w-[1280px] px-4 pb-16 pt-3 md:px-8 md:pt-5 lg:grid lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-x-[26px]">
        <aside className="hidden lg:sticky lg:top-[92px] lg:flex lg:h-[calc(100dvh-112px)] lg:flex-col lg:gap-3.5 lg:self-start">
          <span aria-hidden className="mb-1.5 mt-1 font-nx-serif text-[52px] leading-[0.95]">
            Settings
          </span>
          <nav aria-label="Settings sections" className="flex flex-col gap-1">
            {sections.map(({ href, label, icon: Icon, badge, danger }) => (
              <a
                key={href}
                href={href}
                aria-current={active === href ? 'true' : undefined}
                onClick={() => setActive(href)}
                className={cn(
                  'flex h-11 items-center gap-2.5 whitespace-nowrap rounded-full px-3.5 text-[15px]',
                  active === href
                    ? 'bg-nx-plate font-extrabold text-nx-cream'
                    : danger
                      ? 'font-semibold text-nx-live hover:bg-white/5'
                      : 'font-semibold text-nx-ink-soft hover:bg-white/5 hover:text-nx-ink',
                )}
              >
                <Icon aria-hidden className="h-[18px] w-[18px] shrink-0" />
                <span>{label}</span>
                {!!badge && (
                  <span
                    aria-label={`${badge} waiting`}
                    className="ml-auto inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-nx-accent px-[7px] text-xs font-extrabold text-black"
                  >
                    {badge}
                  </span>
                )}
              </a>
            ))}
          </nav>
          <div className="mt-auto flex flex-col gap-1.5 rounded-[20px] border border-white/[0.08] bg-nx-surface p-4">
            <span className="flex items-center gap-2 text-[13px] font-extrabold">
              <Server aria-hidden className="h-4 w-4 text-nx-accent" />
              <span>On your server</span>
            </span>
            <span className="text-[13px] leading-snug text-nx-ink-faint">
              No ads, no tracking, no algorithm. Just your lot.
            </span>
          </div>
        </aside>

        <div className="flex min-w-0 flex-col gap-5">
          <div className="flex flex-col gap-1.5 lg:sr-only">
            <h1 className="m-0 font-nx-serif text-[44px] font-normal leading-none md:text-[56px]">
              Settings
            </h1>
            <p className="m-0 text-[15px] text-nx-ink/60">
              You, your people, your phone, and how you watch and read.
            </p>
          </div>

          {notice && (
            <div
              role={notice.type === 'error' ? 'alert' : 'status'}
              className={cn(
                'flex items-center gap-3 rounded-2xl px-4 py-3 text-[15px] font-semibold',
                notice.type === 'success'
                  ? 'bg-nx-good/12 text-nx-good'
                  : 'bg-nx-danger/12 text-nx-danger',
              )}
            >
              {notice.type === 'success' ? (
                <CheckCircle aria-hidden className="h-5 w-5 shrink-0" />
              ) : (
                <AlertCircle aria-hidden className="h-5 w-5 shrink-0" />
              )}
              <span className="min-w-0 flex-1">{notice.text}</span>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => setNotice(null)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-white/10"
              >
                <X aria-hidden className="h-4 w-4" />
              </button>
            </div>
          )}

          {me === null ? (
            <div aria-hidden className="flex flex-col gap-5">
              {[0, 1].map((i) => (
                <span key={i} className="nx-shimmer animate-nx-shimmer block h-56 rounded-[22px]" />
              ))}
            </div>
          ) : (
            <>
              <NewInviteCard inv={invites} />
              <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 xl:grid-cols-[310px_minmax(0,1fr)] xl:gap-[26px]">
                <AccountCard me={me} refresh={() => void fetchMe()} />
                <PeopleCard
                  data={people.data}
                  reload={() => void people.reload()}
                  invites={invites}
                />
              </div>
              <div className="flex max-w-[760px] flex-col gap-5">
                <PhoneAppCard />
                <AccessKeysCard />
              </div>
            </>
          )}

          <div className="flex max-w-[760px] flex-col gap-5">
            {me?.isAdmin && (
              <SettingsCard
                title="Admin"
                sub="Numbers, hidden posts and banned accounts."
                right={
                  <Link href="/admin" className={SECONDARY}>
                    Open
                  </Link>
                }
              />
            )}

            <IosShortcutSettingsCard />
            <AndroidSettingsCard />

            <PreferencesCard />

            {me && showSync && (
              <>
                <SyncCard
                  xConnected={me.xConnected}
                  xIdentity={me.identities.x}
                  refreshMe={() => void fetchMe()}
                  sync={sync}
                  learning={learning.status}
                  canSync={cooldown.canSync}
                  waitMs={waitMs}
                  counts={counts}
                />
                <SyncHistoryCard syncs={history} loading={historyLoading} />
              </>
            )}

            <DangerZone
              onCleared={() => {
                setNotice({
                  type: 'success',
                  text: 'Your data is cleared. You’re still signed in.',
                })
                setHistory([])
                setCounts(NO_COUNTS)
                notifyStatsUpdated()
              }}
              onError={(text) => setNotice({ type: 'error', text })}
            />

            <footer className="flex flex-col items-center gap-2 pt-4 text-[13px] text-nx-ink/45">
              <a
                href={GITHUB_RELEASE_URL}
                className="underline-offset-2 hover:text-nx-ink hover:underline"
              >
                {`ADHX v${APP_VERSION}`}
              </a>
              <span className="flex gap-3">
                <a href="/privacy" className="underline-offset-2 hover:text-nx-ink hover:underline">
                  Privacy
                </a>
                <a
                  href="https://github.com/itsmemeworks/adhx/blob/main/SECURITY.md"
                  className="underline-offset-2 hover:text-nx-ink hover:underline"
                >
                  Security
                </a>
              </span>
            </footer>
          </div>
        </div>
      </main>

      {learningOpen && (
        <LearningSheet status={learning.status} onClose={() => setLearningOpen(false)} />
      )}
    </div>
  )
}
