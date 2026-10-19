'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Check, LogOut, RefreshCw } from 'lucide-react'
import { resolveAccountAvatarSrc } from '@/lib/avatar/generated-avatar'
import { GobShape } from '../GobShape'
import { NxImage, XLogo } from '../primitives'
import { learningSummary, type LearningStatus } from '../onboarding/learning'
import type { XSyncState } from '../onboarding/useXSync'
import { usePreferences } from '@/lib/preferences-context'
import {
  PRIMARY,
  SECONDARY,
  SettingRow,
  SettingsCard,
  Switch,
  formatWait,
  timeSince,
} from './parts'

/** Connecting X comes back here and starts the import straight away. */
export const CONNECT_X_URL = `/api/auth/twitter?returnUrl=${encodeURIComponent('/settings?sync=1')}`

export interface SyncCounts {
  lastSyncAt: string | null
  /** X bookmarks brought in by syncing. */
  xSynced: number
  /** X posts saved any way (sync, paste, share). */
  xOnAdhx: number
  totalBookmarks: number
}

export interface SyncHistoryEntry {
  id: string
  startedAt: string
  completedAt: string | null
  status: string
  newBookmarks: number
  totalFetched: number
  /** `auto` for the hourly sync; `manual` (or null on older rows) for the button. */
  triggerType?: string | null
}

const pct = (n: number, of: number) => Math.round((n / Math.max(1, of)) * 100)

function Bar({
  label,
  value,
  tone,
}: {
  label: string
  /** 0–100, or null while the total isn't known yet. */
  value: number | null
  tone: 'white' | 'accent'
}) {
  return (
    <span
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value ?? undefined}
      className="block h-2 overflow-hidden rounded bg-white/10"
    >
      {value === null ? (
        <span className="nx-shimmer animate-nx-shimmer block h-2 w-full" />
      ) : (
        <span
          className={`block h-2 rounded transition-[width] ${tone === 'white' ? 'bg-white' : 'bg-nx-accent'}`}
          style={{ width: `${value}%` }}
        />
      )}
    </span>
  )
}

function SyncProgressBlock({
  sync,
  learning,
}: {
  sync: XSyncState
  learning: LearningStatus | null
}) {
  const words = learningSummary(learning).rows.find((r) => r.id === 'words')
  const imported = sync.processed
  return (
    <div className="flex flex-col gap-3.5 rounded-[18px] bg-black p-4 md:p-5" role="status">
      <div className="flex items-baseline gap-2.5">
        <span className="font-nx-serif text-[56px] leading-[0.9] tabular-nums">
          {String(imported)}
        </span>
        <span className="text-sm text-white/65">bookmarks in so far</span>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="flex justify-between gap-3 text-[13px]">
          <span className="font-bold">Bringing them in from X</span>
          <span className="text-right text-white/65">
            {sync.total
              ? `${imported} of ${sync.total}`
              : `Looking through your bookmarks${sync.found ? ` · ${sync.found} found` : ''}`}
          </span>
        </span>
        <Bar
          label="Bringing in your X bookmarks"
          value={sync.total ? pct(imported, sync.total) : null}
          tone="white"
        />
      </div>
      {words && (
        <div className="flex flex-col gap-1.5">
          <span className="flex justify-between gap-3 text-[13px]">
            <span className="font-bold">Making them searchable</span>
            <span className="text-white/65">{`${words.done} of ${words.total}`}</span>
          </span>
          <Bar
            label="Making your saves searchable"
            value={pct(words.done, words.total)}
            tone="accent"
          />
        </div>
      )}
      {sync.thumbs.length > 0 && (
        <div aria-hidden className="grid grid-cols-6 gap-1">
          {sync.thumbs.map((t) => (
            <span
              key={t.id}
              className="relative block h-12 animate-nx-pop overflow-hidden rounded-md bg-[#1c1b19]"
            >
              {t.img && (
                <NxImage
                  src={t.img}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                />
              )}
            </span>
          ))}
        </div>
      )}
      <span className="text-sm text-white/75">Keep this page open until it finishes.</span>
    </div>
  )
}

