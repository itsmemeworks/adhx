import { checkRateLimit } from '@/lib/rate-limit'
import { hasSaved, keepLinkOnly, retryPost } from './doing'

const KEY = /^[A-Za-z0-9._~:@-]{1,200}$/
const PLATFORM = /^[a-z]{1,16}$/

type Answer = { status: number; body: Record<string, unknown> }

function postKey(body: unknown): { platform: string; id: string } | null {
  const b = body as { platform?: unknown; id?: unknown } | null
  if (typeof b?.platform !== 'string' || typeof b?.id !== 'string') return null
  if (!PLATFORM.test(b.platform) || !KEY.test(b.id)) return null
  return { platform: b.platform, id: b.id }
}

/** Retry, for someone who saved the post: `{ platform, id }` → `{ retried }`. */
export async function retryAnswer(userId: string, body: unknown): Promise<Answer> {
  const post = postKey(body)
  if (!post) return { status: 400, body: { error: 'Say which post.', code: 'bad_post' } }
  if (!hasSaved(userId, post.platform, post.id)) {
    return {
      status: 403,
      body: { error: 'Only people who saved it can retry it.', code: 'not_saved' },
    }
  }
  const limit = checkRateLimit(`doing:retry:${userId}`, { windowMs: 60_000, max: 30 })
  if (limit.limited) {
    return {
      status: 429,
      body: { error: 'Lots of retries just now. Give it a minute.', code: 'busy' },
    }
  }
  const retried = await retryPost(post.platform, post.id)
  return { status: 200, body: { retried } }
}

/** "Keep the link only", for someone who saved the post: `{ platform, id }` → `{ ok }`. */
export function linkOnlyAnswer(userId: string, body: unknown): Answer {
  const post = postKey(body)
  if (!post) return { status: 400, body: { error: 'Say which post.', code: 'bad_post' } }
  if (!hasSaved(userId, post.platform, post.id)) {
    return {
      status: 403,
      body: { error: 'Only people who saved it can choose that.', code: 'not_saved' },
    }
  }
  if (!keepLinkOnly(post.platform, post.id)) {
    return { status: 409, body: { error: 'That one isn’t stuck any more.', code: 'not_stuck' } }
  }
  return { status: 200, body: { ok: true } }
}
