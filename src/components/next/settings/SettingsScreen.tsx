'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AlertCircle, CheckCircle, X } from 'lucide-react'
import { notifyStatsUpdated } from '@/lib/client-events'
import { IosShortcutSettingsCard } from '@/components/IosShortcutInstall'
import { AndroidSettingsCard } from '@/components/AndroidInstall'
import { cn } from '@/lib/utils'
import { NxHeader } from '../channels/ChannelParts'
import { LearningPill, LearningSheet, useLearningStatus } from '../onboarding/learning'
import { useXSync } from '../onboarding/useXSync'
import { AccountCard, type AuthMe } from './AccountCard'
import { DangerZone } from './DangerZone'
import { PreferencesCard } from './PreferencesCard'
import { SECONDARY, SettingsCard } from './parts'
import { AccessKeysCard } from './AccessKeysCard'
import { PhoneAppCard } from './PhoneAppCard'
import { InviteCard } from './InviteCard'
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

  return (
    <div className="min-h-dvh bg-black font-nx-sans text-white">
      <NxHeader>
        <LearningPill status={learning.status} onOpen={() => setLearningOpen(true)} />
      </NxHeader>

      <main className="mx-auto flex w-full max-w-[720px] flex-col gap-5 px-4 pb-16 pt-3 md:px-7 md:pt-6">
        <div className="flex flex-col gap-1.5">
          <h1 className="m-0 font-nx-serif text-[44px] font-normal leading-none md:text-[56px]">
            Settings
          </h1>
          <p className="m-0 text-[15px] text-white/60">
            Your account, your phone, and how you watch and read.
          </p>
        </div>

        {notice && (
          <div
            role={notice.type === 'error' ? 'alert' : 'status'}
            className={cn(
              'flex items-center gap-3 rounded-2xl px-4 py-3 text-[15px] font-semibold',
              notice.type === 'success'
                ? 'bg-[#7ddc8a]/12 text-[#7ddc8a]'
                : 'bg-[#ff8a7a]/12 text-[#ff8a7a]',
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
            {(me.xConnected || me.xAvailable !== false) && (
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
            <AccountCard me={me} refresh={() => void fetchMe()} />
            <PhoneAppCard />
            <InviteCard />
            <AccessKeysCard />
          </>
        )}

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

        <DangerZone
          onCleared={() => {
            setNotice({ type: 'success', text: 'Your data is cleared. You’re still signed in.' })
            setHistory([])
            setCounts(NO_COUNTS)
            notifyStatsUpdated()
          }}
          onError={(text) => setNotice({ type: 'error', text })}
        />

        <footer className="flex flex-col items-center gap-2 pt-4 text-[13px] text-white/45">
          <a
            href={GITHUB_RELEASE_URL}
            className="underline-offset-2 hover:text-white hover:underline"
          >
            {`ADHX v${APP_VERSION}`}
          </a>
          <span className="flex gap-3">
            <a href="/privacy" className="underline-offset-2 hover:text-white hover:underline">
              Privacy
            </a>
            <a
              href="https://github.com/itsmemeworks/adhx/blob/main/SECURITY.md"
              className="underline-offset-2 hover:text-white hover:underline"
            >
              Security
            </a>
          </span>
        </footer>
      </main>

      {learningOpen && (
        <LearningSheet status={learning.status} onClose={() => setLearningOpen(false)} />
      )}
    </div>
  )
}
