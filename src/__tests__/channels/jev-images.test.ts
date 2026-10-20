import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { askJevImages, CHANNEL_IMAGE_MODEL } from '@/lib/semantic/jev-images'

const posts = () => [
  { id: 'p0', words: 'Synthetic public caption', jpeg: Uint8Array.of(1, 2, 3) },
  { id: 'p1', words: 'Another public caption', jpeg: Uint8Array.of(4, 5, 6) },
]
const questions = {
  name: {
    type: 'choice' as const,
    instructions: 'Pick a topic',
    criteria: { a: 'Cats', b: 'Dogs' },
  },
}
beforeEach(() => {
  vi.stubEnv('TYPESAFE_CHANNEL_IMAGES', 'on')
  vi.stubEnv('TYPESAFE_API_KEY', 'test-only')
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('bounded TypeSafe image transport', () => {
  it('requires a separate opt-in even when a key exists', async () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    vi.stubEnv('TYPESAFE_CHANNEL_IMAGES', 'off')
    await expect(askJevImages(posts(), questions)).rejects.toThrow('disabled')
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('sends the pinned model, one image per opaque reference, timeout and no redirects', async () => {
    const fetcher = vi.fn(async (_url: string, options: RequestInit) => {
      expect(options.redirect).toBe('error')
      expect(options.signal).toBeInstanceOf(AbortSignal)
      expect(options.headers).toMatchObject({ 'TypeSafe-Danger-Zone-Images': 'true' })
      const body = options.body as FormData
      const request = JSON.parse(await (body.get('request') as Blob).text())
      expect(request.model).toBe(CHANNEL_IMAGE_MODEL)
      expect(Object.keys(request.assets)).toHaveLength(2)
      expect(request.state.posts[0]).toMatchObject({ id: 'p0', words: 'Synthetic public caption' })
      expect(request.state.posts[0].image).toMatch(/^[a-f0-9-]{36}$/)
      expect(body.get('image0')).toBeInstanceOf(Blob)
      return Response.json({ answers: { name: { choice: 'a', confidence: 0.9 } } })
    })
    vi.stubGlobal('fetch', fetcher)
    expect((await askJevImages(posts(), questions)).name.choice).toBe('a')
    expect(fetcher).toHaveBeenCalledOnce()
  })
  it('bounds uploads before making a request', async () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    await expect(askJevImages(Array(9).fill(posts()[0]), questions)).rejects.toThrow('budget')
    await expect(
      askJevImages([{ ...posts()[0], jpeg: new Uint8Array(96 * 1024 + 1) }], questions),
    ).rejects.toThrow('budget')
    expect(fetcher).not.toHaveBeenCalled()
  })
  it.each([429, 500])(
    'returns a generic error without provider text and never retries HTTP %s',
    async (status) => {
      const fetcher = vi.fn(async () => new Response('sensitive provider text', { status }))
      vi.stubGlobal('fetch', fetcher)
      await expect(askJevImages(posts(), questions)).rejects.toThrow('provider unavailable')
      expect(fetcher).toHaveBeenCalledOnce()
    },
  )
  it('rejects malformed or oversized replies', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ answers: [] })),
    )
    await expect(askJevImages(posts(), questions)).rejects.toThrow('Invalid')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('x'.repeat(64 * 1024 + 1))),
    )
    await expect(askJevImages(posts(), questions)).rejects.toThrow('budget')
  })
})
