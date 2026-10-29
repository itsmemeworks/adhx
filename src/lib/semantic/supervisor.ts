import { fork, type ChildProcess } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { captureException } from '@/lib/sentry'
import { semanticEnabled, type JobKind } from './config'
import { normalize } from './vectors'
import { remoteProcessing } from '@/lib/processing/config'

/**
 * The web server never runs the model itself. ONNX inference is synchronous
 * on the calling thread: a 15s video run froze every request in the process.
 * Two child processes do the work instead:
 *
 * - `jobs`: the understanding worker (queue, media, full model). Niced so the
 *   web server wins the CPU.
 * - `query`: a words-only copy of the model that turns search text into a
 *   vector in ~60ms, so a search never waits behind a video.
 *
 * Both are restarted with backoff if they exit. The queue is durable, so a
 * restart only loses the job in flight (it is retried).
 */

export type ChildRole = 'jobs' | 'query'

export interface JobActivity {
  platform: string
  postId: string
  kind: JobKind
  phase: string
  frames: number
  startedAt: string
  segments?: number
  completedSegments?: number
}

/** Messages a child sends to the supervisor. */
export type ChildMessage =
  | { type: 'ready' }
  | { type: 'activity'; current: JobActivity | null }
  | { type: 'vectors'; id: number; vectors: number[][] }
  | { type: 'error'; id?: number; message: string }

/** Messages the supervisor sends to a child. */
export type ParentMessage = { type: 'wake' } | { type: 'embed'; id: number; texts: string[] }

type Pending = {
  resolve: (v: Float32Array[]) => void
  reject: (e: Error) => void
  timer: NodeJS.Timeout
}

type SupervisorState = {
  started: boolean
  children: Partial<Record<ChildRole, ChildProcess>>
  restarts: Record<ChildRole, number>
  /** When each running child started, and how the last one ended (for admins). */
  since?: Partial<Record<ChildRole, number>>
  lastExit?: Partial<Record<ChildRole, { at: number; code: number | null; signal: string | null }>>
  activity: JobActivity | null
  pending: Map<number, Pending>
  nextId: number
  cache: Map<string, Float32Array>
}

const g = globalThis as unknown as { __adhxSemanticSupervisor?: SupervisorState }
const state: SupervisorState = (g.__adhxSemanticSupervisor ??= {
  started: false,
  children: {},
  restarts: { jobs: 0, query: 0 },
  activity: null,
  pending: new Map(),
  nextId: 1,
  cache: new Map(),
})

const QUERY_TIMEOUT_MS = 5_000
/** First load downloads/compiles the model; allow longer before giving up. */
const FIRST_QUERY_TIMEOUT_MS = 60_000
const QUERY_CACHE_SIZE = 500
const JOBS_NICE = 10
const RESTART_MAX_MS = 60_000
const STABLE_MS = 5 * 60_000

function childEntry(): string {
  return (
    process.env['SEMANTIC_CHILD_ENTRY'] || path.join(process.cwd(), 'src/lib/semantic/child.ts')
  )
}

function spawn(role: ChildRole): void {
  const startedAt = Date.now()
  // The child runs from source with tsx at runtime (the Docker image keeps
  // src/lib); tell Turbopack not to bundle or resolve it at build time.
  const child = fork(/* turbopackIgnore: true */ childEntry(), [], {
    execArgv: ['--import', 'tsx'],
    env: {
      ...process.env,
      ADHX_SEMANTIC_ROLE: role,
      ...(role === 'query' ? { SEMANTIC_THREADS: '1', SEMANTIC_TEXT_ONLY: '1' } : {}),
    },
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  })
  state.children[role] = child
  ;(state.since ??= {})[role] = startedAt
  if (role === 'jobs' && child.pid) {
    try {
      os.setPriority(child.pid, JOBS_NICE)
    } catch {
      // Not permitted on some hosts; the worker still rests between jobs.
    }
  }
  child.on('message', (message: ChildMessage) => onMessage(role, message))
  child.on('error', (error) => captureException(error, { endpoint: `semantic.${role}.spawn` }))
  child.on('exit', (code, signal) => {
    if (state.children[role] === child) delete state.children[role]
    ;(state.lastExit ??= {})[role] = { at: Date.now(), code, signal }
    if (role === 'jobs') state.activity = null
    if (role === 'query') failPending(new Error('Query process exited'))
    if (!state.started) return
    if (Date.now() - startedAt > STABLE_MS) state.restarts[role] = 0
    const delay = Math.min(RESTART_MAX_MS, 2_000 * 2 ** state.restarts[role]++)
    captureException(new Error(`Semantic ${role} process exited (${code ?? signal})`), {
      endpoint: `semantic.${role}.exit`,
      restartInMs: delay,
    })
    setTimeout(() => {
      if (state.started && !state.children[role]) spawn(role)
    }, delay).unref()
  })
}

