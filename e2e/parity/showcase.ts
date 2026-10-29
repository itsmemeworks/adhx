/**
 * Showcase mode (`PARITY_SHOWCASE=1`): the same people, channels and story as
 * the parity world, but every post wears one of the posts credited on
 * adhx.com (`site/public/media/credits.json`), with its network, author,
 * title and clip. Screenshots of the app taken in this mode can go on the
 * site: nothing in them is a real person or anyone else's post.
 *
 * The media source is built from `site/public/media` into `.out/showcase-media`,
 * laid out like a MEDIA_DIR, and stands in for PARITY_MEDIA_SRC.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { MediaSpec, WorldPost } from './world'

interface Credit {
  id: string
  network: string
  author: string
  postId: string
  title: string
  alt: string
  kind: 'video' | 'photo'
  width: number
  height: number
  video?: string
  poster?: string
}

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '../..')
const SITE_MEDIA = path.join(ROOT, 'site/public/media')
const SITE_AVATARS = path.join(ROOT, 'site/public/avatars')
export const SHOWCASE_MEDIA = path.join(
  process.env.PARITY_OUT_DIR || path.join(HERE, '.out'),
  'showcase-media',
)

export const showcaseEnabled = () => process.env.PARITY_SHOWCASE === '1'

function credits(): Credit[] {
  const raw = JSON.parse(fs.readFileSync(path.join(SITE_MEDIA, 'credits.json'), 'utf8'))
  return raw.posts as Credit[]
}

/** Lays the credited files out as kept media (`video-1.mp4`, `poster.jpg`). */
export async function buildShowcaseMedia(): Promise<void> {
  // Imported here: the store opens the database, which env.ts must not.
  const { postDir } = await import('../../src/lib/keep/store')
  for (const c of credits()) {
    const dir = path.join(SHOWCASE_MEDIA, postDir(c.network, c.id))
    fs.mkdirSync(dir, { recursive: true })
    const copy = (from: string | undefined, to: string) => {
      if (from) fs.copyFileSync(path.join(SITE_MEDIA, from), path.join(dir, to))
    }
    copy(c.video, 'video-1.mp4')
    copy(c.poster, 'poster.jpg')
  }
}

/**
 * Everyone's picture in the showcase and the demo: the drawings adhx.com uses
 * (site/public/avatars, named by username), stored as an uploaded picture.
 */
export async function seedShowcaseAvatars(people: Array<{ id: string; username: string }>) {
  // Imported here: the store opens the database, which env.ts must not.
  const { storeAvatar, AVATAR_SIZE } = await import('../../src/lib/avatar/store')
  const { default: sharp } = await import('sharp')
  for (const p of people) {
    const file = path.join(SITE_AVATARS, `${p.username}.svg`)
    if (!fs.existsSync(file)) continue
    const jpeg = await sharp(fs.readFileSync(file), { density: 300 })
      .resize(AVATAR_SIZE, AVATAR_SIZE)
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 90 })
      .toBuffer()
    await storeAvatar(p.id, jpeg, 'upload')
  }
}

function shapeOf(c: Credit): WorldPost['shape'] {
  const ratio = c.width / c.height
  return ratio > 1.15 ? 'landscape' : ratio < 0.87 ? 'portrait' : 'square'
}

function mediaOf(c: Credit): MediaSpec[] {
  const file = (name: string) => ({ platform: c.network, id: c.id, file: name })
  if (c.kind === 'photo') return [{ slot: 'photo-1', copy: file('poster.jpg') }]
  if (c.video)
    return [
      { slot: 'video-1', copy: file('video-1.mp4') },
      { slot: 'poster', copy: file('poster.jpg') },
    ]
  // A video credited by its still only: a few seconds of that still.
  return [
    { slot: 'video-1', still: file('poster.jpg'), seconds: 6 },
    { slot: 'poster', copy: file('poster.jpg') },
  ]
}

/** Each world post, in order, takes the next credited post (round again after the last). */
export function reskin(posts: WorldPost[]): WorldPost[] {
  const list = credits()
  const used = new Set<string>()
  return posts.map((post, i) => {
    const c = list[i % list.length]
    // Two credits can share a post (two clips of one); ids stay unique and numeric.
    let id = c.postId
    for (let n = 1; used.has(id); n++) id = `${c.postId}${n}`
    used.add(id)
    return {
      ...post,
      platform: c.network,
      id,
      author: c.author,
      authorName: c.author,
      text: `${c.title}\n\n${c.alt}`,
      category: c.kind,
      shape: shapeOf(c),
      media: mediaOf(c),
      speech: undefined,
      screen: undefined,
    }
  })
}

/** Channel names that fit the credited posts (slugs stay, so links still work). */
const NAMES: Record<string, string> = {
  'cats-with-opinions': 'Synths you can play',
  'food-youll-cook-one-day': 'Pixel-art games',
  'kitchen-synths': 'Plugins worth a look',
  'babies-vs-objects': 'Colour and type',
  'space-mostly-control-rooms': 'Knobs and patch cables',
  'the-old-internet': 'Tiny tools for sound',
  'saves-that-are-definitely-a-joke': 'Websites that move',
  'things-you-meant-to-finish': 'Things you meant to try',
}

export function renameChannels<T extends { slug: string; name: string }>(list: T[]): T[] {
  if (!showcaseEnabled()) return list
  return list.map((c) => ({ ...c, name: NAMES[c.slug] ?? c.name }))
}

/**
 * The public demo (`PARITY_DEMO=1`) is led by Sam, not Pete: Pete is a real
 * person. The key stays `pete`, so the world's story is unchanged.
 */
export function demoLead<
  T extends { key: string; id: string; username: string; displayName: string; phones: string[] },
>(people: T[]): T[] {
  if (process.env.PARITY_DEMO !== '1') return people
  return people.map((p) =>
    p.key === 'pete'
      ? { ...p, id: 'u_parity_sam', username: 'sam', displayName: 'Sam', phones: ["Sam's iPhone"] }
      : p,
  )
}
