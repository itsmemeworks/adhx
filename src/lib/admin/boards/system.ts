import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  keepBackfill,
  keepEnabled,
  keepMinFreeBytes,
  mediaDir,
  ytdlpCookies,
  ytdlpPath,
} from '@/lib/keep/config'
import { keepWorkerStatus } from '@/lib/keep/worker'
import { ffmpegPath } from '@/lib/media/ffmpeg'
import { indexingPaused, remoteProcessing } from '@/lib/processing/config'
import { workerSetupProblem, type WorkerRefusal } from '@/lib/processing/auth'
import { newWorkPaused } from '@/lib/processing/pause'
import {
  remoteWorkerConnected,
  workerLastRefused,
  workerLastSeen,
  workersSeen,
} from '@/lib/processing/presence'
import { PROCESSING_PROTOCOL } from '@/lib/processing/protocol'
import { REFUSAL_WORDS, claimProblemWords } from '@/lib/processing/refusal-words'
import { appUrl } from '@/lib/routes/app-url'
import { signInDelivery } from '@/lib/email/magic-link'
import { SEMANTIC_MODEL_VERSION, modelCacheDir, semanticEnabled } from '@/lib/semantic/config'
import { jobActivity, semanticStatus, type ChildStatus } from '@/lib/semantic/supervisor'
import { serviceCalls, type ServiceCallStats } from '@/lib/ops/service-calls'
import {
  extra,
  extrasView,
  isExtraName,
  type ExtraView,
  type SettingGroup,
} from '@/lib/settings/extras'
import { inviteMode } from '@/lib/auth/invites'
import { channelImagesEnabled } from '@/lib/semantic/jev-images'
import { bytesLabel } from '@/lib/format/bytes'
import { diskSpace, num } from '../shared'

/**
 * Admin → System: is this ADHX actually working, and how is it set up?
 *
 * One plain check per moving part (each queue, the Mac helper, the
 * background processes, the tools and the setup), each with what to do when
 * it isn't right, then every setting once: the ones an admin can change here
 * and the ones only the environment changes. Secrets are only ever "Set" or
 * "Not set".
 *
 * "Waiting" counts only what the worker would pick up now (same rules as its
 * claim), so a backlog left alone on purpose (backfill off, a retry time not
 * reached) never reads as stuck.
 */

export type CheckState = 'ok' | 'warn' | 'bad' | 'off'

export interface HealthCheck {
  id: string
  group: 'Queues' | 'Workers' | 'Services' | 'Setup'
  title: string
  state: CheckState
  /** One line: what's true now. */
  summary: string
  /** What to do about it, when something isn't right. */
  fix: string | null
}

export interface QueueHealth {
  id: 'downloads' | 'conversions' | 'understanding'
  title: string
  /** Where the work runs: "this server" or "the Mac helper". */
  where: string
  state: CheckState
  summary: string
  /** Ready to start now. */
  waiting: number
  /** Waiting for a retry time. */
  retrying: number
  working: number
  /** Held by a worker whose lease ran out; picked up again on the next claim. */
  stuck: number
  /** Gave up or failed for good; Processing → Retry failed. */
  failed: number
  oldestWaitingAt: string | null
  lastDoneAt: string | null
  doneLastHour: number
  doneLastDay: number
  /** Finished in each of the last 24 hours, oldest first. */
  hourly: number[]
}

export interface HelperView {
  mode: 'remote' | 'local'
  connected: boolean
  lastSeenAt: string | null
  /** The setup reason a helper would be refused, or null when one could connect. */
  setupProblem: Exclude<WorkerRefusal, 'no_token' | 'wrong_token'> | null
  lastRefused: { reason: WorkerRefusal; at: string; count: number } | null
  workers: {
    workerId: string
    model: string
    protocol: number
    kinds: string[] | null
    lastClaimAt: string
    /** Jobs it holds right now. */
    leases: number
    /** Why its last ask for work was refused, in plain words, else null. */
    problem: string | null
  }[]
  serverProtocol: number
}

export interface ProcessView {
  id: string
  title: string
  state: CheckState
  summary: string
}

export interface SettingView {
  label: string
  /** The variable it comes from, when there is one. */
  name: string | null
  /** The value in use, in words; secrets are only "Set" or "Not set". */
  value: string
  /** Saved here, from the environment, or this server's default. */
  source: 'admin' | 'env' | 'default'
  /** How to change it here; null when only the environment can (read at startup). */
  edit: ExtraView | null
  /** Where it's changed instead, for a value worked out from others. */
  note?: string
}

export interface SettingGroupView {
  group: SettingGroup
  /** A test button for the group's service. */
  test: 'jev' | 'email' | null
  rows: SettingView[]
}

export interface ServiceView {
  id: 'jev' | 'email' | 'fxtwitter' | 'x' | 'sentry' | 'ytdlp'
  name: string
  /** What ADHX uses it for. */
  usedFor: string
  state: CheckState
  summary: string
  /** Per purpose, for a service used more than one way (Jev). */
  calls: (Omit<ServiceCallStats, 'lastOkAt' | 'lastFailedAt'> & {
    lastOkAt: string | null
    lastFailedAt: string | null
  })[]
}

/** How much was left in each queue, sampled every five minutes since the server started. */
export interface BacklogSample {
  at: string
  downloads: number
  conversions: number
  understanding: number
}

