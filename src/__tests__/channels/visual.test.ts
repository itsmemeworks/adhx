import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { sql } from 'drizzle-orm'
import * as schema from '@/lib/db/schema'
import { createTestDb, createTestBookmark, USER_A, USER_B, type TestDbInstance } from '../api/setup'
import {
  applyVisualResult,
  interpretVisualAnswers,
  sampleMembers,
  spaceRepeats,
  type VisualChannel,
} from '@/lib/channels/visual-policy'
import { CHANNEL_NAMES } from '@/lib/channels/names'
import { autoChannelCovers } from '@/lib/channels/channels'
import { setNewWorkPaused } from '@/lib/processing/pause'

let instance: TestDbInstance
vi.mock('@/lib/db', () => ({
  get db() {
    return instance.db
  },
  runInTransaction: <T>(fn: () => T) => instance.sqlite.transaction(fn)(),
}))
import {
  visualChannel,
  visualChannels,
  processVisualChannel,
  prepareChannelImage,
} from '@/lib/channels/visual'

let directory: string
let clock: number
const view = (): VisualChannel => ({
  slug: 'cats',
  name: 'Cats',
  size: 8,
  keys: Array.from({ length: 8 }, (_, i) => `twitter:${i}`),
})
function row(scope = `user:${USER_A}`) {
  return instance.db.get<{
    status: string
    attempts: number
    revision: string
    result: string | null
  }>(sql`SELECT * FROM channel_visual_jobs WHERE scope = ${scope}`)!
}
async function seed(privateIndex = -1) {
  const image = await sharp({
    create: { width: 640, height: 360, channels: 3, background: 'blue' },
  })
    .jpeg()
    .toBuffer()
  await writeFile(path.join(directory, 'poster.jpg'), image)
  for (let i = 0; i < 8; i++) {
    instance.db
      .insert(schema.bookmarks)
      .values(
        createTestBookmark(USER_A, String(i), {
          text: `Public source caption ${i}`,
          isPrivate: i === privateIndex,
          note: 'PRIVATE USER NOTE',
        }),
      )
      .run()
    instance.db
      .insert(schema.keptFiles)
      .values({
        platform: 'twitter',
        postId: String(i),
        slot: 'photo-1',
        path: 'poster.jpg',
        mime: 'image/jpeg',
        bytes: image.length,
        createdAt: '2026-10-20T00:00:00Z',
      })
      .run()
  }
}
beforeEach(async () => {
  instance = createTestDb()
  for (const id of [USER_A, USER_B])
    instance.db
      .insert(schema.users)
      .values({ id, username: id, createdAt: new Date().toISOString() })
      .run()
  directory = await mkdtemp(path.join(os.tmpdir(), 'adhx-visual-test-'))
  vi.stubEnv('MEDIA_DIR', directory)
  vi.stubEnv('TYPESAFE_CHANNEL_IMAGES', 'on')
  vi.stubEnv('TYPESAFE_API_KEY', 'synthetic-test-key')
  clock = Date.parse('2026-10-20T12:00:00Z')
  vi.spyOn(Date, 'now').mockImplementation(() => clock)
})
afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  instance.close()
  await rm(directory, { recursive: true, force: true })
})

