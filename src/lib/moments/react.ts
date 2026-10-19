import { checkRateLimit } from '@/lib/rate-limit'
import { hasMoment } from './engine'
import { sendReaction } from './presence'
import {
  cleanReactionText,
  MAX_REACTION_TEXT,
  REACTION_EMOJI,
  reactionEmoji,
  reactionTextLength,
} from './reactions'

/**
 * Send a reaction to the members tuned in to a moment
 * (`POST /api/moments/{slug}/react`, `POST /api/app/live/{slug}/react`):
 * `{ emoji, platform, id }` (one of `REACTION_EMOJI`) or `{ text, platform, id }`
 * (cleaned by `cleanReactionText`, at most 40 characters). Members only (the
 * routes check), rate-limited per person, never stored.
 */

export const SLUG = /^[a-z0-9-]{1,64}$/
const PLATFORM = /^[a-z]{1,16}$/
const POST_ID = /^[A-Za-z0-9_-]{1,128}$/
/** Every reaction: a burst is fine (it's a laugh); a stream of them isn't. */
export const REACT_LIMIT = { windowMs: 60_000, max: 20 }
/** Messages, on top: fewer, so the room stays readable. */
export const TEXT_LIMIT = { windowMs: 60_000, max: 6 }

export type ReactResult =
  | { ok: true; id: string; at: string }
  | {
      ok: false
      status: 400 | 404 | 429
      code: 'bad_reaction' | 'bad_text' | 'bad_post' | 'no_moment' | 'busy'
      error: string
      retryAfter?: number
    }

function busy(resetMs: number): ReactResult {
  return {
    ok: false,
    status: 429,
    code: 'busy',
    error: 'Easy there. Try again in a moment.',
    retryAfter: Math.ceil(resetMs / 1000),
  }
}

export async function react(userId: string, slug: string, body: unknown): Promise<ReactResult> {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const hasEmoji = b['emoji'] !== undefined
  const hasText = b['text'] !== undefined
  if (hasEmoji === hasText) {
    return {
      ok: false,
      status: 400,
      code: 'bad_reaction',
      error: 'Send an emoji or a few words.',
    }
  }
  const emoji = hasEmoji ? reactionEmoji(b['emoji']) : null
  if (hasEmoji && !emoji) {
    return {
      ok: false,
      status: 400,
      code: 'bad_reaction',
      error: `emoji must be one of ${REACTION_EMOJI.map((r) => r.emoji).join(' ')}.`,
    }
  }
  const text = hasText && typeof b['text'] === 'string' ? cleanReactionText(b['text']) : ''
  if (hasText && (!text || reactionTextLength(text) > MAX_REACTION_TEXT)) {
    return {
      ok: false,
      status: 400,
      code: 'bad_text',
      error: `Say something in ${MAX_REACTION_TEXT} characters or fewer.`,
    }
  }
  const platform = b['platform']
  const id = b['id']
  if (
    typeof platform !== 'string' ||
    typeof id !== 'string' ||
    !PLATFORM.test(platform) ||
    !POST_ID.test(id)
  ) {
    return { ok: false, status: 400, code: 'bad_post', error: 'Say which post.' }
  }
  const limited = checkRateLimit(`moment-react:${userId}`, REACT_LIMIT)
  if (limited.limited) return busy(limited.resetMs)
  if (hasText) {
    const words = checkRateLimit(`moment-react-text:${userId}`, TEXT_LIMIT)
    if (words.limited) return busy(words.resetMs)
  }
  if (!SLUG.test(slug) || !(await hasMoment(slug))) {
    return { ok: false, status: 404, code: 'no_moment', error: 'This moment has passed.' }
  }
  const signal = sendReaction({
    slug,
    userId,
    ...(emoji ? { emoji } : { text }),
    post: { platform, id },
  })
  return { ok: true, id: signal.id, at: signal.at }
}
