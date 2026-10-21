import { checkRateLimit } from '@/lib/rate-limit'
import {
  cleanReactionText,
  MAX_REACTION_TEXT,
  REACTION_EMOJI,
  reactionEmoji,
  reactionTextLength,
  type ReactionEmoji,
} from '@/lib/moments/reactions'

/**
 * Checking a reaction before it is sent or kept, shared by Live
 * (`src/lib/moments/react.ts`) and the reactions kept on posts
 * (`./post-reactions.ts`): the body, the post, and one per-person budget.
 */

const PLATFORM = /^[a-z]{1,16}$/
const POST_ID = /^[A-Za-z0-9_-]{1,128}$/
/** Every reaction: a burst is fine (it's a laugh); a stream of them isn't. */
export const REACT_LIMIT = { windowMs: 60_000, max: 20 }
/** Messages, on top: fewer, so the room stays readable. */
export const TEXT_LIMIT = { windowMs: 60_000, max: 6 }

export type ReactionError = {
  ok: false
  status: 400 | 404 | 429 | 500
  code: 'bad_reaction' | 'bad_text' | 'bad_post' | 'no_moment' | 'not_found' | 'busy' | 'failed'
  error: string
  retryAfter?: number
}

function busy(resetMs: number): ReactionError {
  return {
    ok: false,
    status: 429,
    code: 'busy',
    error: 'Easy there. Try again in a moment.',
    retryAfter: Math.ceil(resetMs / 1000),
  }
}

export type ParsedReaction = {
  emoji: ReactionEmoji | null
  text: string | null
  platform: string
  id: string
}

/**
 * `{ emoji | text, platform, id }` → the reaction, or what's wrong with it.
 * Shared by Live (`react`) and the reactions kept on posts
 * (`src/lib/reactions/post-reactions.ts`).
 */
export function parseReaction(body: unknown): ParsedReaction | ReactionError {
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
  if (!validReactionPost(platform, id)) {
    return { ok: false, status: 400, code: 'bad_post', error: 'Say which post.' }
  }
  return { emoji, text: hasText ? text : null, platform, id: id as string }
}

/** A post's platform and id, as reactions accept them. */
export function validReactionPost(platform: unknown, id: unknown): platform is string {
  return (
    typeof platform === 'string' &&
    typeof id === 'string' &&
    PLATFORM.test(platform) &&
    POST_ID.test(id)
  )
}

/**
 * The per-person limits, shared by Live and kept reactions (one budget):
 * every reaction, plus words on top. Null when it may go ahead.
 */
export function limitReaction(userId: string, isText: boolean): ReactionError | null {
  const limited = checkRateLimit(`moment-react:${userId}`, REACT_LIMIT)
  if (limited.limited) return busy(limited.resetMs)
  if (isText) {
    const words = checkRateLimit(`moment-react-text:${userId}`, TEXT_LIMIT)
    if (words.limited) return busy(words.resetMs)
  }
  return null
}
