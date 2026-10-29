import type { WorkerRefusal } from './auth'

/** Why a Mac helper was turned away, for the admin System page (no token is ever shown). */
export const REFUSAL_WORDS: Record<WorkerRefusal, string> = {
  bad_mode: 'PROCESSING_MODE isn’t local or remote',
  local_mode: 'this server does its own processing (PROCESSING_MODE isn’t remote)',
  no_server_token: 'PROCESSING_WORKER_TOKEN isn’t set on this server',
  bad_server_token:
    'PROCESSING_WORKER_TOKEN on this server isn’t 32 to 256 letters, digits, - or _',
  no_token: 'the request had no token (a helper without one, or something else on the internet)',
  wrong_token: 'its token doesn’t match PROCESSING_WORKER_TOKEN',
}

/** A connected helper's ask for work refused, in plain words. */
export function claimProblemWords(problem: string): string {
  return /model or protocol does not match/i.test(problem)
    ? 'it runs a different model or version than this server, so it’s given no work. Update the helper'
    : problem
}
