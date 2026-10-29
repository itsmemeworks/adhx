import { timingSafeEqual } from 'node:crypto'
import { remoteProcessing } from './config'
import { noteWorkerRefused } from './presence'

/**
 * Why a worker request was refused, in the words the admin System page
 * shows. Never includes the token itself.
 */
export type WorkerRefusal =
  'bad_mode' | 'local_mode' | 'no_server_token' | 'bad_server_token' | 'no_token' | 'wrong_token'

const TOKEN = /^[A-Za-z0-9_-]{32,256}$/

/** Is this server set up to accept a worker at all? Null when it is. */
export function workerSetupProblem(): Exclude<WorkerRefusal, 'no_token' | 'wrong_token'> | null {
  let remote = false
  try {
    remote = remoteProcessing()
  } catch {
    return 'bad_mode'
  }
  if (!remote) return 'local_mode'
  const expected = process.env['PROCESSING_WORKER_TOKEN'] || ''
  if (!expected) return 'no_server_token'
  if (!TOKEN.test(expected)) return 'bad_server_token'
  return null
}

function refusal(request: Request): WorkerRefusal | null {
  const setup = workerSetupProblem()
  if (setup) return setup
  const expected = process.env['PROCESSING_WORKER_TOKEN'] || ''
  const header = request.headers.get('authorization')
  if (!header) return 'no_token'
  const supplied = header.match(/^Bearer ([A-Za-z0-9_-]{32,256})$/)?.[1] || ''
  if (supplied.length !== expected.length) return 'wrong_token'
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(expected)) ? null : 'wrong_token'
}

/** A machine credential distinct from accounts, sessions and phone keys. */
export function workerAuthorized(request: Request): boolean {
  const problem = refusal(request)
  if (problem) noteWorkerRefused(problem)
  return !problem
}
export function workerHeaders(): Record<string, string> {
  return { 'Cache-Control': 'no-store' }
}