describe('visual channel policy', () => {
  it('changes only known names, true borderline members and confident decisions', () => {
    const samples = sampleMembers(view().keys).map((sample) => ({ ...sample, canExclude: true }))
    const result = interpretVisualAnswers(samples, ['Cats', 'Cute animals'], {
      name: { choice: 'n1', confidence: 0.9 },
      fit_p0: { choice: 'off_topic', confidence: 1 },
      fit_p5: { choice: 'off_topic', confidence: 0.6 },
      fit_p6: { choice: 'off_topic', confidence: 0.99 },
      cover_p3: { score: 4, confidence: 0.8 },
      cover_p2: { score: Infinity, confidence: 1 },
      repeat_1: { choice: 'same', confidence: 0.99 },
    })
    expect(result).toEqual({
      name: 'Cute animals',
      excluded: ['twitter:6'],
      covers: ['twitter:3'],
      repeats: [['twitter:0', 'twitter:1']],
    })
    const applied = applyVisualResult(view(), result)
    expect(applied.slug).toBe('cats')
    expect(applied.keys).not.toContain('twitter:6')
    expect(applied.coverKeys![0]).toBe('twitter:3')
    expect(applied.keys.slice(0, 2)).not.toEqual(['twitter:0', 'twitter:1'])
  })
  it('keeps uncertain results, small channels and unobserved private posts', () => {
    const channel = { ...view(), keys: view().keys.slice(0, 4), size: 4 }
    expect(
      applyVisualResult(channel, { excluded: [channel.keys[3]], covers: [], repeats: [] }).keys,
    ).toHaveLength(4)
    expect(
      interpretVisualAnswers(sampleMembers(view().keys), ['Cats'], {
        name: { choice: 'invented', confidence: 1 },
      }).name,
    ).toBeUndefined()
    expect(
      interpretVisualAnswers([{ key: 'tail', id: 'p7', borderline: true }], ['Cats'], {
        fit_p7: { choice: 'off_topic', confidence: 1 },
      }).excluded,
    ).toEqual([])
  })
  it('spaces transitive repeat groups without losing posts and diversifies the cover', () => {
    const keys = ['a', 'b', 'c', 'd', 'e', 'f']
    const repeats = [
      ['a', 'b'],
      ['b', 'c'],
    ]
    const spaced = spaceRepeats(keys, repeats)
    expect(new Set(spaced)).toEqual(new Set(keys))
    expect(spaced.slice(0, 3)).toEqual(['a', 'd', 'e'])
    const refined = applyVisualResult(
      { slug: 'test', name: 'Cats', keys, size: 6 },
      { excluded: [], repeats, covers: ['a', 'c'] },
    )
    expect(refined.coverKeys).toEqual(['a', 'd', 'e', 'f'])
    expect(
      spaceRepeats(
        ['a', 'b', 'b2', 'a2'],
        [
          ['a', 'a2'],
          ['b', 'b2'],
        ],
      ),
    ).toEqual(['a', 'b', 'a2', 'b2'])
  })
  it('accepts a good/excellent score split for a cover while keeping membership conservative', () => {
    const result = interpretVisualAnswers(sampleMembers(view().keys), ['Cats'], {
      cover_p3: { score: 3.38, confidence: 0.5 },
      fit_p7: { choice: 'off_topic', confidence: 0.5 },
    })
    expect(result.covers).toEqual(['twitter:3'])
    expect(result.excluded).toEqual([])
  })
})