function Count({ n, label }: { n: number; label: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-2xl bg-black/40 px-3 py-3">
      <span className="font-nx-serif text-[28px] leading-none tabular-nums">{String(n)}</span>
      <span className="text-xs leading-snug text-white/55">{label}</span>
    </div>
  )
}

/**
 * The X bookmarks card: connect X, sync with live progress (`useXSync`, the
 * same stream /start uses), the once-an-hour wait, and what's been brought in.
 */
export function SyncCard({
  xConnected,
  xIdentity,
  refreshMe,
  sync,
  learning,
  canSync,
  waitMs,
  counts,
}: {
  xConnected: boolean
  xIdentity: { username: string; avatarUrl?: string | null } | null
  refreshMe: () => void
  sync: XSyncState & { start: () => void }
  learning: LearningStatus | null
  canSync: boolean
  waitMs: number
  counts: SyncCounts
}) {
  const { preferences, updatePreference, loading: prefsLoading } = usePreferences()
  const [autoSaving, setAutoSaving] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [disconnectError, setDisconnectError] = useState<string | null>(null)

  async function disconnect() {
    if (!window.confirm('Disconnect your X account? You can reconnect any time.')) return
    setDisconnecting(true)
    setDisconnectError(null)
    try {
      const res = await fetch('/api/auth/twitter/disconnect', { method: 'POST' })
      if (res.ok) {
        refreshMe()
      } else {
        const data = await res.json().catch(() => ({}))
        setDisconnectError(data.error || 'Couldn’t disconnect. Try again.')
      }
    } catch {
      setDisconnectError('Couldn’t disconnect. Try again.')
    } finally {
      setDisconnecting(false)
    }
  }

  const running = sync.status === 'running'
  const auto = preferences.autoSync

  async function toggleAuto() {
    if (prefsLoading || autoSaving) return
    setAutoSaving(true)
    try {
      await updatePreference('autoSync', !auto)
    } finally {
      setAutoSaving(false)
    }
  }

  return (
    <SettingsCard
      id="sync"
      title="Your X bookmarks"
      sub={
        xConnected
          ? 'Bookmark something on X and it shows up here.'
          : 'Connect X and we’ll bring in your bookmarks, so you can watch and search them here.'
      }
      tone="accent"
    >
      {xIdentity && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <GobShape size={44}>
              <img
                src={resolveAccountAvatarSrc({
                  avatarSource: 'x',
                  xAvatarUrl: xIdentity.avatarUrl,
                  username: xIdentity.username,
                })}
                alt=""
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
              />
            </GobShape>
            <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
              <span className="max-w-full truncate text-[15px] font-bold">{`@${xIdentity.username}`}</span>
              <span className="rounded-full bg-[#7ddc8a]/15 px-2 py-0.5 text-[11px] font-bold text-[#7ddc8a]">
                Connected
              </span>
            </div>
            <button
              type="button"
              onClick={() => void disconnect()}
              disabled={disconnecting || running}
              className={SECONDARY}
            >
              {disconnecting ? (
                <RefreshCw aria-hidden className="h-4 w-4 animate-spin" />
              ) : (
                <LogOut aria-hidden className="h-4 w-4" />
              )}
              <span>Disconnect</span>
            </button>
          </div>
          {disconnectError && (
            <p role="alert" className="m-0 text-[13px] text-[#ff8a7a]">
              {disconnectError}
            </p>
          )}
        </div>
      )}

      {!xConnected ? (
        <div className="flex flex-col gap-3">
          <p className="m-0 text-sm leading-relaxed text-white/70">
            We only read your bookmarks. We never post for you.
          </p>
          <a href={CONNECT_X_URL} className={PRIMARY}>
            <span>Connect X</span>
            <XLogo className="h-4 w-4" />
          </a>
        </div>
      ) : (
        <>
          <SettingRow
            label="Bring in new bookmarks automatically"
            hint="We check X about every hour, so anything you bookmark there is here within the hour."
          >
            <Switch
              label="Bring in new bookmarks automatically"
              checked={auto}
              onChange={() => void toggleAuto()}
              disabled={prefsLoading || autoSaving}
              busy={autoSaving}
            />
          </SettingRow>

          {running && <SyncProgressBlock sync={sync} learning={learning} />}

          {sync.status === 'done' && (
            <div className="flex flex-col gap-3 rounded-[18px] bg-black p-4" role="status">
              <span className="flex items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 animate-nx-pop items-center justify-center rounded-full bg-nx-accent text-black">
                  <Check aria-hidden className="h-4 w-4" strokeWidth={3.2} />
                </span>
                <span className="text-[17px] font-extrabold">
                  {sync.added > 0
                    ? `Done. ${sync.added} new ${sync.added === 1 ? 'bookmark' : 'bookmarks'}.`
                    : 'Done. You already had all of them.'}
                </span>
              </span>
              {sync.added > 0 && (
                <Link href="/play?recent=1" className={PRIMARY}>
                  Watch the newest
                </Link>
              )}
            </div>
          )}

          {sync.status === 'error' && (
            <div className="flex flex-col gap-2 rounded-[18px] bg-black p-4" role="alert">
              <span className="font-nx-serif text-[24px] leading-none">
                That sync didn’t finish
              </span>
              {sync.error && <span className="text-sm text-white/70">{sync.error}</span>}
              {sync.errorCode === 'reauth' && (
                <a href={CONNECT_X_URL} className={`${PRIMARY} mt-1`}>
                  <span>Reconnect X</span>
                  <XLogo className="h-4 w-4" />
                </a>
              )}
            </div>
          )}

          {!running &&
            sync.errorCode !== 'reauth' &&
            (canSync ? (
              <button type="button" onClick={sync.start} className={`${PRIMARY} w-full`}>
                <RefreshCw aria-hidden className="h-[18px] w-[18px]" />
                <span>{sync.status === 'error' ? 'Try again' : 'Sync X bookmarks'}</span>
              </button>
            ) : (
              <p className="m-0 rounded-full border border-white/15 px-4 py-3 text-center text-sm text-white/75">
                {`You can sync again in ${formatWait(waitMs)}.`}
              </p>
            ))}

          <p className="m-0 text-[13px] text-white/55">
            {`${counts.lastSyncAt ? `Last synced ${timeSince(counts.lastSyncAt)}.` : 'Not synced yet.'} You can sync everything by hand again a minute after the last sync.`}
          </p>
        </>
      )}

      <div className="grid grid-cols-3 gap-2">
        <Count n={counts.xSynced} label="brought in from X" />
        <Count n={counts.xOnAdhx} label="X posts saved" />
        <Count n={counts.totalBookmarks} label="saves in all" />
      </div>
    </SettingsCard>
  )
}

