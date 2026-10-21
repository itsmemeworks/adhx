import { fork, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import type { ExtractKind } from './config'
import type { ScreenRead, SpeechWindow } from './extract-clean'

/**
 * Talks to the extract process (`extract-child.ts`) from the jobs process or
 * the native Mac worker. The caller stays responsive (its own queue, rests and
 * heartbeats) while the model runs next door. Only one model is ever loaded:
 * switching from speech to on-screen text (or back) replaces the process, and
 * an idle process exits on its own.
 */

export type ExtractTask = { kind: 'speech'; file: string } | { kind: 'screen'; files: string[] }

export interface ExtractRequest {
  id: string
  task: ExtractTask
}

export interface ExtractResponse {
  id: string
  windows?: SpeechWindow[]
  reads?: ScreenRead[]
  error?: string
}

export interface ExtractResult {
  windows?: SpeechWindow[]
  reads?: ScreenRead[]
}

export type RunExtract = (task: ExtractTask, signal?: AbortSignal) => Promise<ExtractResult>

/** Ten minutes of speech is ~20 windows; allow a slow CPU plus the first model download. */
const TIMEOUT_MS: Record<ExtractKind, number> = { speech: 20 * 60_000, screen: 10 * 60_000 }

function childEntry(): string {
  return (
    process.env['ADHX_EXTRACT_CHILD_ENTRY'] ||
    fileURLToPath(new URL('./extract-child.ts', import.meta.url))
  )
}

export class ExtractorProcess {
  private child: ChildProcess | null = null
  private kind: ExtractKind | null = null
  private active = false

  /** `env` is added to the inherited environment (e.g. the Mac worker's model cache). */
  constructor(private readonly env: Record<string, string> = {}) {}

  async run(task: ExtractTask, signal?: AbortSignal): Promise<ExtractResult> {
    signal?.throwIfAborted()
    if (this.active) throw new Error('Only one extraction may run at a time')
    this.active = true
    try {
      if (this.child && this.kind !== task.kind) this.close()
      if (!this.child) {
        const env = { ...process.env, ...this.env }
        // The machine credential never reaches a model process.
        delete env['ADHX_WORKER_TOKEN']
        delete env['PROCESSING_WORKER_TOKEN']
        const child = fork(/* turbopackIgnore: true */ childEntry(), [], {
          execArgv: ['--import', 'tsx'],
          env,
          stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
        })
        child.on('exit', () => {
          if (this.child === child) {
            this.child = null
            this.kind = null
          }
        })
        child.on('error', () => undefined)
        this.child = child
        this.kind = task.kind
      }
      const child = this.child
      return await new Promise<ExtractResult>((resolve, reject) => {
        const id = randomUUID()
        const finish = (error?: Error, result?: ExtractResult) => {
          clearTimeout(timer)
          signal?.removeEventListener('abort', abort)
          child.off('message', message)
          child.off('exit', exit)
          if (error) reject(error)
          else resolve(result!)
        }
        const abort = () => {
          this.close()
          finish(new Error('Extraction cancelled'))
        }
        const exit = () => finish(new Error('Extract process exited'))
        const message = (value: unknown) => {
          const response = value as ExtractResponse
          if (response?.id !== id) return
          if (response.error)
            finish(new Error(`Extraction failed: ${response.error.slice(0, 200)}`))
          else finish(undefined, { windows: response.windows, reads: response.reads })
        }
        const timer = setTimeout(() => {
          this.close()
          finish(new Error('Extraction timed out'))
        }, TIMEOUT_MS[task.kind])
        signal?.addEventListener('abort', abort, { once: true })
        child.on('message', message)
        child.once('exit', exit)
        child.send({ id, task } satisfies ExtractRequest, (error) => {
          if (error) finish(new Error('Extract process unavailable'))
        })
      })
    } finally {
      this.active = false
    }
  }

  /** The running extract process, for diagnostics (memory sampling in the smoke script). */
  get pid(): number | undefined {
    return this.child?.pid
  }

  close(): void {
    this.child?.kill('SIGTERM')
    this.child = null
    this.kind = null
  }
}

const g = globalThis as unknown as { __adhxExtractor?: ExtractorProcess }

/** The jobs process's one extract process. */
export function sharedExtractor(): ExtractorProcess {
  return (g.__adhxExtractor ??= new ExtractorProcess())
}