describe('durable optional image work', () => {
  it('a key alone enables no image upload or queue; enabling returns immediately before work', async () => {
    await seed()
    vi.stubEnv('TYPESAFE_CHANNEL_IMAGES', '')
    expect(visualChannel(view(), USER_A)).toEqual(view())
    expect(row()).toBeUndefined()
    vi.stubEnv('TYPESAFE_CHANNEL_IMAGES', 'on')
    expect(visualChannel(view(), USER_A)).toEqual(view())
    expect(row().status).toBe('pending')
  })
  it('honours the admin processing pause without claiming jobs or spending budget, then resumes', async () => {
    await seed()
    visualChannel(view(), USER_A)
    const ask = vi.fn().mockResolvedValue({})
    setNewWorkPaused(true)
    await processVisualChannel({ ask })
    expect(ask).not.toHaveBeenCalled()
    expect(row()).toMatchObject({ status: 'pending', attempts: 0 })
    expect(instance.db.all(sql`SELECT * FROM channel_visual_budget`)).toEqual([])
    setNewWorkPaused(false)
    await processVisualChannel({ ask })
    expect(ask).toHaveBeenCalledOnce()
    expect(row()).toMatchObject({ status: 'ready', attempts: 1 })
  })

  it('uses public source words + local images only, with opaque ids and durable cached decisions', async () => {
    await seed(7)
    visualChannel(view(), USER_A)
    const ask = vi.fn(async (posts, _questions) => {
      expect(posts).toHaveLength(7)
      expect(
        JSON.stringify(
          posts.map((p: { id: string; words: string }) => ({ id: p.id, words: p.words })),
        ),
      ).not.toMatch(/user-a|PRIVATE|caption 7|twitter/)
      for (const post of posts) {
        const metadata = await sharp(post.jpeg).metadata()
        expect([metadata.width, metadata.height]).toEqual([448, 448])
      }
      return {
        name: { choice: `n${CHANNEL_NAMES.indexOf('Cute animals')}`, confidence: 1 },
        cover_p3: { score: 4, confidence: 1 },
        fit_p6: { choice: 'off_topic', confidence: 1 },
        repeat_1: { choice: 'same', confidence: 1 },
      }
    })
    await processVisualChannel({ ask })
    expect(row().status).toBe('ready')
    const result = visualChannel(view(), USER_A)
    expect(result.name).toBe('Cute animals')
    expect(result.keys).not.toContain('twitter:6')
    expect(result.keys).toContain('twitter:7')
    expect(result.coverKeys![0]).toBe('twitter:3')
    const covers = await autoChannelCovers(USER_A, [result])
    expect(covers.get('cats')![0].post.id).toBe('3')
    await processVisualChannel({ ask })
    expect(ask).toHaveBeenCalledOnce()
    expect(JSON.stringify(row().result)).not.toContain('jpeg')
    vi.stubEnv('TYPESAFE_CHANNEL_IMAGES', 'off')
    expect(visualChannel(view(), USER_A)).toEqual(view())
  })
  it('fails closed when visibility changes during preparation or an in-flight answer', async () => {
    await seed()
    visualChannel(view(), USER_A)
    let changed = false
    const ask = vi.fn(async () => ({}))
    await processVisualChannel({
      ask,
      prepare: async () => {
        if (!changed) {
          changed = true
          instance.db.run(
            sql`UPDATE bookmarks SET is_private = 1 WHERE id = '0' AND user_id = ${USER_A}`,
          )
        }
        return new Uint8Array([1])
      },
    })
    expect(ask).not.toHaveBeenCalled()
    expect(row().status).toBe('unavailable')
    visualChannel(view(), USER_A)
    clock += 60_001
    await processVisualChannel({
      prepare: async () => new Uint8Array([1]),
      ask: async () => {
        instance.db.run(
          sql`UPDATE bookmarks SET is_private = 1 WHERE id = '1' AND user_id = ${USER_A}`,
        )
        return { name: { choice: 'n0', confidence: 1 } }
      },
    })
    expect(row().status).toBe('unavailable')
    expect(visualChannel(view(), USER_A).name).toBe('Cats')
  })
  it('isolates account caches and removes private work on account deletion', async () => {
    await seed()
    visualChannel(view(), USER_A)
    visualChannel(view(), USER_B)
    await processVisualChannel({
      prepare: async () => new Uint8Array([1]),
      ask: async () => ({ name: { choice: 'n0', confidence: 1 } }),
    })
    expect(row().status).toBe('ready')
    expect(row(`user:${USER_B}`).status).toBe('pending')
    instance.db.run(sql`DELETE FROM users WHERE id = ${USER_A}`)
    expect(row()).toBeUndefined()
    expect(row(`user:${USER_B}`)).toBeDefined()
  })
  it('has persistent retry, per-minute and daily budgets; concurrent drains coalesce', async () => {
    await seed()
    visualChannel(view(), USER_A)
    const ask = vi.fn(async () => {
      throw new Error('synthetic provider unavailable')
    })
    const deps = { ask, prepare: async () => new Uint8Array([1]) }
    await Promise.all([processVisualChannel(deps), processVisualChannel(deps)])
    expect(ask).toHaveBeenCalledOnce()
    expect(row().attempts).toBe(1)
    await processVisualChannel(deps)
    expect(ask).toHaveBeenCalledOnce()
    clock += 5 * 60_000
    await processVisualChannel(deps)
    expect(row().attempts).toBe(2)
    clock += 30 * 60_000
    await processVisualChannel(deps)
    expect(row().status).toBe('unavailable')
    visualChannel(view(), USER_B)
    instance.db.run(sql`UPDATE channel_visual_budget SET requests = 48`)
    clock += 60_001
    await processVisualChannel(deps)
    expect(row(`user:${USER_B}`).attempts).toBe(0)
  })

  it('retries temporarily missing local media without making a cloud request', async () => {
    await seed()
    visualChannel(view(), USER_A)
    const ask = vi.fn(async () => ({}))
    await processVisualChannel({ ask, prepare: async () => null })
    expect(ask).not.toHaveBeenCalled()
    expect(row().status).toBe('pending')
    clock += 5 * 60_000
    await processVisualChannel({ ask, prepare: async () => new Uint8Array([1]) })
    expect(ask).toHaveBeenCalledOnce()
    expect(row().status).toBe('ready')
  })

  it.each(['poster', 'photo-with-video'])(
    'never excludes a whole video based on one still (%s)',
    async (kind) => {
      await seed()
      if (kind === 'poster')
        instance.db.run(sql`UPDATE kept_files SET slot = 'poster' WHERE post_id = '7'`)
      else
        instance.db
          .insert(schema.keptFiles)
          .values({
            platform: 'twitter',
            postId: '7',
            slot: 'video-1',
            path: 'unused.mp4',
            mime: 'video/mp4',
            bytes: 4,
            createdAt: '2026-10-20',
          })
          .run()
      visualChannel(view(), USER_A)
      await processVisualChannel({
        prepare: async () => new Uint8Array([1]),
        ask: async (_posts, questions) => {
          expect(questions.fit_p7).toBeUndefined()
          return { fit_p7: { choice: 'off_topic', confidence: 1 } }
        },
      })
      expect(visualChannel(view(), USER_A).keys).toContain('twitter:7')
      expect(JSON.parse(row().result!).excluded).toEqual([])
    },
  )
  it('recovers a stale running claim and discards stale results after a channel revision', async () => {
    await seed()
    visualChannel(view(), USER_A)
    instance.db.run(
      sql`UPDATE channel_visual_jobs SET status = 'running', attempts = 1, updated_at = ${clock - 61_000}`,
    )
    await processVisualChannel({
      prepare: async () => new Uint8Array([1]),
      ask: async () => {
        visualChannel({ ...view(), keys: [...view().keys].reverse() }, USER_A)
        return { name: { choice: 'n0', confidence: 1 } }
      },
    })
    expect(row().status).toBe('pending')
    expect(row().result).toBeNull()
  })
  it('preserves original files and rejects paths, symlinks, oversized or invalid images', async () => {
    await seed()
    expect(await prepareChannelImage({ file: '../escape.jpg', bytes: 1 })).toBeNull()
    const external = path.join(os.tmpdir(), `adhx-external-${path.basename(directory)}.jpg`)
    await writeFile(external, 'outside')
    try {
      await symlink(external, path.join(directory, 'linked.jpg'))
      expect(await prepareChannelImage({ file: 'linked.jpg', bytes: 7 })).toBeNull()
    } finally {
      await rm(external, { force: true })
    }
    await writeFile(path.join(directory, 'invalid.jpg'), 'invalid')
    expect(await prepareChannelImage({ file: 'invalid.jpg', bytes: 7 })).toBeNull()
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="448" height="448"><image href="file:///etc/passwd"/></svg>'
    await writeFile(path.join(directory, 'vector.jpg'), svg)
    expect(
      await prepareChannelImage({ file: 'vector.jpg', bytes: Buffer.byteLength(svg) }),
    ).toBeNull()
    expect(await prepareChannelImage({ file: 'poster.jpg', bytes: 9 * 1024 * 1024 })).toBeNull()
  })
  it('does not give generated channels conflicting display names', async () => {
    await seed()
    const a = view(),
      b = { ...view(), slug: 'animals', name: 'Cute animals' }
    visualChannels([a, b], USER_A)
    instance.db.run(
      sql`UPDATE channel_visual_jobs SET available_at = ${clock - 1} WHERE slug = 'cats'`,
    )
    await processVisualChannel({
      prepare: async () => new Uint8Array([1]),
      ask: async () => ({
        name: { choice: `n${CHANNEL_NAMES.indexOf('Cute animals')}`, confidence: 1 },
      }),
    })
    expect(visualChannels([a, b], USER_A).map((c) => c.name)).toEqual(['Cats', 'Cute animals'])
  })

  it('never uploads quoted, private-only, hidden or banned-saver source posts', async () => {
    await seed(0)
    instance.db.run(
      sql`UPDATE bookmarks SET source = 'quoted' WHERE id = '1' AND user_id = ${USER_A}`,
    )
    instance.db
      .run(sql`INSERT INTO moderated_posts(platform, bookmark_id, hidden, created_at, created_by)
      VALUES ('twitter', '2', 1, '2026-10-20', ${USER_A})`)
    instance.db
      .insert(schema.bookmarks)
      .values(createTestBookmark(USER_B, '0', { text: 'BANNED CONTENT' }))
      .run()
    instance.db.run(
      sql`INSERT INTO user_bans(user_id, created_at, created_by) VALUES (${USER_B}, '2026-10-20', ${USER_A})`,
    )
    visualChannel(view(), USER_A)
    const ask = vi.fn(async (posts) => {
      expect(posts.map((p: { id: string }) => p.id)).toEqual(['p3', 'p4', 'p5', 'p6', 'p7'])
      expect(JSON.stringify(posts.map((p: { words: string }) => p.words))).not.toMatch(
        /caption [012]|BANNED|PRIVATE/,
      )
      return {}
    })
    await processVisualChannel({ ask, prepare: async () => new Uint8Array([1]) })
    expect(ask).toHaveBeenCalledOnce()
  })

  it('invalidates a completed cache when retained media changes and bounds the total queue', async () => {
    await seed()
    visualChannel(view(), USER_A)
    await processVisualChannel({
      prepare: async () => new Uint8Array([1]),
      ask: async () => ({ name: { choice: 'n0', confidence: 1 } }),
    })
    expect(row().status).toBe('ready')
    instance.db.run(
      sql`UPDATE kept_files SET created_at = 'replacement-version' WHERE post_id = '0'`,
    )
    expect(visualChannel(view(), USER_A).name).toBe('Cats')
    expect(row().status).toBe('pending')
    for (let i = 0; i < 260; i++) visualChannel({ ...view(), slug: `group-${i}` }, USER_A)
    expect(
      instance.db.get<{ n: number }>(sql`SELECT COUNT(*) AS n FROM channel_visual_jobs`)!.n,
    ).toBe(256)
  })
})