export interface SystemBoard {
  overall: CheckState
  checks: HealthCheck[]
  queues: QueueHealth[]
  helper: HelperView
  processes: ProcessView[]
  services: ServiceView[]
  backlog: BacklogSample[]
  /** Every setting once, grouped; secrets never included. */
  settings: SettingGroupView[]
  host: {
    /** SERVER_LABEL, e.g. "UGREEN NAS", else the machine's name. */
    label: string
    hostname: string
    cpu: string
    cores: number
    memory: { total: number; free: number }
    load: number[]
    container: boolean
    /** This web process's memory. */
    processMemory: number
  }
  server: {
    version: string
    node: string
    platform: string
    startedAt: string
  }
}

const MIN = 60_000
const HOUR = 60 * MIN
/** Waiting this long with nothing finishing reads as stalled. */
export const STALLED_AFTER_MS = 15 * MIN
/** A lease this far past its end is a worker that stopped mid-job. */
const STUCK_AFTER_MS = 10 * MIN

const one = (query: ReturnType<typeof sql>): number => num(db.all<{ n: number }>(query)[0]?.n)
const first = <T>(query: ReturnType<typeof sql>): T | undefined => db.all<T>(query)[0]

function iso(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function minutes(ms: number): string {
  const m = Math.max(1, Math.round(ms / MIN))
  if (m < 90) return m === 1 ? '1 minute' : `${m} minutes`
  const h = Math.round(m / 60)
  if (h < 48) return h === 1 ? '1 hour' : `${h} hours`
  const d = Math.round(h / 24)
  return d === 1 ? '1 day' : `${d} days`
}

/** Count timestamps into the last 24 hours, oldest hour first. */
export function hourlyCounts(times: (string | null)[], now: number): number[] {
  const out = new Array<number>(24).fill(0)
  for (const t of times) {
    if (!t) continue
    const age = now - Date.parse(t)
    if (!(age >= 0 && age < 24 * HOUR)) continue
    out[23 - Math.floor(age / HOUR)]++
  }
  return out
}

const WORST: CheckState[] = ['bad', 'warn', 'ok', 'off']
export function worst(states: CheckState[]): CheckState {
  for (const s of WORST) if (states.includes(s)) return s
  return 'ok'
}

/** The saves cutoff when older saves are left alone (KEEP_BACKFILL=off). */
function backfillCutoff(): string | null {
  if (keepBackfill()) return null
  try {
    return (
      first<{ value: string }>(sql`SELECT value FROM keep_settings WHERE key = 'backfill_cutoff'`)
        ?.value ?? null
    )
  } catch {
    return null
  }
}

/**
 * The one shared reading of a queue's numbers: stalled, waiting on
 * something, failing, or fine.
 */
export function judgeQueue(
  q: Omit<QueueHealth, 'state' | 'summary' | 'hourly'>,
  now: number,
  blocked: { state: CheckState; summary: string } | null,
): { state: CheckState; summary: string } {
  if (blocked && (q.waiting > 0 || blocked.state === 'off')) return blocked
  const oldest = q.oldestWaitingAt ? now - Date.parse(q.oldestWaitingAt) : 0
  const sinceDone = q.lastDoneAt ? now - Date.parse(q.lastDoneAt) : Infinity
  if (q.waiting > 0 && q.working === 0 && oldest > STALLED_AFTER_MS && sinceDone > STALLED_AFTER_MS)
    return {
      state: 'bad',
      summary: `Stalled: ${q.waiting} waiting for ${minutes(oldest)} and nothing has started${
        q.lastDoneAt ? `; the last one finished ${minutes(sinceDone)} ago` : ''
      }.`,
    }
  if (q.stuck > 0)
    return {
      state: 'warn',
      summary: `${q.stuck} held by a worker that stopped answering; they go back in the queue on the next claim.`,
    }
  const parts: string[] = []
  if (q.working) parts.push(`${q.working} working`)
  if (q.waiting) parts.push(`${q.waiting} waiting`)
  if (q.retrying) parts.push(`${q.retrying} retrying later`)
  // Downloads that gave up wait for their saver on Processing, under Need you.
  if (q.failed) parts.push(q.id === 'downloads' ? `${q.failed} need you` : `${q.failed} failed`)
  const summary = parts.length ? `${parts.join(', ')}.` : 'All caught up.'
  return { state: q.failed > 0 ? 'warn' : 'ok', summary }
}

function downloadsQueue(
  now: number,
  blocked: { state: CheckState; summary: string } | null,
): QueueHealth {
  const nowIso = new Date(now).toISOString()
  const cutoff = backfillCutoff()
  const inScope = sql`(${cutoff} IS NULL OR EXISTS (SELECT 1 FROM bookmarks b
    WHERE b.platform = j.platform AND b.id = j.post_id AND b.processed_at >= ${cutoff}))`
  const due = sql`j.status IN ('pending', 'failed')
    AND (j.next_attempt_at IS NULL OR j.next_attempt_at <= ${nowIso}) AND ${inScope}`
  const waiting = one(sql`SELECT COUNT(*) AS n FROM keep_jobs j WHERE ${due}`)
  const oldest = first<{ at: string | null }>(
    sql`SELECT MIN(j.updated_at) AS at FROM keep_jobs j WHERE ${due}`,
  )?.at
  const retrying = one(sql`SELECT COUNT(*) AS n FROM keep_jobs j
    WHERE j.status = 'failed' AND j.next_attempt_at > ${nowIso} AND ${inScope}`)
  const working = one(
    sql`SELECT COUNT(*) AS n FROM keep_jobs WHERE status IN ('running', 'converting')`,
  )
  const failed = one(sql`SELECT COUNT(*) AS n FROM keep_jobs
    WHERE status = 'unavailable' AND accepted_at IS NULL`)
  const hourAgo = new Date(now - HOUR).toISOString()
  const dayAgo = new Date(now - 24 * HOUR).toISOString()
  const last = first<{ at: string | null }>(
    sql`SELECT MAX(updated_at) AS at FROM keep_jobs WHERE status = 'done'`,
  )?.at
  const q = {
    id: 'downloads' as const,
    title: 'Keeping copies',
    where: 'this server',
    waiting,
    retrying,
    working,
    stuck: 0,
    failed,
    oldestWaitingAt: iso(oldest),
    lastDoneAt: iso(last),
    doneLastHour: one(sql`SELECT COUNT(*) AS n FROM keep_jobs
      WHERE status = 'done' AND updated_at >= ${hourAgo}`),
    doneLastDay: one(sql`SELECT COUNT(*) AS n FROM keep_jobs
      WHERE status = 'done' AND updated_at >= ${dayAgo}`),
  }
  const hourly = hourlyCounts(
    db
      .all<{ at: string }>(
        sql`SELECT updated_at AS at FROM keep_jobs
        WHERE status = 'done' AND updated_at >= ${dayAgo}`,
      )
      .map((r) => r.at),
    now,
  )
  return { ...q, hourly, ...judgeQueue(q, now, blocked) }
}

function conversionsQueue(
  now: number,
  blocked: { state: CheckState; summary: string } | null,
): QueueHealth {
  const waiting = one(sql`SELECT COUNT(*) AS n FROM media_conversions
    WHERE status = 'pending' AND next_attempt_at <= ${now}`)
  const oldest = first<{ at: string | null }>(sql`SELECT MIN(updated_at) AS at
    FROM media_conversions WHERE status = 'pending' AND next_attempt_at <= ${now}`)?.at
  const hourAgo = new Date(now - HOUR).toISOString()
  const dayAgo = new Date(now - 24 * HOUR).toISOString()
  const q = {
    id: 'conversions' as const,
    title: 'Making videos play everywhere',
    where: 'the Mac helper',
    waiting,
    retrying: one(sql`SELECT COUNT(*) AS n FROM media_conversions
      WHERE status = 'pending' AND next_attempt_at > ${now}`),
    working: one(sql`SELECT COUNT(*) AS n FROM media_conversions
      WHERE status = 'running' AND expires_at > ${now}`),
    stuck: one(sql`SELECT COUNT(*) AS n FROM media_conversions
      WHERE status = 'running' AND expires_at <= ${now - STUCK_AFTER_MS}`),
    failed: one(sql`SELECT COUNT(*) AS n FROM media_conversions WHERE status = 'failed'`),
    oldestWaitingAt: iso(oldest),
    lastDoneAt: iso(
      first<{ at: string | null }>(
        sql`SELECT MAX(updated_at) AS at FROM media_conversions WHERE status = 'done'`,
      )?.at,
    ),
    doneLastHour: one(sql`SELECT COUNT(*) AS n FROM media_conversions
      WHERE status = 'done' AND updated_at >= ${hourAgo}`),
    doneLastDay: one(sql`SELECT COUNT(*) AS n FROM media_conversions
      WHERE status = 'done' AND updated_at >= ${dayAgo}`),
  }
  const hourly = hourlyCounts(
    db
      .all<{ at: string }>(
        sql`SELECT updated_at AS at FROM media_conversions
        WHERE status = 'done' AND updated_at >= ${dayAgo}`,
      )
      .map((r) => r.at),
    now,
  )
  return { ...q, hourly, ...judgeQueue(q, now, blocked) }
}

function understandingQueue(
  now: number,
  remote: boolean,
  blocked: { state: CheckState; summary: string } | null,
): QueueHealth {
  const nowIso = new Date(now).toISOString()
  const free = sql`NOT EXISTS (SELECT 1 FROM processing_leases l WHERE l.platform = q.platform
    AND l.post_id = q.post_id AND l.kind = q.kind AND l.expires_at > ${now})`
  const waiting = one(sql`SELECT COUNT(*) AS n FROM understanding_queue q
    WHERE q.next_attempt_at <= ${nowIso} AND ${free}`)
  const oldest = first<{ at: string | null }>(sql`SELECT MIN(q.enqueued_at) AS at
    FROM understanding_queue q WHERE q.next_attempt_at <= ${nowIso} AND ${free}`)?.at
  const leases = one(sql`SELECT COUNT(*) AS n FROM processing_leases WHERE expires_at > ${now}`)
  const hourAgo = new Date(now - HOUR).toISOString()
  const dayAgo = new Date(now - 24 * HOUR).toISOString()
  const done = (since: string) =>
    one(sql`SELECT COUNT(*) AS n FROM (
      SELECT created_at FROM post_embeddings WHERE created_at >= ${since} AND status != 'failed'
      UNION ALL SELECT created_at FROM post_extracted_text WHERE created_at >= ${since} AND status != 'failed')`)
  const last = first<{ at: string | null }>(sql`SELECT MAX(at) AS at FROM (
    SELECT MAX(created_at) AS at FROM post_embeddings WHERE status != 'failed'
    UNION ALL SELECT MAX(created_at) AS at FROM post_extracted_text WHERE status != 'failed')`)?.at
  const q = {
    id: 'understanding' as const,
    title: 'Understanding posts',
    where: remote ? 'the Mac helper' : 'this server',
    waiting,
    retrying: one(sql`SELECT COUNT(*) AS n FROM understanding_queue
      WHERE next_attempt_at > ${nowIso}`),
    working: remote ? leases : jobActivity() ? 1 : 0,
    stuck: one(sql`SELECT COUNT(*) AS n FROM processing_leases
      WHERE expires_at <= ${now - STUCK_AFTER_MS}`),
    failed:
      one(sql`SELECT COUNT(*) AS n FROM post_embeddings WHERE status = 'failed'`) +
      one(sql`SELECT COUNT(*) AS n FROM post_extracted_text WHERE status = 'failed'`),
    oldestWaitingAt: iso(oldest),
    lastDoneAt: iso(last),
    doneLastHour: done(hourAgo),
    doneLastDay: done(dayAgo),
  }
  const hourly = hourlyCounts(
    db
      .all<{ at: string }>(
        sql`
        SELECT created_at AS at FROM post_embeddings WHERE created_at >= ${dayAgo} AND status != 'failed'
        UNION ALL SELECT created_at AS at FROM post_extracted_text
          WHERE created_at >= ${dayAgo} AND status != 'failed'`,
      )
      .map((r) => r.at),
    now,
  )
  return { ...q, hourly, ...judgeQueue(q, now, blocked) }
}

function helperView(now: number): HelperView {
  const remote = safeRemote()
  const seen = workerLastSeen()
  const refused = workerLastRefused()
  const leases = db.all<{ worker_id: string; n: number }>(sql`
    SELECT worker_id, COUNT(*) AS n FROM (
      SELECT worker_id FROM processing_leases WHERE expires_at > ${now}
      UNION ALL SELECT worker_id FROM media_conversions
        WHERE status = 'running' AND expires_at > ${now} AND worker_id IS NOT NULL)
    GROUP BY worker_id`)
  const held = new Map(leases.map((l) => [l.worker_id, num(l.n)]))
  const workers = workersSeen().map((w) => ({
    workerId: w.workerId,
    model: w.model,
    protocol: w.protocol,
    kinds: w.kinds,
    lastClaimAt: new Date(w.lastClaimAt).toISOString(),
    leases: held.get(w.workerId) ?? 0,
    problem: w.problem ? claimProblemWords(w.problem) : null,
  }))
  // A worker holding jobs since before a restart hasn't asked for work here yet.
  for (const [workerId, n] of held) {
    if (!workers.some((w) => w.workerId === workerId))
      workers.push({
        workerId,
        model: '',
        protocol: 0,
        kinds: null,
        lastClaimAt: '',
        leases: n,
        problem: null,
      })
  }
  return {
    mode: remote ? 'remote' : 'local',
    connected: remote ? remoteWorkerConnected(now) : false,
    lastSeenAt: seen ? new Date(seen).toISOString() : null,
    setupProblem: workerSetupProblem(),
    lastRefused: refused
      ? { reason: refused.reason, at: new Date(refused.at).toISOString(), count: refused.count }
      : null,
    workers,
    serverProtocol: PROCESSING_PROTOCOL,
  }
}

function safeRemote(): boolean {
  try {
    return remoteProcessing()
  } catch {
    return false
  }
}

function childView(
  id: string,
  title: string,
  child: ChildStatus,
  expected: boolean,
  now: number,
): ProcessView {
  if (!expected) return { id, title, state: 'off', summary: 'Not used with these settings.' }
  if (child.running) {
    const restarts = child.restarts
      ? `; restarted ${child.restarts} time${child.restarts === 1 ? '' : 's'} recently`
      : ''
    return {
      id,
      title,
      state: child.restarts > 2 ? 'warn' : 'ok',
      summary: `Running${child.since ? ` for ${minutes(now - child.since)}` : ''}${restarts}.`,
    }
  }
  const exit = child.lastExit
  return {
    id,
    title,
    state: 'bad',
    summary: exit
      ? `Not running: it stopped ${minutes(now - exit.at)} ago (${exit.signal ?? `exit code ${exit.code}`}) and is restarting.`
      : 'Not running yet. It starts with the server; if this stays, check the server log.',
  }
}

// ——— Tools ———

type ToolProbe = {
  at: number
  ytdlp: string | null
  ytdlpError: string | null
  ffmpeg: string | null
}
const g = globalThis as unknown as { __adhxToolProbe?: ToolProbe }
const PROBE_FOR_MS = 10 * MIN

/** yt-dlp's version and ffmpeg's path, asked at most every ten minutes. */
export async function probeTools(now = Date.now()): Promise<ToolProbe> {
  const cached = g.__adhxToolProbe
  if (cached && now - cached.at < PROBE_FOR_MS) return cached
  let ytdlp: string | null = null
  let ytdlpError: string | null = null
  try {
    const { stdout } = await promisify(execFile)(ytdlpPath(), ['--version'], {
      timeout: 10_000,
    })
    ytdlp = stdout.trim().split('\n')[0] || null
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    ytdlpError = code === 'ENOENT' ? 'not found' : 'didn’t answer'
  }
  const ffmpeg = await ffmpegPath().catch(() => null)
  g.__adhxToolProbe = { at: now, ytdlp, ytdlpError, ffmpeg }
  return g.__adhxToolProbe
}

// ——— Settings ———

/** A setting's value: for one an admin can change, the saved one or the environment's. */
function env(name: string): string | null {
  if (isExtraName(name)) return extra(name)
  const v = process.env[name]?.trim()
  return v ? v : null
}

/** A row that only the environment changes (it's read when ADHX starts). */
function fixedRow(label: string, value: string, name: string | null): SettingView {
  return {
    label,
    name,
    value,
    source: name && process.env[name]?.trim() ? 'env' : 'default',
    edit: null,
  }
}

function fixedFlag(label: string, name: string, on: boolean): SettingView {
  return fixedRow(label, on ? 'On' : 'Off', name)
}

function fixedSecret(label: string, name: string): SettingView {
  return fixedRow(label, process.env[name]?.trim() ? 'Set' : 'Not set', name)
}

function editableRow(view: ExtraView): SettingView {
  return { label: view.label, name: view.name, value: view.shown, source: view.source, edit: view }
}

const GROUP_ORDER: { group: SettingGroup; test: SettingGroupView['test'] }[] = [
  { group: 'Sign-in and email', test: 'email' },
  { group: 'Keeping copies', test: null },
  { group: 'Understanding', test: null },
  { group: 'Jev', test: 'jev' },
  { group: 'X', test: null },
  { group: 'This server', test: null },
]

/**
 * Every setting once: the ones an admin can change here (from
 * `settings/extras`) and, under them, the ones read at startup that only the
 * environment changes.
 */
function settingsView(
  remote: boolean,
  database: string,
  extras = extrasView(),
): SettingGroupView[] {
  const delivery = signInDelivery()
  const invites = inviteMode()
  const fixed: Record<SettingGroup, { before: SettingView[]; after: SettingView[] }> = {
    'Sign-in and email': {
      before: [
        fixedRow('Address', appUrl(), 'NEXT_PUBLIC_APP_URL'),
        {
          label: 'Sign-in links',
          name: null,
          value:
            delivery === 'email'
              ? env('RESEND_API_KEY')
                ? 'Emailed (Resend)'
                : 'Emailed (SMTP)'
              : delivery === 'admin'
                ? 'Held for an admin to pass on'
                : delivery === 'log'
                  ? 'Written to the server log'
                  : 'Off',
          source: 'default',
          edit: null,
          note: 'Follows the email settings below.',
        },
      ],
      after: [
        {
          label: 'Who can invite',
          name: null,
          value: invites === 'admin' ? 'Admins only' : 'Any member',
          source: 'default',
          edit: null,
          note: 'Changed on Invites.',
        },
        fixedSecret('Session secret', 'SESSION_SECRET'),
      ],
    },
    'Keeping copies': {
      before: [],
      after: [
        fixedRow('Media folder', mediaDir(), 'MEDIA_DIR'),
        fixedRow('yt-dlp', ytdlpPath(), 'YTDLP_PATH'),
        fixedRow('Cookies file', ytdlpCookies() ? 'Set' : 'Not set', 'YTDLP_COOKIES'),
        fixedRow('FFmpeg', process.env['FFMPEG_PATH']?.trim() || 'From PATH', 'FFMPEG_PATH'),
      ],
    },
    Understanding: {
      before: [
        fixedFlag('Search by meaning', 'SEMANTIC_SEARCH', semanticEnabled()),
        fixedRow('Where the work runs', remote ? 'Mac helper' : 'This server', 'PROCESSING_MODE'),
      ],
      after: [
        fixedRow('Threads', process.env['SEMANTIC_THREADS']?.trim() || '2', 'SEMANTIC_THREADS'),
        fixedRow('Model files', modelCacheDir(), 'SEMANTIC_CACHE_DIR'),
        fixedSecret('Mac helper token', 'PROCESSING_WORKER_TOKEN'),
      ],
    },
    Jev: { before: [], after: [] },
    X: { before: [], after: [] },
    'This server': {
      before: [],
      after: [
        fixedSecret('Sentry', 'SENTRY_DSN'),
        fixedFlag(
          'Trust proxy IP headers',
          'TRUST_PROXY_IP_HEADERS',
          process.env['TRUST_PROXY_IP_HEADERS'] === 'true',
        ),
        fixedRow('Database', database, 'DATABASE_PATH'),
        fixedRow('Model', SEMANTIC_MODEL_VERSION, null),
      ],
    },
  }
  return GROUP_ORDER.map(({ group, test }) => ({
    group,
    test,
    rows: [
      ...fixed[group].before,
      ...extras.filter((e) => e.group === group).map(editableRow),
      ...fixed[group].after,
    ],
  }))
}

// ——— Outside services ———

function callViews(service: ServiceCallStats['service']): ServiceView['calls'] {
  return serviceCalls()
    .filter((c) => c.service === service)
    .sort((a, b) => a.purpose.localeCompare(b.purpose))
    .map((c) => ({
      ...c,
      lastOkAt: c.lastOkAt ? new Date(c.lastOkAt).toISOString() : null,
      lastFailedAt: c.lastFailedAt ? new Date(c.lastFailedAt).toISOString() : null,
    }))
}

/** Healthy when the newest call worked; a failure newer than any success asks for a look. */
function fromCalls(calls: ServiceView['calls'], now: number, idle: string) {
  if (!calls.length) return { state: 'ok' as CheckState, summary: idle }
  const lastOk = Math.max(0, ...calls.map((c) => (c.lastOkAt ? Date.parse(c.lastOkAt) : 0)))
  const lastBad = Math.max(
    0,
    ...calls.map((c) => (c.lastFailedAt ? Date.parse(c.lastFailedAt) : 0)),
  )
  const ok = calls.reduce((n, c) => n + c.ok, 0)
  const failed = calls.reduce((n, c) => n + c.failed, 0)
  const tally = `${ok} worked, ${failed} failed since the server started`
  if (lastBad > lastOk) {
    const why = calls.find(
      (c) => c.lastFailedAt && Date.parse(c.lastFailedAt) === lastBad,
    )?.lastError
    return {
      state: (lastOk === 0 ? 'bad' : 'warn') as CheckState,
      summary: `Last call failed ${minutes(now - lastBad)} ago (${why ?? 'failed'}); ${tally}.`,
    }
  }
  return {
    state: 'ok' as CheckState,
    summary: `Last answered ${minutes(now - lastOk)} ago; ${tally}.`,
  }
}

function servicesView(now: number, tools: ToolProbe | null, keep: boolean): ServiceView[] {
  const jevCalls = callViews('jev')
  const jevKey = !!env('TYPESAFE_API_KEY')
  const jevUses = ['search refine', 'channel names', 'moment names']
  if (channelImagesEnabled()) jevUses.push('channel pictures')
  const jev = jevKey
    ? fromCalls(jevCalls, now, 'Set up; not called since the server started.')
    : {
        state: 'off' as CheckState,
        summary: 'Off: no Jev key. Search, channels and moments still work, with less polish.',
      }

  const delivery = signInDelivery()
  const emailCalls = callViews('email')
  const email =
    delivery === 'email'
      ? fromCalls(emailCalls, now, 'Set up; no sign-in email sent since the server started.')
      : {
          state: (delivery === null ? 'bad' : 'off') as CheckState,
          summary:
            delivery === 'admin'
              ? 'Off: sign-in links are held for an admin to pass on.'
              : delivery === 'log'
                ? 'Off: sign-in links go to the server log.'
                : 'Nobody can get a sign-in link: there’s no email and links aren’t held for an admin.',
        }

  const fxCalls = callViews('fxtwitter')
  const fx = fromCalls(fxCalls, now, 'Not asked since the server started.')

  // X sync: the durable sync log says how the last run went.
  const xKeys = !!env('TWITTER_CLIENT_ID') && !!env('TWITTER_CLIENT_SECRET')
  const lastSync = first<{ status: string; at: string | null; error: string | null }>(sql`
    SELECT status, COALESCE(completed_at, started_at) AS at, error_message AS error
    FROM sync_logs ORDER BY started_at DESC LIMIT 1`)
  const lastGood = first<{ at: string | null }>(sql`
    SELECT MAX(completed_at) AS at FROM sync_logs WHERE status = 'completed'`)?.at
  const x: { state: CheckState; summary: string } = !xKeys
    ? {
        state: 'off',
        summary:
          'Off: no X app keys, so X bookmarks can’t be brought in. Pasting X links still works.',
      }
    : !lastSync
      ? { state: 'ok', summary: 'Set up; nobody has synced X bookmarks yet.' }
      : lastSync.status === 'failed'
        ? {
            state: 'warn',
            summary: `The last sync failed ${lastSync.at ? `${minutes(now - Date.parse(lastSync.at))} ago` : ''}${
              lastGood ? `; the last good one was ${minutes(now - Date.parse(lastGood))} ago` : ''
            }.`,
          }
        : lastSync.status === 'running'
          ? { state: 'ok', summary: 'A sync is running now.' }
          : {
              state: 'ok',
              summary: `Last synced ${lastSync.at ? `${minutes(now - Date.parse(lastSync.at))} ago` : 'recently'}.`,
            }

  const sentryOn = !!env('SENTRY_DSN') && process.env.NODE_ENV === 'production'
  return [
    { id: 'jev', name: 'Jev', usedFor: jevUses.join(', '), ...jev, calls: jevCalls },
    {
      id: 'email',
      name: env('RESEND_API_KEY') ? 'Email (Resend)' : 'Email (SMTP)',
      usedFor: 'sign-in links',
      ...email,
      calls: emailCalls,
    },
    {
      id: 'fxtwitter',
      name: 'FxTwitter',
      usedFor: 'X post details and media',
      ...fx,
      calls: fxCalls,
    },
    { id: 'x', name: 'X', usedFor: 'bringing in X bookmarks', ...x, calls: [] },
    {
      id: 'ytdlp',
      name: 'yt-dlp',
      usedFor: 'downloading from every network',
      state: !keep ? 'off' : !tools ? 'ok' : tools.ytdlp ? 'ok' : 'bad',
      summary: !keep
        ? 'Off: keeping copies is switched off.'
        : !tools
          ? 'Not checked.'
          : tools.ytdlp
            ? `Version ${tools.ytdlp}.`
            : `${ytdlpPath()} ${tools.ytdlpError}.`,
      calls: [],
    },
    {
      id: 'sentry',
      name: 'Sentry',
      usedFor: 'error reports',
      state: sentryOn ? 'ok' : 'off',
      summary: sentryOn
        ? 'Sending server errors (with personal details removed).'
        : env('SENTRY_DSN')
          ? 'Set, but only sends in production.'
          : 'Off: SENTRY_DSN isn’t set.',
      calls: [],
    },
  ]
}

// ——— Backlog history ———

const SAMPLE_EVERY_MS = 5 * MIN
const SAMPLES_KEPT = 288 // 24 hours
type SamplerState = { timer: ReturnType<typeof setInterval> | null; samples: BacklogSample[] }
const sampler = globalThis as unknown as { __adhxBacklog?: SamplerState }

function samplerState(): SamplerState {
  return (sampler.__adhxBacklog ??= { timer: null, samples: [] })
}

/** What's left in each queue now: ready, retrying later or being worked on. */
export function backlogNow(now = Date.now()): BacklogSample {
  const left = (q: QueueHealth) => q.waiting + q.retrying + q.working
  return {
    at: new Date(now).toISOString(),
    downloads: left(downloadsQueue(now, null)),
    conversions: safeRemote() ? left(conversionsQueue(now, null)) : 0,
    understanding: left(understandingQueue(now, safeRemote(), null)),
  }
}

export function recordBacklogSample(now = Date.now()): void {
  const s = samplerState()
  s.samples = [...s.samples.slice(-(SAMPLES_KEPT - 1)), backlogNow(now)]
}

/** Sample the queues every five minutes from server start (the System page's backlog chart). */
export function startBacklogSampler(): void {
  if (process.env['VITEST']) return
  const s = samplerState()
  if (s.timer) return
  const sample = () => {
    try {
      recordBacklogSample()
    } catch {
      // No database yet, or a migration in progress; try again next time.
    }
  }
  sample()
  s.timer = setInterval(sample, SAMPLE_EVERY_MS)
  s.timer.unref?.()
}

export function backlogHistory(): BacklogSample[] {
  return samplerState().samples
}

/** Tests: forget the samples. */
export function __resetBacklog(): void {
  const s = samplerState()
  if (s.timer) clearInterval(s.timer)
  sampler.__adhxBacklog = undefined
}

// ——— Host ———

function cpuName(): string {
  const model = os.cpus()[0]?.model?.replace(/\s+/g, ' ').trim()
  return model || os.arch()
}

function inContainer(): boolean {
  try {
    if (existsSync('/.dockerenv')) return true
    return /docker|containerd|kubepods/.test(readFileSync('/proc/1/cgroup', 'utf8'))
  } catch {
    return false
  }
}

function hostView(): SystemBoard['host'] {
  const label = env('SERVER_LABEL')
  return {
    label: label ?? os.hostname(),
    hostname: os.hostname(),
    cpu: cpuName(),
    cores: os.cpus().length,
    memory: { total: os.totalmem(), free: os.freemem() },
    load: os.loadavg().map((n) => Math.round(n * 100) / 100),
    container: inContainer(),
    processMemory: process.memoryUsage().rss,
  }
}

// ——— The board ———

export async function systemBoard(
  now = Date.now(),
  options: { tools?: boolean } = {},
): Promise<SystemBoard> {
  const remote = safeRemote()
  const paused = newWorkPaused()
  const semantic = semanticEnabled()
  const indexing = semantic && !indexingPaused()
  const keep = keepEnabled()
  const helper = helperView(now)
  const disk = await diskSpace()
  const minFree = keepMinFreeBytes()
  const diskFull = disk.free !== null && disk.free < minFree
  const pausedBlock = paused
    ? { state: 'warn' as const, summary: 'Paused by an admin (Processing → Resume new work).' }
    : null
  const refusedWork = helper.connected ? (helper.workers[0]?.problem ?? null) : null
  const helperDown =
    remote && !helper.connected
      ? { state: 'bad' as const, summary: 'Waiting for the Mac helper, which isn’t connected.' }
      : remote && refusedWork
        ? {
            state: 'bad' as const,
            summary: 'Waiting for the Mac helper, which is connected but can’t be given work.',
          }
        : null

  const queues: QueueHealth[] = [
    downloadsQueue(
      now,
      !keep
        ? {
            state: 'off',
            summary: 'Off: keeping copies is switched off, so posts play from their source.',
          }
        : diskFull
          ? { state: 'bad', summary: 'Paused: the media disk is under its free-space minimum.' }
          : pausedBlock,
    ),
  ]
  if (remote) {
    queues.push(
      conversionsQueue(
        now,
        !keep
          ? { state: 'off', summary: 'Off: keeping copies is switched off.' }
          : (pausedBlock ?? helperDown),
      ),
    )
  }
  queues.push(
    understandingQueue(
      now,
      remote,
      !indexing
        ? {
            state: 'off',
            summary:
              'Off: search by meaning is switched off (SEMANTIC_SEARCH), so it uses words only.',
          }
        : (pausedBlock ?? helperDown),
    ),
  )

  // The keep loop and the two model processes.
  const keepLoop = keepWorkerStatus()
  const status = semanticStatus()
  const processes: ProcessView[] = [
    !keep
      ? {
          id: 'keep',
          title: 'Download loop',
          state: 'off',
          summary: 'Off: keeping copies is switched off.',
        }
      : keepLoop.running && keepLoop.lastTickAt && now - keepLoop.lastTickAt < 2 * MIN
        ? {
            id: 'keep',
            title: 'Download loop',
            state: 'ok',
            summary: `Running · ${keepLoop.downloading} downloading now.`,
          }
        : {
            id: 'keep',
            title: 'Download loop',
            state: 'bad',
            summary: keepLoop.running
              ? `Hasn’t run for ${minutes(now - (keepLoop.lastTickAt ?? now))}.`
              : 'Not running in this process. Restart ADHX; if it stays, check the server log.',
          },
    childView('query', 'Search process', status.children.query, semantic, now),
    childView('jobs', 'Understanding process', status.children.jobs, indexing && !remote, now),
  ]

  const tools = options.tools === false || !keep ? null : await probeTools(now)

  const checks: HealthCheck[] = []
  for (const q of queues) {
    checks.push({
      id: `queue-${q.id}`,
      group: 'Queues',
      title: q.title,
      state: q.state,
      summary: q.summary,
      fix:
        q.state === 'bad'
          ? q.summary.startsWith('Waiting for the Mac helper, which is connected')
            ? 'The Mac helper is connected but refused work; see why below.'
            : q.summary.startsWith('Waiting for the Mac helper')
              ? 'Open the ADHX helper on the Mac and check it shows Connected.'
              : q.summary.startsWith('Paused: the media disk')
                ? 'Free some space on the media disk, or lower “Stop when free disk is under” in Settings.'
                : `Check that the ${q.where === 'this server' ? 'processes below are running' : 'Mac helper is connected'}, then the server log.`
          : q.failed > 0 && q.state === 'warn'
            ? 'Processing → Retry failed tries them all again.'
            : null,
    })
  }
  if (remote) {
    const lastRefused = helper.lastRefused
    checks.push({
      id: 'helper',
      group: 'Workers',
      title: 'Mac helper',
      state: helper.setupProblem || refusedWork ? 'bad' : helper.connected ? 'ok' : 'bad',
      summary: helper.setupProblem
        ? `It can’t connect: ${REFUSAL_WORDS[helper.setupProblem]}.`
        : refusedWork
          ? `Connected, but ${refusedWork}.`
          : helper.connected
            ? `Connected${helper.workers[0] ? ` · ${helper.workers[0].workerId}` : ''}.`
            : lastRefused && now - Date.parse(lastRefused.at) < 30 * MIN
              ? `Not connected. A helper was turned away ${minutes(now - Date.parse(lastRefused.at))} ago: ${REFUSAL_WORDS[lastRefused.reason]}.`
              : helper.lastSeenAt
                ? `Not connected: last seen ${minutes(now - Date.parse(helper.lastSeenAt))} ago.`
                : 'Not connected since this server started.',
      fix: helper.setupProblem
        ? 'Set PROCESSING_MODE=remote and a PROCESSING_WORKER_TOKEN, then restart ADHX.'
        : refusedWork
          ? 'Install the helper from the same ADHX release as this server (deploy/mac).'
          : helper.connected
            ? null
            : 'Open the ADHX helper on the Mac. Its server address and token must match this server’s.',
    })
  }
  for (const p of processes) {
    checks.push({
      id: `process-${p.id}`,
      group: 'Workers',
      title: p.title,
      state: p.state,
      summary: p.summary,
      fix:
        p.state === 'bad' ? 'Restart ADHX. If it keeps stopping, the server log says why.' : null,
    })
  }
  if (tools && keep) {
    checks.push({
      id: 'ytdlp',
      group: 'Setup',
      title: 'yt-dlp',
      state: tools.ytdlp ? 'ok' : 'bad',
      summary: tools.ytdlp ? `Version ${tools.ytdlp}.` : `${ytdlpPath()} ${tools.ytdlpError}.`,
      fix: tools.ytdlp ? null : 'Install yt-dlp or set YTDLP_PATH. The ADHX image includes it.',
    })
    checks.push({
      id: 'ffmpeg',
      group: 'Setup',
      title: 'FFmpeg',
      state: tools.ffmpeg ? 'ok' : 'bad',
      summary: tools.ffmpeg ? `Found at ${tools.ffmpeg}.` : 'Not found.',
      fix: tools.ffmpeg ? null : 'Install FFmpeg or set FFMPEG_PATH. The ADHX image includes it.',
    })
  }
  checks.push({
    id: 'disk',
    group: 'Setup',
    title: 'Disk',
    state: disk.free === null ? 'warn' : diskFull ? 'bad' : disk.free < minFree * 3 ? 'warn' : 'ok',
    summary:
      disk.free === null
        ? 'Free space can’t be read.'
        : `${bytesLabel(disk.free)} free${disk.total ? ` of ${bytesLabel(disk.total)}` : ''}; downloads stop under ${bytesLabel(minFree)}.`,
    fix: diskFull ? 'Free some space, or lower “Stop when free disk is under” in Settings.' : null,
  })
  const address = appUrl()
  checks.push({
    id: 'address',
    group: 'Setup',
    title: 'Address',
    state: address.startsWith('https://') ? 'ok' : 'warn',
    summary: address.startsWith('https://')
      ? address
      : `${address}: plain HTTP, so sign-in cookies and links travel unencrypted.`,
    fix: address.startsWith('https://')
      ? null
      : 'Put ADHX behind HTTPS (deploy/vps, or your proxy) and set NEXT_PUBLIC_APP_URL.',
  })

  const services = servicesView(now, tools, keep)
  for (const svc of services) {
    if (svc.id === 'ytdlp') continue // already a Setup check
    checks.push({
      id: `service-${svc.id}`,
      group: 'Services',
      title: svc.name,
      state: svc.state,
      summary: svc.summary,
      fix:
        svc.state === 'bad' || svc.state === 'warn'
          ? svc.id === 'jev'
            ? 'Check the Jev key in Settings, then Test Jev. ADHX works without Jev, just less polished.'
            : svc.id === 'email'
              ? 'Check the Resend key or SMTP in Settings, then send a test email. Until then, Invites can pass links on.'
              : svc.id === 'x'
                ? 'Settings → Your X bookmarks shows the error; reconnecting X usually fixes it.'
                : svc.id === 'fxtwitter'
                  ? 'FxTwitter is a public service; it usually recovers on its own.'
                  : null
          : null,
    })
  }
  return {
    overall: worst(checks.map((c) => c.state)),
    checks,
    queues,
    helper,
    processes,
    services,
    backlog: backlogHistory(),
    settings: settingsView(
      remote,
      (globalThis as { __adhxSqlitePath?: string }).__adhxSqlitePath ??
        path.resolve(process.env['DATABASE_PATH'] || './data/adhdone.db'),
    ),
    host: hostView(),
    server: {
      version: process.env.NEXT_PUBLIC_APP_VERSION || 'dev',
      node: process.version,
      platform: `${process.platform} ${process.arch}`,
      startedAt: new Date(now - process.uptime() * 1000).toISOString(),
    },
  }
}

/** How many checks are failing, for the admin menu (no tool probe). */
export async function systemProblems(now = Date.now()): Promise<number> {
  try {
    const board = await systemBoard(now, { tools: false })
    return board.checks.filter((c) => c.state === 'bad').length
  } catch {
    return 0
  }
}