function formatWhen(dateStr: string) {
  const d = new Date(dateStr)
  const month = d.toLocaleString('en-US', { month: 'short' })
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${month} ${d.getDate()}, ${hh}:${mm}`
}

export function SyncHistoryCard({
  syncs,
  loading,
}: {
  syncs: SyncHistoryEntry[]
  loading: boolean
}) {
  return (
    <SettingsCard id="sync-history" title="Past syncs" sub="Your last five.">
      {loading ? (
        <div aria-hidden className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <span key={i} className="nx-shimmer animate-nx-shimmer block h-12 rounded-2xl" />
          ))}
        </div>
      ) : syncs.length === 0 ? (
        <p className="m-0 py-4 text-center text-sm text-white/55">No syncs yet.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {syncs.map((log) => (
            <li
              key={log.id}
              className="flex items-center gap-3 rounded-2xl bg-black/40 px-4 py-3 text-sm"
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-bold">{formatWhen(log.startedAt)}</span>
                <span className="text-xs text-white/55">
                  {log.triggerType === 'auto' ? 'Automatic' : 'By hand'}
                </span>
              </span>
              <span className="whitespace-nowrap font-bold text-nx-accent">{`+${log.newBookmarks} new`}</span>
              <span className="whitespace-nowrap text-white/55">{`${log.totalFetched} checked`}</span>
            </li>
          ))}
        </ul>
      )}
    </SettingsCard>
  )
}
