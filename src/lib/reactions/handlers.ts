import { captureException } from '@/lib/sentry'
import { validReactionPost } from './parse'
import { addPostReaction, deletePostReaction, listPostReactions } from './post-reactions'

/**
 * The reaction routes' work, shared by the web (`/api/posts/reactions`,
 * session) and the phone (`/api/app/reactions`, phone key): status, JSON body
 * and any headers. Errors carry `{ error, code }` like every `/api/app/*` route.
 */
export type HandlerResult = { status: number; body: unknown; headers?: Record<string, string> }

function fail(status: number, code: string, error: string): HandlerResult {
  return { status, body: { error, code } }
}

/** GET ?platform=&id= → `{ reactions }` (oldest first), or 404 `not_found`. */
export function getReactions(userId: string, params: URLSearchParams): HandlerResult {
  const platform = params.get('platform')
  const id = params.get('id')
  if (!validReactionPost(platform, id)) return fail(400, 'bad_post', 'Say which post.')
  try {
    const reactions = listPostReactions(userId, platform, id as string)
    if (!reactions) return fail(404, 'not_found', 'That post isn’t here.')
    return { status: 200, body: { reactions } }
  } catch (error) {
    captureException(error, { endpoint: 'reactions.list' })
    return fail(500, 'failed', 'That didn’t load just now. Try again.')
  }
}

/** POST `{ platform, id, emoji }` or `{ platform, id, text }` → `{ id, at }`. */
export function postReaction(userId: string, body: unknown): HandlerResult {
  try {
    const result = addPostReaction(userId, body)
    if (!result.ok) {
      return {
        status: result.status,
        body: { error: result.error, code: result.code },
        ...(result.retryAfter ? { headers: { 'Retry-After': String(result.retryAfter) } } : {}),
      }
    }
    return { status: 200, body: { id: result.id, at: result.at } }
  } catch (error) {
    captureException(error, { endpoint: 'reactions.add' })
    return fail(500, 'failed', 'Couldn’t send that. Try again.')
  }
}

/** DELETE /{id} → `{ ok: true }`; 404 `not_found` unless it's your own reaction. */
export function removeReaction(userId: string, id: string): HandlerResult {
  try {
    if (!deletePostReaction(userId, id)) return fail(404, 'not_found', 'That reaction isn’t here.')
    return { status: 200, body: { ok: true } }
  } catch (error) {
    captureException(error, { endpoint: 'reactions.delete' })
    return fail(500, 'failed', 'That didn’t go through. Try again.')
  }
}
