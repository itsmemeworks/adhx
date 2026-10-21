import { checkRateLimit } from '@/lib/rate-limit'
import { captureException } from '@/lib/sentry'
import { SEND_LIMIT, parseSendBody, sendPost, sendTargets, validPost } from './sends'

/**
 * The send routes' work, shared by the web (`/api/posts/send`, session) and
 * the phone (`/api/app/send`, phone key): status, JSON body and any headers.
 * Errors carry `{ error, code }` like every `/api/app/*` route.
 */
export type HandlerResult = { status: number; body: unknown; headers?: Record<string, string> }

function fail(status: number, code: string, error: string): HandlerResult {
  return { status, body: { error, code } }
}

/** GET ?platform=&id= → `{ sendable, people }`, or 404 `not_found`. */
export function getSendTargets(userId: string, params: URLSearchParams): HandlerResult {
  const platform = params.get('platform')
  const id = params.get('id')
  if (!validPost(platform, id)) return fail(400, 'bad_request', 'Say which post: platform and id.')
  try {
    const targets = sendTargets(userId, platform, id as string)
    if (!targets) return fail(404, 'not_found', 'That post isn’t here.')
    return { status: 200, body: targets }
  } catch (error) {
    captureException(error, { endpoint: 'send.targets' })
    return fail(500, 'failed', 'That didn’t load just now. Try again.')
  }
}

/** POST `{ platform, id, to, note? }` → `{ sent, skipped }`. */
export function postSend(userId: string, body: unknown): HandlerResult {
  const parsed = parseSendBody(body)
  if ('error' in parsed) return fail(400, 'bad_request', parsed.error)
  const limited = checkRateLimit(`send:${userId}`, SEND_LIMIT)
  if (limited.limited) {
    const out = fail(429, 'busy', 'Lots of sends just now. Give it a moment.')
    return { ...out, headers: { 'Retry-After': Math.ceil(limited.resetMs / 1000).toString() } }
  }
  try {
    const result = sendPost(userId, parsed)
    if (result === null) return fail(404, 'not_found', 'That post isn’t here.')
    if (result === 'private') {
      return fail(403, 'private', 'Just for you. Share it first to send it.')
    }
    return { status: 200, body: result }
  } catch (error) {
    captureException(error, { endpoint: 'send.post' })
    return fail(500, 'failed', 'That didn’t send just now. Try again.')
  }
}
