import { countReaction, reactionKind } from '@/lib/admin/counts'
import { hasMoment } from './engine'
import { sendReaction } from './presence'
import { limitReaction, parseReaction, type ReactionError } from '@/lib/reactions/parse'
import { newReactionId, storeLiveReaction } from '@/lib/reactions/post-reactions'

export { REACT_LIMIT, TEXT_LIMIT } from '@/lib/reactions/parse'

/**
 * Send a reaction to the members tuned in to a moment
 * (`POST /api/moments/{slug}/react`, `POST /api/app/live/{slug}/react`):
 * `{ emoji, platform, id }` (one of `REACTION_EMOJI`) or `{ text, platform, id }`
 * (cleaned by `cleanReactionText`, at most 40 characters). Members only (the
 * routes check), rate-limited per person (the same budget as reactions on
 * any post). Relayed to the room and kept on the post (`post_reactions`,
 * same id) so it replays later.
 */

export const SLUG = /^[a-z0-9-]{1,64}$/

export type ReactResult = { ok: true; id: string; at: string } | ReactionError

export async function react(userId: string, slug: string, body: unknown): Promise<ReactResult> {
  const parsed = parseReaction(body)
  if ('ok' in parsed) return parsed
  const { emoji, text, platform, id } = parsed
  const limited = limitReaction(userId, text !== null)
  if (limited) return limited
  if (!SLUG.test(slug) || !(await hasMoment(slug))) {
    return { ok: false, status: 404, code: 'no_moment', error: 'This moment has passed.' }
  }
  // Kept on the post too (best effort: the room still gets it), with the id
  // the room sees, so it replays later for members who can see the post.
  const reactionId = newReactionId()
  const at = new Date().toISOString()
  storeLiveReaction({ id: reactionId, userId, platform, postId: id, emoji, text, at })
  const signal = sendReaction({
    slug,
    userId,
    ...(emoji ? { emoji } : { text: text ?? '' }),
    post: { platform, id },
    id: reactionId,
    at,
  })
  // Counted for admins (who, which kind, which day).
  countReaction(userId, reactionKind(emoji), slug)
  return { ok: true, id: signal.id, at: signal.at }
}
