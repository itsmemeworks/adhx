import { randomUUID } from 'node:crypto'
import { trackServiceCall } from '@/lib/ops/service-calls'
import { extra } from '@/lib/settings/extras'
import type { JevAnswer, JevQuestion } from './jev'

export const CHANNEL_IMAGE_MODEL = 'jev-1.14.0'
export type VisualPost = { id: string; words: string; jpeg: Uint8Array }

/** Explicitly separate from text refinement: a key alone never enables image uploads. */
export function channelImagesEnabled(): boolean {
  return extra('TYPESAFE_CHANNEL_IMAGES') === 'on' && !!extra('TYPESAFE_API_KEY')
}

/** Bounded multipart request; callers supply only eligible public source content. */
export async function askJevImages(
  posts: VisualPost[],
  questions: Record<string, JevQuestion>,
): Promise<Record<string, JevAnswer>> {
  return trackServiceCall('jev', 'channel pictures', () => askImages(posts, questions))
}

async function askImages(
  posts: VisualPost[],
  questions: Record<string, JevQuestion>,
): Promise<Record<string, JevAnswer>> {
  if (!channelImagesEnabled()) throw new Error('Channel image refinement is disabled')
  if (!posts.length || posts.length > 8 || Object.keys(questions).length > 24)
    throw new Error('Channel image request exceeds its budget')
  const body = new FormData()
  const assets: Record<string, { type: string; part: string }> = {}
  const images = posts.map((post, i) => {
    if (post.jpeg.byteLength > 96 * 1024) throw new Error('Channel image exceeds its budget')
    const reference = randomUUID()
    assets[reference] = { type: 'image', part: `image${i}` }
    return { id: post.id, words: post.words.slice(0, 600).toWellFormed(), image: reference }
  })
  body.append(
    'request',
    new Blob(
      [
        JSON.stringify({
          model: CHANNEL_IMAGE_MODEL,
          state: { posts: images },
          assets,
          questions,
        }),
      ],
      { type: 'application/json' },
    ),
  )
  posts.forEach((post, i) =>
    body.append(
      `image${i}`,
      new Blob([new Uint8Array(post.jpeg)], { type: 'image/jpeg' }),
      `image${i}.jpg`,
    ),
  )
  const response = await fetch('https://api.typesafe.ai/v1/systemone', {
    method: 'POST',
    body,
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
    headers: {
      Authorization: `Bearer ${extra('TYPESAFE_API_KEY')}`,
      'TypeSafe-Danger-Zone-Images': 'true',
    },
  })
  if (!response.ok || !response.body) {
    await response.body?.cancel()
    throw new Error('Channel image provider unavailable')
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let bytes = 0
  try {
    for (;;) {
      const part = await reader.read()
      if (part.done) break
      bytes += part.value.byteLength
      if (bytes > 64 * 1024) throw new Error('Channel image response exceeds its budget')
      chunks.push(part.value)
    }
  } finally {
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
  const result = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { answers?: unknown }
  if (!result.answers || typeof result.answers !== 'object' || Array.isArray(result.answers))
    throw new Error('Invalid channel image response')
  return result.answers as Record<string, JevAnswer>
}