function onMessage(role: ChildRole, message: ChildMessage): void {
  if (message.type === 'ready' && role === 'query') {
    startJobs()
  } else if (message.type === 'activity') {
    state.activity = message.current
  } else if (message.type === 'vectors') {
    const pending = state.pending.get(message.id)
    if (!pending) return
    state.pending.delete(message.id)
    clearTimeout(pending.timer)
    try {
      pending.resolve(message.vectors.map((v) => normalize(v)))
    } catch (error) {
      pending.reject(error as Error)
    }
  } else if (message.type === 'error') {
    const pending = message.id ? state.pending.get(message.id) : undefined
    if (pending && message.id) {
      state.pending.delete(message.id)
      clearTimeout(pending.timer)
      pending.reject(new Error(message.message))
    } else {
      captureException(new Error(message.message), { endpoint: `semantic.${role}` })
    }
  }
}

function failPending(error: Error): void {
  for (const [id, pending] of state.pending) {
    clearTimeout(pending.timer)
    pending.reject(error)
    state.pending.delete(id)
  }
}

/** Start both children once per server process. No-op when the pipeline is off. */
/**
 * Start both children once per server process. No-op when the pipeline is off.
 * The query child goes first and the jobs child follows once it is ready: on
 * a fresh volume both would otherwise download the same model files into the
 * same cache at the same time. A timeout starts jobs anyway if query stalls.
 */
export function startSemanticProcesses(): void {
  if (state.started || !semanticEnabled()) return
  // A mistyped remote mode must never silently start heavy indexing on the NAS.
  const remote = remoteProcessing()
  state.started = true
  spawn('query')
  if (!remote) {
    jobsFallback = setTimeout(startJobs, JOBS_START_FALLBACK_MS)
    jobsFallback.unref?.()
  }
}

const JOBS_START_FALLBACK_MS = 3 * 60_000
let jobsFallback: NodeJS.Timeout | null = null

function startJobs(): void {
  if (jobsFallback) clearTimeout(jobsFallback)
  jobsFallback = null
  if (state.started && !remoteProcessing() && !state.children.jobs) spawn('jobs')
}

export function stopSemanticProcesses(): void {
  state.started = false
  for (const child of Object.values(state.children)) child?.kill()
  state.children = {}
  failPending(new Error('Semantic processes stopped'))
}

/** Nudge the jobs process after new work is queued. */
export function wakeJobs(): void {
  startSemanticProcesses()
  const child = state.children.jobs
  if (child?.connected) child.send({ type: 'wake' } satisfies ParentMessage)
}

export interface ChildStatus {
  running: boolean
  /** When the running process started (ms), else null. */
  since: number | null
  /** Restarts since it last ran steadily for five minutes. */
  restarts: number
  lastExit: { at: number; code: number | null; signal: string | null } | null
}

/** Whether the search and understanding processes are up, for the admin System page. */
export function semanticStatus(): {
  started: boolean
  queriesAnswered: number
  children: Record<ChildRole, ChildStatus>
} {
  const child = (role: ChildRole): ChildStatus => {
    const running = !!state.children[role]?.connected
    return {
      running,
      since: running ? (state.since?.[role] ?? null) : null,
      restarts: state.restarts[role],
      lastExit: state.lastExit?.[role] ?? null,
    }
  }
  return {
    started: state.started,
    queriesAnswered,
    children: { query: child('query'), jobs: child('jobs') },
  }
}

/** What the jobs process is working on right now, if anything. */
export function jobActivity(): JobActivity | null {
  return state.activity
}

let queriesAnswered = 0

/** Send prompts to the query process; resolves with one vector per prompt. */
function requestVectors(prompts: string[], timeoutMs: number): Promise<Float32Array[]> {
  startSemanticProcesses()
  const child = state.children.query
  if (!child?.connected) return Promise.reject(new Error('Query process unavailable'))
  const id = state.nextId++
  return new Promise<Float32Array[]>((resolve, reject) => {
    const timer = setTimeout(
      () => {
        state.pending.delete(id)
        reject(new Error('Query embedding timed out'))
      },
      queriesAnswered === 0 ? FIRST_QUERY_TIMEOUT_MS : timeoutMs,
    )
    state.pending.set(id, {
      resolve: (vectors) => {
        queriesAnswered++
        resolve(vectors)
      },
      reject,
      timer,
    })
    child.send({ type: 'embed', id, texts: prompts } satisfies ParentMessage)
  })
}

function remember(prompt: string, vector: Float32Array): void {
  state.cache.set(prompt, vector)
  if (state.cache.size > QUERY_CACHE_SIZE) {
    state.cache.delete(state.cache.keys().next().value as string)
  }
}

/**
 * Turn search text (already formatted with `queryPrompt`) into a vector.
 * Rejects when the pipeline is off, the query process is down, or it takes
 * too long; callers fall back to keyword-only results.
 */
export async function embedQuery(prompt: string): Promise<Float32Array> {
  const cached = state.cache.get(prompt)
  if (cached) {
    state.cache.delete(prompt)
    state.cache.set(prompt, cached)
    return cached
  }
  const [vector] = await requestVectors([prompt], QUERY_TIMEOUT_MS)
  remember(prompt, vector)
  return vector
}

/** Many prompts at once (e.g. naming channels). Not cached. */
export function embedQueries(prompts: string[]): Promise<Float32Array[]> {
  if (prompts.length === 0) return Promise.resolve([])
  return requestVectors(prompts, Math.max(QUERY_TIMEOUT_MS, prompts.length * 200))
}
